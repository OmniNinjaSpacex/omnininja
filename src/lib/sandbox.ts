// OmniNinja — secure task sandbox manager
// Real shell execution is allowed in production only when kernel namespace
// isolation (level 2: unshare + proot) is available. We never silently fall
// back to executing arbitrary Agent commands directly on the production host.

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

const execAsync = promisify(exec);

const WORKSPACE_ROOT = process.env.OMNININJA_WORKSPACE_ROOT || '/opt/omnininja/workspaces';
const SANDBOX_BASE = process.env.OMNININJA_SANDBOX_BASE || '/opt/omnininja/sandboxes';
const SANDBOX_IMAGE = process.env.OMNININJA_SANDBOX_IMAGE || '/opt/omnininja/sandbox-base';

export type SandboxLevel = 0 | 1 | 2;

let detectedLevel: SandboxLevel | null = null;

function safeTaskId(taskId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(taskId)) {
    throw new Error('taskId inválido');
  }
  return taskId;
}

function workspaceFor(taskId: string): string {
  return resolve(WORKSPACE_ROOT, safeTaskId(taskId));
}

function sandboxDirFor(taskId: string): string {
  return resolve(SANDBOX_BASE, safeTaskId(taskId));
}

/** Resolve a user-controlled relative path and guarantee it stays in workspace. */
export function resolveWorkspacePath(taskId: string, path: string): string {
  const workspace = workspaceFor(taskId);
  const relativePath = String(path || '').replace(/^[\\/]+/, '');
  const candidate = resolve(workspace, relativePath || '.');

  if (candidate !== workspace && !candidate.startsWith(workspace + sep)) {
    throw new Error('path traversal bloqueado');
  }
  return candidate;
}

/** Detect the strongest local isolation available on this host. */
export function detectSandboxLevel(): SandboxLevel {
  if (detectedLevel !== null) return detectedLevel;

  try {
    const hasUnshare = execSync('which unshare 2>/dev/null', { encoding: 'utf-8' }).trim();
    const hasProot = execSync('which proot 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (hasUnshare && hasProot && existsSync(join(SANDBOX_IMAGE, 'bin/bash'))) {
      try {
        execSync('unshare --user --map-root-user true 2>/dev/null', {
          encoding: 'utf-8',
          timeout: 5000,
        });
        detectedLevel = 2;
        return 2;
      } catch {
        // Continue to weaker development-only levels.
      }
    }
  } catch {}

  if (existsSync(join(SANDBOX_IMAGE, 'bin/bash'))) {
    detectedLevel = 1;
    return 1;
  }

  detectedLevel = 0;
  return 0;
}

function ensureWorkspace(taskId: string): string {
  const workspace = workspaceFor(taskId);
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(workspace, 'package.json'),
      JSON.stringify({ name: 'omninja-sandbox', version: '1.0.0', private: true }),
    );
  }
  return workspace;
}

export function getSandbox(taskId: string): { root: string; level: SandboxLevel } {
  const level = detectSandboxLevel();
  const workspace = ensureWorkspace(taskId);

  if (level === 0) return { root: workspace, level };

  const sandboxDir = sandboxDirFor(taskId);
  if (!existsSync(sandboxDir)) mkdirSync(sandboxDir, { recursive: true });

  return { root: sandboxDir, level };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function wrapCommand(taskId: string, cmd: string, sandbox: { root: string; level: SandboxLevel }): string {
  const workspace = workspaceFor(taskId);

  if (sandbox.level === 2 && existsSync(SANDBOX_IMAGE)) {
    const prootCmd = [
      'proot',
      `-r ${shellQuote(SANDBOX_IMAGE)}`,
      `-b ${shellQuote(`${workspace}:/workspace`)}`,
      '-b /dev:/dev',
      '-b /proc:/proc',
      '-b /etc/resolv.conf:/etc/resolv.conf',
      '--cwd /workspace',
      `-- /bin/bash -lc ${shellQuote(cmd)}`,
    ].join(' ');

    // Default: isolate network too. A dedicated production sandbox host may
    // explicitly allow outbound networking while stronger egress controls are
    // configured there.
    const networkFlag = process.env.OMNININJA_SANDBOX_ALLOW_NETWORK === 'true' ? '' : '--net';
    return `unshare --user --map-root-user --pid --mount ${networkFlag} --fork ${prootCmd}`;
  }

  if (sandbox.level === 1 && existsSync(SANDBOX_IMAGE)) {
    // Development-only fallback. Production execution is blocked below because
    // a shared chroot is not sufficient tenant isolation for public users.
    return `chroot ${shellQuote(SANDBOX_IMAGE)} /bin/bash -lc ${shellQuote(`cd /workspace && ${cmd}`)}`;
  }

  return cmd;
}

function safeChildEnv(taskId: string, level: SandboxLevel): NodeJS.ProcessEnv {
  const workspace = ensureWorkspace(taskId);
  const tmp = resolveWorkspacePath(taskId, '.tmp');
  if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });

  // Intentionally DO NOT spread process.env here. API keys, database URLs,
  // cookies, cloud credentials and deployment secrets must never enter Agent
  // shell processes.
  return {
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: level === 0 ? workspace : '/root',
    TERM: 'xterm-256color',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TMPDIR: level === 0 ? tmp : '/tmp',
    NODE_ENV: 'production',
    CI: '1',
  };
}

