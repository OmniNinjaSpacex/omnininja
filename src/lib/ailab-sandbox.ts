// OmniNinja — remote AI Lab sandbox provider.
//
// AI Lab exposes authenticated REST container lifecycle APIs and an authenticated
// WebSocket PTY. We use one AI Lab container per OmniNinja task and keep every
// shell/file operation inside that same container workspace.
//
// SECURITY: AI Lab's default containers are privileged LXD containers. They are
// useful isolation from the web app host, but they are NOT classified here as a
// hard sandbox for hostile code. This provider never falls back to local host
// execution when the remote service is unavailable.

import { randomBytes } from 'crypto';
import { posix as pathPosix } from 'path';

const DEFAULT_WORKSPACE = '.omnininja-workspace';
const DEFAULT_PROVISION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TERMINAL_BUFFER = 3 * 1024 * 1024;

const provisionLocks = new Map<string, Promise<string>>();

type AilabContainer = {
  name?: string;
  status?: string;
};

export interface AilabSandboxResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  provider: 'ailab';
  container: string;
}

function providerSelected(): boolean {
  return (process.env.OMNININJA_SANDBOX_PROVIDER || '').trim().toLowerCase() === 'ailab';
}

function baseUrl(): string {
  const configured = (process.env.AILAB_BASE_URL || '').trim();
  if (!configured) return '';

  const parsed = new URL(configured);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AILAB_BASE_URL precisa usar HTTP ou HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('AILAB_BASE_URL não pode conter credenciais');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('AILAB_BASE_URL precisa usar HTTPS em produção');
  }
  return parsed.toString().replace(/\/$/, '');
}

function apiToken(): string {
  return (process.env.AILAB_API_TOKEN || '').trim();
}

function workspaceName(): string {
  const configured = (process.env.OMNININJA_AILAB_WORKSPACE || DEFAULT_WORKSPACE).trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(configured)) return DEFAULT_WORKSPACE;
  return configured;
}

export function ailabConfigured(): boolean {
  try {
    return providerSelected() && Boolean(baseUrl()) && Boolean(apiToken());
  } catch {
    return false;
  }
}

export function ailabContainerName(taskId: string): string {
  const safe = String(taskId || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!safe) throw new Error('taskId inválido para AI Lab');
  return `omni-${safe}`;
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = apiToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const base = baseUrl();
  if (!base) throw new Error('AILAB_BASE_URL não configurada');
  if (!apiToken()) throw new Error('AILAB_API_TOKEN não configurado');

  return fetch(`${base}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
    cache: 'no-store',
    signal: AbortSignal.timeout(Math.max(1000, timeoutMs)),
  });
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text);
    return payload?.detail || payload?.error || text;
  } catch {
    return text.slice(0, 1000);
  }
}

async function waitForCreateSse(response: Response): Promise<void> {
  if (!response.ok) throw new Error(`AI Lab create: ${await readError(response)}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI Lab create: resposta SSE sem body');

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event?.type === 'error') {
          throw new Error(`AI Lab provisioning: ${event?.msg || 'erro desconhecido'}`);
        }
        if (event?.type === 'done') return;
      } catch (error: any) {
        if (String(error?.message || '').startsWith('AI Lab provisioning:')) throw error;
      }
    }
  }
  throw new Error('AI Lab provisioning terminou sem evento done');
}

async function getContainer(name: string): Promise<AilabContainer | null> {
  const response = await apiFetch(`/api/containers/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`AI Lab container: ${await readError(response)}`);
  return (await response.json()) as AilabContainer;
}

async function provisionContainer(taskId: string): Promise<string> {
  const name = ailabContainerName(taskId);
  let container = await getContainer(name);

  if (!container) {
    const response = await apiFetch(
      '/api/containers/create',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          packages: [],
          extra_ports: [],
          username: null,
        }),
      },
      Number(process.env.AILAB_PROVISION_TIMEOUT_MS || DEFAULT_PROVISION_TIMEOUT_MS),
    );
    await waitForCreateSse(response);
    container = await getContainer(name);
  }

  if (!container) throw new Error(`AI Lab não confirmou o container ${name}`);

  if (String(container.status || '').toLowerCase() !== 'running') {
    const response = await apiFetch(
      `/api/containers/${encodeURIComponent(name)}/start`,
      { method: 'POST' },
      60_000,
    );
    if (!response.ok) throw new Error(`AI Lab start: ${await readError(response)}`);
  }

  return name;
}

export async function ensureAilabContainer(taskId: string): Promise<string> {
  const key = ailabContainerName(taskId);
  const existing = provisionLocks.get(key);
  if (existing) return existing;

  const pending = provisionContainer(taskId).finally(() => provisionLocks.delete(key));
  provisionLocks.set(key, pending);
  return pending;
}

function websocketUrl(container: string): string {
  const base = baseUrl();
  const parsed = new URL(base);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/api/ws/shell/${encodeURIComponent(container)}`;
  parsed.search = '';
  parsed.hash = '';
  parsed.searchParams.set('token', apiToken());
  return parsed.toString();
}

function stripTerminalNoise(value: string): string {
  return value
    // CSI / color / cursor controls.
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // OSC sequences.
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\r/g, '')
    .trim();
}

