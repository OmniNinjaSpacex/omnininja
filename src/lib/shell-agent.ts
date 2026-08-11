// OmniNinja — shell/files facade for sandbox providers.
//
// local: existing namespace+proot sandbox (production only at level 2)
// ailab: authenticated remote AI Lab/LXD container per task
// disabled: fail closed

import { unlinkSync } from 'fs';
import {
  executeInSandbox,
  sandboxFileWrite,
  sandboxFileRead,
  sandboxListFiles,
  cleanupSandbox,
  detectSandboxLevel,
  resolveWorkspacePath,
  type SandboxLevel,
} from './sandbox';
import {
  ailabConfigured,
  executeInAilab,
  ailabFileWrite,
  ailabFileRead,
  ailabListFiles,
  ailabFileDelete,
  cleanupAilabContainer,
} from './ailab-sandbox';
import { finalizeAilabTask } from './ailab-lifecycle';

export type SandboxProvider = 'local' | 'ailab' | 'disabled';

export interface ShellResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxLevel?: SandboxLevel;
  sandboxProvider?: SandboxProvider;
  sandboxContainer?: string;
}

export function getSandboxProvider(): SandboxProvider {
  const configured = (process.env.OMNININJA_SANDBOX_PROVIDER || 'local').trim().toLowerCase();
  if (configured === 'ailab') return 'ailab';
  if (configured === 'disabled') return 'disabled';
  return 'local';
}

function requireSafeLocalSandbox(): void {
  if (process.env.NODE_ENV === 'production' && detectSandboxLevel() < 2) {
    throw new Error('Ambiente de execução seguro indisponível; operação bloqueada.');
  }
}

export async function shellExec(
  taskId: string,
  cmd: string,
  timeoutMs = 60000,
): Promise<ShellResult> {
  if (Buffer.byteLength(cmd, 'utf8') > 100_000) {
    return {
      cmd: '',
      stdout: '',
      stderr: 'Comando excede o limite permitido.',
      exitCode: 126,
      sandboxProvider: 'disabled',
    };
  }
  const provider = getSandboxProvider();

  if (provider === 'disabled') {
    return {
      cmd,
      stdout: '',
      stderr: 'Shell desativado por OMNININJA_SANDBOX_PROVIDER=disabled.',
      exitCode: 126,
      sandboxProvider: 'disabled',
    };
  }

  if (provider === 'ailab') {
    const result = await executeInAilab(taskId, cmd, timeoutMs);
    return {
      cmd: result.cmd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      sandboxProvider: 'ailab',
      sandboxContainer: result.container,
    };
  }

  const result = await executeInSandbox(taskId, cmd, timeoutMs);
  return {
    cmd: result.cmd,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    sandboxLevel: result.sandboxLevel,
    sandboxProvider: 'local',
  };
}

export async function fileWrite(
  taskId: string,
  path: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('Arquivo excede o limite de 2 MB por operação.');
  }
  const provider = getSandboxProvider();
  if (provider === 'ailab') return ailabFileWrite(taskId, path, content);
  if (provider === 'disabled') throw new Error('Filesystem sandbox desativado');
  requireSafeLocalSandbox();
  return sandboxFileWrite(taskId, path, content);
}

export async function fileRead(taskId: string, path: string): Promise<string> {
  const provider = getSandboxProvider();
  if (provider === 'ailab') return ailabFileRead(taskId, path);
  if (provider === 'disabled') throw new Error('Filesystem sandbox desativado');
  requireSafeLocalSandbox();
  return sandboxFileRead(taskId, path);
}

export async function fileDelete(taskId: string, path: string): Promise<boolean> {
  const provider = getSandboxProvider();
  if (provider === 'ailab') return ailabFileDelete(taskId, path);
  if (provider === 'disabled') return false;
  requireSafeLocalSandbox();

  let safePath: string;
  try {
    safePath = resolveWorkspacePath(taskId, path);
  } catch {
    return false;
  }

  try {
    unlinkSync(safePath);
    return true;
  } catch {
    return false;
  }
}

/** Explicit destructive cleanup, used only when callers intend to delete data. */
export async function cleanupWorkspace(taskId: string): Promise<void> {
  const provider = getSandboxProvider();
  if (provider === 'ailab') {
    await cleanupAilabContainer(taskId);
    return;
  }
  if (provider === 'local') cleanupSandbox(taskId);
}

/**
 * End-of-task lifecycle handling. For AI Lab the default policy is `stop`, so
 * compute is released while task files remain available on the execution host.
 */
export async function finalizeWorkspace(taskId: string): Promise<void> {
  const provider = getSandboxProvider();
  if (provider === 'ailab') {
    await finalizeAilabTask(taskId);
  }
}

export async function listFiles(taskId: string): Promise<string[]> {
  const provider = getSandboxProvider();
  if (provider === 'ailab') return ailabListFiles(taskId);
  if (provider === 'disabled') throw new Error('Filesystem sandbox desativado');
  requireSafeLocalSandbox();
  return sandboxListFiles(taskId);
}

/**
 * Returns the public preview URL expected by the app proxy layer.
 * This only describes the URL; it does not claim the port is reachable.
 */
export async function exposePort(
  taskId: string,
  port: number,
): Promise<{ url: string; port: number }> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('porta inválida');
  }

  const base = process.env.OMNININJA_PUBLIC_BASE || process.env.NEXT_PUBLIC_APP_URL || '';
  const url = base
    ? `${base.replace(/\/$/, '')}/proxy/${encodeURIComponent(String(port))}?task=${encodeURIComponent(taskId)}`
    : `http://localhost:${port}`;

  return { url, port };
}

export function getSandboxLevel(): SandboxLevel {
  return detectSandboxLevel();
}

export function sandboxProviderConfigured(): boolean {
  const provider = getSandboxProvider();
  if (provider === 'ailab') return ailabConfigured();
  if (provider === 'disabled') return false;
  return true;
}