export interface SandboxResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxLevel: SandboxLevel;
}

export async function executeInSandbox(
  taskId: string,
  cmd: string,
  timeoutMs = 60000,
): Promise<SandboxResult> {
  const sandbox = getSandbox(taskId);

  // Public production users must never get arbitrary host-shell execution.
  if (process.env.NODE_ENV === 'production' && sandbox.level < 2) {
    return {
      cmd,
      stdout: '',
      stderr:
        'Secure sandbox unavailable on this host. Shell execution was blocked instead of falling back to the production server.',
      exitCode: 126,
      sandboxLevel: sandbox.level,
    };
  }

  const wrappedCmd = wrapCommand(taskId, cmd, sandbox);
  const cwd = sandbox.level === 0 ? workspaceFor(taskId) : process.cwd();
  const safeTimeout = Math.max(1000, Math.min(Number(timeoutMs) || 60000, 10 * 60 * 1000));

  try {
    const { stdout, stderr } = await execAsync(wrappedCmd, {
      cwd,
      timeout: safeTimeout,
      maxBuffer: 2 * 1024 * 1024,
      env: safeChildEnv(taskId, sandbox.level),
    });

    return {
      cmd,
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 8000),
      exitCode: 0,
      sandboxLevel: sandbox.level,
    };
  } catch (error: any) {
    return {
      cmd,
      stdout: String(error?.stdout ?? '').slice(0, 20000),
      stderr: String(error?.stderr ?? error?.message ?? '').slice(0, 8000),
      exitCode: typeof error?.code === 'number' ? error.code : 1,
      sandboxLevel: sandbox.level,
    };
  }
}

export function sandboxFileWrite(
  taskId: string,
  path: string,
  content: string,
): { path: string; bytes: number } {
  ensureWorkspace(taskId);
  const safePath = resolveWorkspacePath(taskId, path);
  mkdirSync(dirname(safePath), { recursive: true });
  writeFileSync(safePath, content, 'utf-8');
  return { path: safePath, bytes: Buffer.byteLength(content, 'utf-8') };
}

export function sandboxFileRead(taskId: string, path: string): string {
  ensureWorkspace(taskId);
  let safePath: string;
  try {
    safePath = resolveWorkspacePath(taskId, path);
  } catch (error: any) {
    return `Error: ${error?.message || 'path inválido'}`;
  }

  try {
    return readFileSync(safePath, 'utf-8').slice(0, 30000);
  } catch {
    return `Error: file not found: ${path}`;
  }
}

export async function sandboxListFiles(taskId: string): Promise<string[]> {
  const workspace = ensureWorkspace(taskId);
  try {
    const { stdout } = await execAsync('find . -type f -print 2>/dev/null | head -100', {
      cwd: workspace,
      timeout: 10000,
      env: safeChildEnv(taskId, 0),
    });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function cleanupSandbox(taskId: string) {
  const workspace = workspaceFor(taskId);
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });

  const sandboxDir = sandboxDirFor(taskId);
  if (existsSync(sandboxDir)) rmSync(sandboxDir, { recursive: true, force: true });
}

export function sandboxHealth(): {
  level: SandboxLevel;
  levelName: string;
  productionSafe: boolean;
  hasUnshare: boolean;
  hasProot: boolean;
  hasBaseImage: boolean;
  workspaceRoot: string;
  sandboxBase: string;
  baseImage: string;
} {
  let hasUnshare = false;
  let hasProot = false;

  try {
    execSync('which unshare', { stdio: 'ignore' });
    hasUnshare = true;
  } catch {}
  try {
    execSync('which proot', { stdio: 'ignore' });
    hasProot = true;
  } catch {}

  const level = detectSandboxLevel();
  return {
    level,
    levelName: level === 2 ? 'namespace+proot' : level === 1 ? 'chroot-development-only' : 'directory-development-only',
    productionSafe: level === 2,
    hasUnshare,
    hasProot,
    hasBaseImage: existsSync(join(SANDBOX_IMAGE, 'bin/bash')),
    workspaceRoot: WORKSPACE_ROOT,
    sandboxBase: SANDBOX_BASE,
    baseImage: SANDBOX_IMAGE,
  };
}