async function dataToText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new TextDecoder().decode(new Uint8Array(await data.arrayBuffer()));
  }
  return String(data ?? '');
}

function boundedTimeout(timeoutMs: number): number {
  return Math.max(1000, Math.min(Number(timeoutMs) || 60_000, MAX_COMMAND_TIMEOUT_MS));
}

export async function executeInAilab(
  taskId: string,
  cmd: string,
  timeoutMs = 60_000,
): Promise<AilabSandboxResult> {
  if (!ailabConfigured()) {
    return {
      cmd,
      stdout: '',
      stderr: 'AI Lab sandbox selecionado, mas AILAB_BASE_URL/AILAB_API_TOKEN não estão configurados.',
      exitCode: 126,
      provider: 'ailab',
      container: ailabContainerName(taskId),
    };
  }

  const container = await ensureAilabContainer(taskId);
  const nonce = randomBytes(12).toString('hex');
  const startMarker = `__OMNININJA_START_${nonce}__`;
  const endMarker = `__OMNININJA_END_${nonce}__`;
  const encoded = Buffer.from(String(cmd || ''), 'utf8').toString('base64');
  const workspace = workspaceName();
  const wrapped = [
    `mkdir -p "$HOME/${workspace}"`,
    `cd "$HOME/${workspace}"`,
    `printf '\\n${startMarker}\\n'`,
    `printf '%s' '${encoded}' | base64 -d | /bin/bash`,
    'rc=$?',
    `printf '\\n${endMarker}:%s\\n' "$rc"`,
    'exit',
  ].join('; ') + '\n';

  return new Promise<AilabSandboxResult>((resolve) => {
    let settled = false;
    let output = '';
    const ws = new WebSocket(websocketUrl(container));
    ws.binaryType = 'arraybuffer';

    const finish = (result: AilabSandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve(result);
    };

    const inspect = () => {
      const regex = new RegExp(`${endMarker}:(-?\\d+)`);
      const match = regex.exec(output);
      if (!match) return;
      const endIndex = match.index;
      const startIndex = output.lastIndexOf(startMarker, endIndex);
      const captured = startIndex >= 0
        ? output.slice(startIndex + startMarker.length, endIndex)
        : output.slice(0, endIndex);
      finish({
        cmd,
        stdout: stripTerminalNoise(captured).slice(0, 20_000),
        stderr: '',
        exitCode: Number(match[1]) || 0,
        provider: 'ailab',
        container,
      });
    };

    const timer = setTimeout(() => {
      finish({
        cmd,
        stdout: stripTerminalNoise(output).slice(-20_000),
        stderr: `AI Lab shell excedeu o timeout de ${boundedTimeout(timeoutMs)} ms`,
        exitCode: 124,
        provider: 'ailab',
        container,
      });
    }, boundedTimeout(timeoutMs));

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: 'resize', cols: 160, rows: 48 }));
        ws.send(new TextEncoder().encode(wrapped));
      } catch (error: any) {
        finish({
          cmd,
          stdout: '',
          stderr: `AI Lab WebSocket: ${error?.message || String(error)}`,
          exitCode: 126,
          provider: 'ailab',
          container,
        });
      }
    };

    ws.onmessage = async (event) => {
      try {
        output += await dataToText(event.data);
        if (output.length > MAX_TERMINAL_BUFFER) {
          finish({
            cmd,
            stdout: stripTerminalNoise(output.slice(-20_000)),
            stderr: 'AI Lab shell excedeu o limite de saída permitido.',
            exitCode: 125,
            provider: 'ailab',
            container,
          });
          return;
        }
        inspect();
      } catch (error: any) {
        finish({
          cmd,
          stdout: stripTerminalNoise(output).slice(-20_000),
          stderr: `AI Lab shell decode: ${error?.message || String(error)}`,
          exitCode: 126,
          provider: 'ailab',
          container,
        });
      }
    };

    ws.onerror = () => {
      finish({
        cmd,
        stdout: stripTerminalNoise(output).slice(-20_000),
        stderr: 'Falha na conexão WebSocket com o AI Lab.',
        exitCode: 126,
        provider: 'ailab',
        container,
      });
    };

    ws.onclose = () => {
      if (!settled) {
        finish({
          cmd,
          stdout: stripTerminalNoise(output).slice(-20_000),
          stderr: 'AI Lab fechou o terminal antes de confirmar o código de saída.',
          exitCode: 126,
          provider: 'ailab',
          container,
        });
      }
    };
  });
}

