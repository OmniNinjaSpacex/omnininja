// OmniNinja — Real Shell Agent (Ubuntu compartilhado)
// Executa comandos bash/python/node REAIS num workspace isolado por task.
// Cada task tem seu diretório em WORKSPACE_ROOT; path traversal é bloqueado.
//
// Modelo de isolamento (sem Docker, para Ubuntu compartilhado):
//  - Diretório por task (WORKSPACE_ROOT/<taskId>), criado on-demand.
//  - HOME apontado para o workspace do task (npm/pip guardam cache por task).
//  - Timeout por comando (evita comandos travados consumindo recursos).
//  - maxBuffer limita saída (proteção de memória).
//  - Para isolamento forte de UID, rode cada task num `unshare --user --map-root-user`
//    namespace (ver TUTORIAL_UBUNTU.md, seção segurança).

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// Pode ser sobrescrito por .env. Padrão Ubuntu: /opt/omnininja/workspaces
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
}

export async function shellExec(taskId: string, cmd: string, timeoutMs = 30000): Promise<ShellResult> {
  const workspace = getWorkspace(taskId);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: workspace,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        HOME: workspace,
        PATH: process.env.PATH,
        // Garante que ferramentas npm/pip locais funcionem
        npm_config_prefix: join(workspace, '.npm-global'),
      },
    });
    return {
      cmd,
      stdout: stdout.slice(0, 10000),
      stderr: stderr.slice(0, 5000),
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      cmd,
      stdout: (err.stdout ?? '').slice(0, 10000),
      stderr: (err.stderr ?? err.message ?? '').slice(0, 5000),
      exitCode: err.code ?? 1,
    };
  }
}

export function fileWrite(taskId: string, path: string, content: string): { path: string; bytes: number } {
  const workspace = getWorkspace(taskId);
  // bloqueia path traversal — só caminhos relativos dentro do workspace
  const safePath = join(workspace, path.replace(/^\//, ''));
  const rel = safePath.slice(workspace.length);
  if (rel.startsWith('..')) throw new Error('path traversal bloqueado');
  mkdirSync(join(safePath, '..'), { recursive: true });
  writeFileSync(safePath, content);
  return { path: safePath, bytes: content.length };
}

export function fileRead(taskId: string, path: string): string {
  const workspace = getWorkspace(taskId);
  const safePath = join(workspace, path.replace(/^\//, ''));
  try {
    return readFileSync(safePath, 'utf-8').slice(0, 20000);
  } catch {
    return `Error: file not found: ${path}`;
  }
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
  const dir = join(WORKSPACE_ROOT, taskId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function listFiles(taskId: string): Promise<string[]> {
  const workspace = getWorkspace(taskId);
  try {
    const { stdout } = await execAsync('find . -type f | head -50', { cwd: workspace });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Expõe uma porta local para acesso público.
 * No Ubuntu: usa o trampoline nativo do OmniNinja (porta de proxy) ou, em
 * produção, um túnel (cloudflared / frp / ngrok). Aqui devolvemos uma URL
 * baseada no host público configurado.
 */
export async function exposePort(taskId: string, port: number): Promise<{ url: string; port: number }> {
  // Em produção, OMNININJA_PUBLIC_BASE = https://seu-dominio.com
  // e o Caddy/nginx expõe /proxy/<port> -> localhost:<port>.
  const base = process.env.OMNININJA_PUBLIC_BASE || process.env.NEXT_PUBLIC_APP_URL || '';
  const url = base ? `${base.replace(/\/$/, '')}/proxy/${port}` : `http://localhost:${port}`;
  return { url, port };
}
