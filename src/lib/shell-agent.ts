// OmniNinja — shell/files facade for the secure task sandbox.
// All filesystem operations are scoped to the task workspace and production
// shell execution is delegated to sandbox.ts, which refuses unsafe host-shell
// fallbacks.

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

export interface ShellResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxLevel?: SandboxLevel;
}

export async function shellExec(
  taskId: string,
  cmd: string,
  timeoutMs = 60000,
): Promise<ShellResult> {
  const result = await executeInSandbox(taskId, cmd, timeoutMs);
  return {
    cmd: result.cmd,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    sandboxLevel: result.sandboxLevel,
  };
}

export function fileWrite(
  taskId: string,
  path: string,
  content: string,
): { path: string; bytes: number } {
  return sandboxFileWrite(taskId, path, content);
}

export function fileRead(taskId: string, path: string): string {
  return sandboxFileRead(taskId, path);
}

export function fileDelete(taskId: string, path: string): boolean {
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

export function cleanupWorkspace(taskId: string) {
  cleanupSandbox(taskId);
}

export async function listFiles(taskId: string): Promise<string[]> {
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
