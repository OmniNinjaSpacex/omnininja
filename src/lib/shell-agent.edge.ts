// Edge facade: only authenticated remote AI Lab execution is allowed.
// Local shell/filesystem execution is intentionally unavailable in Sites.

import {
  ailabConfigured,
  ailabFileDelete,
  ailabFileRead,
  ailabFileWrite,
  ailabListFiles,
  cleanupAilabContainer,
  executeInAilab,
} from '@/lib/ailab-sandbox';
import { finalizeAilabTask } from '@/lib/ailab-lifecycle';
import type { SandboxLevel } from '@/lib/sandbox';

export type SandboxProvider = 'ailab' | 'disabled';

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
  return (process.env.OMNININJA_SANDBOX_PROVIDER || '')
    .trim()
    .toLowerCase() === 'ailab'
    ? 'ailab'
    : 'disabled';
}

export async function shellExec(
  taskId: string,
  cmd: string,
  timeoutMs = 60_000,
): Promise<ShellResult> {
  if (getSandboxProvider() !== 'ailab') {
    return {
      cmd,
      stdout: '',
      stderr: 'Shell desativado neste runtime.',
      exitCode: 126,
      sandboxProvider: 'disabled',
    };
  }

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

export async function fileWrite(taskId: string, path: string, content: string) {
  if (getSandboxProvider() !== 'ailab') {
    throw new Error('Filesystem sandbox desativado neste runtime.');
  }
  return ailabFileWrite(taskId, path, content);
}

export async function fileRead(taskId: string, path: string): Promise<string> {
  if (getSandboxProvider() !== 'ailab') {
    throw new Error('Filesystem sandbox desativado neste runtime.');
  }
  return ailabFileRead(taskId, path);
}

export async function fileDelete(taskId: string, path: string): Promise<boolean> {
  if (getSandboxProvider() !== 'ailab') return false;
  return ailabFileDelete(taskId, path);
}

export async function listFiles(taskId: string): Promise<string[]> {
  if (getSandboxProvider() !== 'ailab') {
    throw new Error('Filesystem sandbox desativado neste runtime.');
  }
  return ailabListFiles(taskId);
}

export async function cleanupWorkspace(taskId: string): Promise<void> {
  if (getSandboxProvider() === 'ailab') await cleanupAilabContainer(taskId);
}

export async function finalizeWorkspace(taskId: string): Promise<void> {
  if (getSandboxProvider() === 'ailab') await finalizeAilabTask(taskId);
}

export async function exposePort(taskId: string, port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('porta inválida');
  }
  const base =
    process.env.OMNININJA_PUBLIC_BASE || process.env.NEXT_PUBLIC_APP_URL || '';
  const url = base
    ? `${base.replace(/\/$/, '')}/proxy/${encodeURIComponent(String(port))}?task=${encodeURIComponent(taskId)}`
    : '';
  return { url, port };
}

export function getSandboxLevel(): SandboxLevel {
  return 0;
}

export function sandboxProviderConfigured(): boolean {
  return getSandboxProvider() === 'ailab' && ailabConfigured();
}
