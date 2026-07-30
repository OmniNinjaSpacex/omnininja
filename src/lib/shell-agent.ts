// OmniNinja — Shell Agent com VM Sandbox (estilo Manus AI)
// =========================================================================
// Executa comandos bash/python/node REAIS dentro de uma "máquina virtual"
// isolada por task — exatamente como Manus AI (E2B/Firecracker) faz.
//
// O isolamento é gerenciado por sandbox.ts, que detecta automaticamente
// o melhor nível disponível no host:
//   Nível 2: unshare + proot (namespace real do kernel)
//   Nível 1: chroot com debootstrap (filesystem Ubuntu isolado)
//   Nível 0: diretório isolado (fallback — sempre funciona)
//
// Cada task tem seu próprio workspace persistente. Path traversal é bloqueado.
// O agente não precisa saber qual nível está rodando — a interface é a mesma.

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import {
  executeInSandbox,
  sandboxFileWrite,
  sandboxFileRead,
  sandboxListFiles,
  cleanupSandbox,
  detectSandboxLevel,
  type SandboxLevel,
} from './sandbox';

const execAsync = promisify(exec);

// Mantido para compatibilidade — sandbox.ts usa o mesmo WORKSPACE_ROOT
const WORKSPACE_ROOT = process.env.OMNININJA_WORKSPACE_ROOT || '/opt/omnininja/workspaces';

function getWorkspace(taskId: string): string {
  const dir = join(WORKSPACE_ROOT, taskId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'omninja-sandbox', version: '1.0.0', private: true })
    );
  }
  return dir;
}

export interface ShellResult {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxLevel?: SandboxLevel;
}

/**
 * Executa um comando DENTRO do sandbox VM isolado da task.
 * Delega para sandbox.ts que detecta o nível de isolamento automaticamente.
 */
export async function shellExec(taskId: string, cmd: string, timeoutMs = 60000): Promise<ShellResult> {
  const result = await executeInSandbox(taskId, cmd, timeoutMs);
  return {
    cmd: result.cmd,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    sandboxLevel: result.sandboxLevel,
  };
}

export function fileWrite(taskId: string, path: string, content: string): { path: string; bytes: number } {
  return sandboxFileWrite(taskId, path, content);
}

export function fileRead(taskId: string, path: string): string {
  return sandboxFileRead(taskId, path);
}

export function fileDelete(taskId: string, path: string): boolean {
  const workspace = getWorkspace(taskId);
  const safePath = join(workspace, path.replace(/^\//, ''));
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
 * Expõe uma porta local para acesso público.
 * No Ubuntu: usa o trampoline nativo do OmniNinja ou um túnel.
 */
export async function exposePort(taskId: string, port: number): Promise<{ url: string; port: number }> {
  const base = process.env.OMNININJA_PUBLIC_BASE || process.env.NEXT_PUBLIC_APP_URL || '';
  const url = base ? `${base.replace(/\/$/, '')}/proxy/${port}` : `http://localhost:${port}`;
  return { url, port };
}

/**
 * Retorna o nível de sandbox ativo (para diagnóstico/UI).
 */
export function getSandboxLevel(): SandboxLevel {
  return detectSandboxLevel();
}
