// OmniNinja — VM Sandbox Manager (estilo Manus AI / E2B Firecracker)
// =========================================================================
// Cada task recebe uma "máquina virtual" isolada no Ubuntu, com:
//   - namespace de mount (chroot/proot) — filesystem próprio
//   - namespace de user/pid/net (via unshare) quando disponível
//   - Ubuntu base com Python3, Node, bash, curl, git, pip, etc.
//   - Rede habilitada (acesso à internet para baixar pacotes/APIs)
//   - Workspace persistente por task (arquivos sobrevivem entre comandos)
//
// Arquitetura (3 níveis, do mais forte ao mais leve):
//
//   NÍVEL 3 (Firecracker/KVM): microVM real — não disponível em t3.small
//         (sem nested virtualization). Pulamos este nível.
//
//   NÍVEL 2 (unshare + proot): namespace real do kernel Linux.
//         Requer kernel com CONFIG_USER_NS (Ubuntu 24.04 tem por padrão).
//         Isolamento de PID, mount, net, user. Cada task é um processo
//         isolado que não vê processos do host nem do outras tasks.
//         proot fornece chroot sem precisar de root real dentro do namespace.
//         ESTE É O NÍVEL QUE USAMOS quando disponível.
//
//   NÍVEL 1 (chroot debootstrap): chroot clássico com bind-mount.
//         Isolamento de filesystem apenas. Requer root (que temos via sudo).
//         Fallback quando unshare --user não está disponível.
//
//   NÍVEL 0 (diretório isolado): apenas cwd+HOME por task.
//         Sem isolamento de filesystem/PID. Fallback final.
//         (Este era o comportamento anterior — mantido como último recurso.)
//
// A função detectSandboxLevel() detecta automaticamente o melhor nível
// disponível no momento. O agente não precisa saber qual nível está rodando —
// a interface é a mesma: executeCommand(taskId, cmd).

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// Diretórios
const WORKSPACE_ROOT = process.env.OMNININJA_WORKSPACE_ROOT || '/opt/omnininja/workspaces';
const SANDBOX_BASE = process.env.OMNININJA_SANDBOX_BASE || '/opt/omnininja/sandboxes';
const SANDBOX_IMAGE = process.env.OMNININJA_SANDBOX_IMAGE || '/opt/omnininja/sandbox-base';

export type SandboxLevel = 0 | 1 | 2;

let _detectedLevel: SandboxLevel | null = null;

/**
 * Detecta o nível máximo de isolamento disponível neste host.
 * Cacheia o resultado — não muda durante a execução do processo.
 */
export function detectSandboxLevel(): SandboxLevel {
  if (_detectedLevel !== null) return _detectedLevel;

  // NÍVEL 2: unshare com user namespace + proot
  try {
    const hasUnshare = execSync('which unshare 2>/dev/null', { encoding: 'utf-8' }).trim();
    const hasProot = execSync('which proot 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (hasUnshare && hasProot) {
      // Testa se unshare --user funciona (kernel deve ter CONFIG_USER_NS)
      try {
        execSync('unshare --user --map-root-user true 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
        _detectedLevel = 2;
        console.log('[sandbox] Nível 2 detectado: unshare + proot (isolamento de namespace)');
        return 2;
      } catch {
        // user namespace não disponível, cai para nível 1
      }
    }
  } catch {}

  // NÍVEL 1: chroot (requer sandbox-base com debootstrap)
  if (existsSync(join(SANDBOX_IMAGE, 'bin/bash'))) {
    _detectedLevel = 1;
    console.log('[sandbox] Nível 1 detectado: chroot (isolamento de filesystem)');
    return 1;
  }

  // NÍVEL 0: diretório isolado (fallback)
  _detectedLevel = 0;
  console.log('[sandbox] Nível 0 detectado: diretório isolado (sem chroot/namespace)');
  return 0;
}

/**
 * Cria (ou reutiliza) o sandbox para uma task.
 * Retorna o caminho da raiz do sandbox e o nível usado.
 */
export function getSandbox(taskId: string): { root: string; level: SandboxLevel } {
  const level = detectSandboxLevel();
  const workspace = join(WORKSPACE_ROOT, taskId);

  // Garante o workspace existe (nível 0 — sempre)
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(workspace, 'package.json'),
      JSON.stringify({ name: 'omninja-sandbox', version: '1.0.0', private: true })
    );
  }

  if (level === 0) {
    return { root: workspace, level: 0 };
  }

  // Níveis 1 e 2: cada task tem seu próprio overlay do sandbox-base
  const sandboxDir = join(SANDBOX_BASE, taskId);
  if (!existsSync(sandboxDir)) {
    mkdirSync(sandboxDir, { recursive: true });
  }

  // Se a imagem base existe, prepara o overlay (bind-mount ou cópia leve)
  if (level === 1 && existsSync(SANDBOX_IMAGE)) {
    // Para chroot: precisamos que o sandboxDir tenha uma árvore mínima.
    // Em vez de copiar tudo (caro), usamos bind-mount via setup runtime.
    // Aqui só garantimos que /workspace dentro do sandbox aponta para o workspace real.
    const wsInSandbox = join(sandboxDir, 'workspace');
    if (!existsSync(wsInSandbox)) {
      try {
        execSync(`ln -sf "${workspace}" "${wsInSandbox}"`, { stdio: 'ignore' });
      } catch {}
    }
  }

  if (level === 2 && existsSync(SANDBOX_IMAGE)) {
    // proot: monta o sandbox-base como raiz com --rootfs
    // O workspace é bind via proot -b
    // Nada a preparar aqui — proot faz tudo em runtime.
  }

  return { root: sandboxDir, level };
}

/**
 * Constrói o comando wrapper que executa `cmd` DENTRO do sandbox isolado.
 */