function safeRelativePath(path: string): string {
  const raw = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = pathPosix.normalize(raw || '.');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error('path inválido ou fora do workspace');
  }
  return normalized;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function ailabFileWrite(
  taskId: string,
  path: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const safePath = safeRelativePath(path);
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const result = await executeInAilab(
    taskId,
    `mkdir -p -- "$(dirname -- ${shellQuote(safePath)})" && printf '%s' ${shellQuote(encoded)} | base64 -d > ${shellQuote(safePath)}`,
  );
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || 'AI Lab file_write falhou');
  return { path: safePath, bytes: Buffer.byteLength(content, 'utf8') };
}

export async function ailabFileRead(taskId: string, path: string): Promise<string> {
  const safePath = safeRelativePath(path);
  const result = await executeInAilab(taskId, `cat -- ${shellQuote(safePath)}`);
  if (result.exitCode !== 0) return `Error: file not found: ${path}`;
  return result.stdout.slice(0, 30_000);
}

export async function ailabListFiles(taskId: string): Promise<string[]> {
  const result = await executeInAilab(
    taskId,
    "find . -type f -print 2>/dev/null | sed 's#^\\./##' | head -100",
  );
  if (result.exitCode !== 0) return [];
  return result.stdout.split('\n').map((x) => x.trim()).filter(Boolean);
}

export async function ailabFileDelete(taskId: string, path: string): Promise<boolean> {
  try {
    const safePath = safeRelativePath(path);
    const result = await executeInAilab(taskId, `rm -f -- ${shellQuote(safePath)}`);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function cleanupAilabContainer(taskId: string): Promise<void> {
  if (!ailabConfigured()) return;
  const name = ailabContainerName(taskId);
  const response = await apiFetch(`/api/containers/${encodeURIComponent(name)}`, { method: 'DELETE' }, 60_000);
  if (!response.ok && response.status !== 404) {
    throw new Error(`AI Lab cleanup: ${await readError(response)}`);
  }
}

export async function ailabHealth(): Promise<{
  provider: 'ailab';
  selected: boolean;
  configured: boolean;
  reachable: boolean;
  productionSafe: false;
  securityModel: string;
  error?: string;
}> {
  const selected = providerSelected();
  const configured = ailabConfigured();
  if (!configured) {
    return {
      provider: 'ailab',
      selected,
      configured: false,
      reachable: false,
      productionSafe: false,
      securityModel: 'privileged-lxd-isolation-not-hard-sandbox',
      error: selected ? 'AILAB_BASE_URL/AILAB_API_TOKEN ausentes' : undefined,
    };
  }

  try {
    const response = await apiFetch('/api/containers', {}, 10_000);
    if (!response.ok) {
      return {
        provider: 'ailab',
        selected,
        configured,
        reachable: false,
        productionSafe: false,
        securityModel: 'privileged-lxd-isolation-not-hard-sandbox',
        error: await readError(response),
      };
    }
    return {
      provider: 'ailab',
      selected,
      configured,
      reachable: true,
      productionSafe: false,
      securityModel: 'privileged-lxd-isolation-not-hard-sandbox',
    };
  } catch (error: any) {
    return {
      provider: 'ailab',
      selected,
      configured,
      reachable: false,
      productionSafe: false,
      securityModel: 'privileged-lxd-isolation-not-hard-sandbox',
      error: error?.message || String(error),
    };
  }
}