function wrapCommand(taskId: string, cmd: string, sandbox: { root: string; level: SandboxLevel }): string {
  const { root, level } = sandbox;
  const workspace = join(WORKSPACE_ROOT, taskId);

  if (level === 2 && existsSync(SANDBOX_IMAGE)) {
    // NÍVEL 2: unshare + proot
    // unshare cria namespaces isolados; proot faz chroot sem root real.
    // -b bind-mount do workspace em /workspace dentro do sandbox
    // --rootfs aponta para a imagem base (Ubuntu com Python/Node/etc.)
    const prootCmd = [
      'proot',
      `-r "${SANDBOX_IMAGE}"`,
      `-b "${workspace}:/workspace"`,
      `-b /dev:/dev`,
      `-b /proc:/proc`,
      `-b /sys:/sys`,
      `-b /etc/resolv.conf:/etc/resolv.conf`,
      `--cwd /workspace`,
      `-- /bin/bash -lc ${shellQuote(cmd)}`,
    ].join(' ');
    return `unshare --user --map-root-user --pid --mount --net --fork ${prootCmd}`;
  }

  if (level === 1 && existsSync(SANDBOX_IMAGE)) {
    // NÍVEL 1: chroot clássico (requer root)
    // Bind-mount do workspace dentro do chroot
    const chrootDir = root;
    // Garante bind-mount do workspace (idempotente)
    const wsMount = join(chrootDir, 'workspace');
    if (!existsSync(wsMount)) {
      mkdirSync(wsMount, { recursive: true });
    }
    // Tenta bind-mount (ignora se já montado ou falhar)
    execSync(`mount --bind "${workspace}" "${wsMount}" 2>/dev/null || true`, { stdio: 'ignore' });
    // Executa dentro do chroot
    return `chroot "${SANDBOX_IMAGE}" /bin/bash -lc ${shellQuote(`cd /workspace && ${cmd}`)}`;
  }

  // NÍVEL 0: executa no workspace diretamente
  return cmd;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export interface SandboxResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxLevel: SandboxLevel;
}

/**
 * Executa um comando DENTRO do sandbox isolado da task.
 * Este é o coração do sistema VM — igual ao Manus AI, cada task
 * roda numa "máquina virtual" separada.
 */
export async function executeInSandbox(
  taskId: string,
  cmd: string,
  timeoutMs = 60000
): Promise<SandboxResult> {
  const sandbox = getSandbox(taskId);
  const wrappedCmd = wrapCommand(taskId, cmd, sandbox);
  const cwd = sandbox.level === 0 ? join(WORKSPACE_ROOT, taskId) : process.cwd();

  try {
    const { stdout, stderr } = await execAsync(wrappedCmd, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        HOME: sandbox.level === 0 ? join(WORKSPACE_ROOT, taskId) : '/root',
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        TERM: 'xterm-256color',
      },
    });
    return {
      cmd,
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 8000),
      exitCode: 0,
      sandboxLevel: sandbox.level,
    };
  } catch (err: any) {
    return {
      cmd,
      stdout: (err.stdout ?? '').slice(0, 20000),
      stderr: (err.stderr ?? err.message ?? '').slice(0, 8000),
      exitCode: err.code ?? 1,
      sandboxLevel: sandbox.level,
    };
  }
}

/**
 * Escreve um arquivo no workspace da task (com path traversal blocking).
 */
export function sandboxFileWrite(taskId: string, path: string, content: string): { path: string; bytes: number } {
  const workspace = join(WORKSPACE_ROOT, taskId);
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }
  const safePath = join(workspace, path.replace(/^\//, ''));
  const rel = safePath.slice(workspace.length);
  if (rel.startsWith('..')) throw new Error('path traversal bloqueado');
  mkdirSync(join(safePath, '..'), { recursive: true });
  writeFileSync(safePath, content);
  return { path: safePath, bytes: content.length };
}

/**
 * Lê um arquivo do workspace da task.
 */
export function sandboxFileRead(taskId: string, path: string): string {
  const workspace = join(WORKSPACE_ROOT, taskId);
  const safePath = join(workspace, path.replace(/^\//, ''));
  try {
    return readFileSync(safePath, 'utf-8').slice(0, 30000);
  } catch {
    return `Error: file not found: ${path}`;
  }
}

/**
 * Lista arquivos no workspace da task.
 */
export async function sandboxListFiles(taskId: string): Promise<string[]> {
  const workspace = join(WORKSPACE_ROOT, taskId);
  try {
    const { stdout } = await execAsync('find . -type f 2>/dev/null | head -100', { cwd: workspace });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Limpa o sandbox da task (remove workspace e overlay).
 */
export function cleanupSandbox(taskId: string) {
  const workspace = join(WORKSPACE_ROOT, taskId);
  if (existsSync(workspace)) {
    rmSync(workspace, { recursive: true, force: true });
  }
  const sandboxDir = join(SANDBOX_BASE, taskId);
  if (existsSync(sandboxDir)) {
    // Tenta desmontar antes de remover (se houver bind-mount)
    try {
      execSync(`umount "${join(sandboxDir, 'workspace')}" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

/**
 * Verifica a saúde do sistema de sandbox (para diagnóstico).
 */
export function sandboxHealth(): {
  level: SandboxLevel;
  levelName: string;
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
    levelName: level === 2 ? 'namespace+proot' : level === 1 ? 'chroot' : 'directory',
    hasUnshare,
    hasProot,
    hasBaseImage: existsSync(join(SANDBOX_IMAGE, 'bin/bash')),
    workspaceRoot: WORKSPACE_ROOT,
    sandboxBase: SANDBOX_BASE,
    baseImage: SANDBOX_IMAGE,
  };
}
