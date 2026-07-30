#!/usr/bin/env node
/**
 * NOVA Agent Runner
 * ------------------------------------------------------------------
 * Roda na SUA VM Ubuntu (AWS). É o "computador" real do agente:
 * shell, arquivos, navegador (Playwright) e servidores expostos.
 *
 * O loop do agente roda AQUI (sem limite de tempo) e transmite cada
 * passo de volta para o app via callback HTTP.
 *
 * Uso:  RUNNER_TOKEN=... node server.mjs
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.RUNNER_TOKEN;
const WORKROOT = process.env.RUNNER_WORKROOT || "/home/nova/workspaces";
const PUBLIC_HOST = process.env.RUNNER_PUBLIC_HOST || "localhost";
const MAX_STEPS = Number(process.env.RUNNER_MAX_STEPS || 60);
const CMD_TIMEOUT_MS = Number(process.env.RUNNER_CMD_TIMEOUT_MS || 300000);
const MAX_OUTPUT = 20000;

if (!TOKEN) {
  console.error("RUNNER_TOKEN é obrigatório");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map(); // taskId -> { cancelled, browser, page, workdir }

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

function clip(text, max = MAX_OUTPUT) {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max)}\n…[saída truncada, ${s.length} chars]` : s;
}

function safeJoin(workdir, target) {
  const resolved = path.resolve(workdir, target ?? ".");
  if (!resolved.startsWith(path.resolve(workdir))) {
    throw new Error("Caminho fora do diretório da tarefa");
  }
  return resolved;
}

async function emit(session, type, payload) {
  const event = { taskId: session.taskId, userId: session.userId, type, payload };
  if (!session.callbackUrl) {
    console.log("[event]", type, JSON.stringify(payload).slice(0, 200));
    return;
  }
  try {
    await fetch(session.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.callbackToken}`,
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error("[callback falhou]", err.message);
  }
}

/* ------------------------------------------------------------------ */
/* ferramentas                                                         */
/* ------------------------------------------------------------------ */

function runShell(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive", CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\n[timeout após ${CMD_TIMEOUT_MS}ms]`;
    }, CMD_TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > MAX_OUTPUT * 2) stdout = stdout.slice(-MAX_OUTPUT * 2);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout: clip(stdout), stderr: clip(stderr) });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout: "", stderr: err.message });
    });
  });
}

async function getPage(session) {
  if (session.page) return session.page;
  const { chromium } = await import("playwright");
  session.browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await session.browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  });
  session.page = await ctx.newPage();
  return session.page;
}

async function screenshot(session) {
  try {
    const page = await getPage(session);
    const buf = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const TOOLS = {
  async shell_exec(session, { command }) {
    await emit(session, "TERMINAL_INPUT", { command });
    const res = await runShell(command, session.workdir);
    await emit(session, "TERMINAL_OUTPUT", {
      command,
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
    });
    return res;
  },

  async file_write(session, { path: target, content }) {
    const full = safeJoin(session.workdir, target);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content ?? "", "utf8");
    await emit(session, "FILE_CHANGED", {
      path: target,
      action: "write",
      preview: clip(content, 4000),
    });
    return { ok: true, path: target, bytes: Buffer.byteLength(content ?? "") };
  },

  async file_read(session, { path: target }) {
    const full = safeJoin(session.workdir, target);
    const content = await fs.readFile(full, "utf8");
    return { path: target, content: clip(content) };
  },

  async file_list(session, { path: target }) {
    const full = safeJoin(session.workdir, target ?? ".");
    const entries = await fs.readdir(full, { withFileTypes: true });
    return {
      path: target ?? ".",
      entries: entries.map((e) => ({ name: e.name, dir: e.isDirectory() })),
    };
  },

  async browser_navigate(session, { url }) {
    const page = await getPage(session);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const title = await page.title();
    await emit(session, "BROWSER_ACTION", {
      action: "navigate",
      url: page.url(),
      title,
      screenshot: await screenshot(session),
    });
    return { url: page.url(), title };
  },

  async browser_act(session, { action, selector, text }) {
    const page = await getPage(session);
    if (action === "click") await page.click(selector, { timeout: 20000 });
    else if (action === "type") await page.fill(selector, text ?? "", { timeout: 20000 });
    else if (action === "press") await page.keyboard.press(text || "Enter");
    else if (action === "scroll") await page.mouse.wheel(0, Number(text || 800));
    else if (action === "wait") await page.waitForTimeout(Number(text || 1500));
    else throw new Error(`ação desconhecida: ${action}`);
    await emit(session, "BROWSER_ACTION", {
      action,
      selector,
      text,
      url: page.url(),
      screenshot: await screenshot(session),
    });
    return { ok: true, url: page.url() };
  },

  async browser_extract(session, { selector }) {
    const page = await getPage(session);
    const content = selector
      ? await page.$$eval(selector, (nodes) => nodes.map((n) => n.innerText).join("\n"))
      : await page.evaluate(() => document.body.innerText);
    return { url: page.url(), text: clip(content, 15000) };
  },

  async web_search(session, { query }) {
    const page = await getPage(session);
    await page.goto(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const results = await page.$$eval("div.result", (nodes) =>
      nodes.slice(0, 8).map((n) => ({
        title: n.querySelector("a.result__a")?.textContent?.trim() ?? "",
        url: n.querySelector("a.result__a")?.getAttribute("href") ?? "",
        snippet: n.querySelector(".result__snippet")?.textContent?.trim() ?? "",
      })),
    );
    await emit(session, "BROWSER_ACTION", {
      action: "search",
      text: query,
      url: page.url(),
      screenshot: await screenshot(session),
    });
    return { query, results };
  },

  async deploy_expose(session, { port, command }) {
    if (command) {
      spawn("bash", ["-lc", command], {
        cwd: session.workdir,
        detached: true,
        stdio: "ignore",
      }).unref();
      await new Promise((r) => setTimeout(r, 2500));
    }
    const url = `http://${PUBLIC_HOST}:${port}`;
    await emit(session, "PREVIEW_READY", { url, port });
    return { url };
  },

  async message_user(session, { text }) {
    await emit(session, "AGENT_MESSAGE", { text });
    return { delivered: true };
  },

  async task_complete(session, { summary, artifacts }) {
    await emit(session, "TASK_COMPLETED", { summary, artifacts: artifacts ?? [] });
    return { done: true };
  },
};

const TOOL_SCHEMA = [
  {
    name: "shell_exec",
    description:
      "Executa um comando bash real no sandbox Ubuntu, dentro do diretório da tarefa. Use para instalar pacotes, rodar scripts, git, build, testes.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Comando bash" } },
      required: ["command"],
    },
  },
  {
    name: "file_write",
    description: "Cria ou sobrescreve um arquivo (caminho relativo ao diretório da tarefa).",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "file_read",
    description: "Lê o conteúdo de um arquivo do sandbox.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "file_list",
    description: "Lista arquivos e pastas de um diretório do sandbox.",
    parameters: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "browser_navigate",
    description: "Abre uma URL no navegador real (Chromium) do sandbox.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "browser_act",
    description: "Interage com a página aberta: click, type, press, scroll ou wait.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["click", "type", "press", "scroll", "wait"] },
        selector: { type: "string" },
        text: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "browser_extract",
    description: "Extrai o texto da página aberta (ou de um seletor CSS).",
    parameters: { type: "object", properties: { selector: { type: "string" } } },
  },
  {
    name: "web_search",
    description: "Pesquisa na web e devolve os principais resultados.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "deploy_expose",
    description:
      "Sobe um servidor no sandbox (comando opcional) e devolve a URL pública da porta para pré-visualização.",
    parameters: {
      type: "object",
      properties: { port: { type: "number" }, command: { type: "string" } },
      required: ["port"],
    },
  },
  {
    name: "message_user",
    description: "Envia uma mensagem intermediária para o usuário sem encerrar a tarefa.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "task_complete",
    description: "Encerra a tarefa entregando o resumo final em markdown.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        artifacts: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, path: { type: "string" } },
          },
        },
      },
      required: ["summary"],
    },
  },
].map((t) => ({ type: "function", function: t }));

/* ------------------------------------------------------------------ */
/* agent loop                                                          */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Você é o NOVA, um agente de IA autônomo e generalista que opera um computador Ubuntu real.

Ambiente:
- Você tem um sandbox Linux exclusivo para esta tarefa, com internet, bash, Python, Node e um navegador Chromium controlável.
- Todo caminho de arquivo é relativo ao diretório da tarefa.

Como trabalhar:
1. Comece declarando um plano curto (3 a 6 passos) em uma mensagem de texto.
2. Depois AJA: use as ferramentas para executar de verdade. Nunca finja resultados nem descreva o que "faria".
3. Verifique o que você produziu (leia o arquivo, abra a página, rode o teste) antes de concluir.
4. Se algo falhar, leia o erro e tente outro caminho — você é autônomo, não peça permissão por coisas triviais.
5. Ao terminar, chame task_complete com um resumo em markdown e a lista de artefatos gerados.

Regras:
- Responda sempre em português do Brasil.
- Prefira comandos não interativos (-y, --yes, --no-input).
- Não exponha chaves, tokens ou conteúdo de variáveis de ambiente.
- Use no máximo alguns minutos por passo; divida trabalhos longos.`;

async function callModel(session, messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.apiKey}`,
      "HTTP-Referer": "https://nova.agent",
      "X-Title": "NOVA Agent",
    },
    body: JSON.stringify({
      model: session.model,
      messages,
      tools: TOOL_SCHEMA,
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM ${res.status}: ${clip(body, 600)}`);
  }
  const json = await res.json();
  if (!json.choices?.length) throw new Error(`LLM sem resposta: ${clip(JSON.stringify(json), 600)}`);
  return json.choices[0].message;
}

async function runAgent(session) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(session.history ?? []),
    { role: "user", content: session.prompt },
  ];

  await emit(session, "TASK_STARTED", { workdir: session.workdir, model: session.model });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (session.cancelled) {
        await emit(session, "TASK_CANCELLED", {});
        return;
      }

      const message = await callModel(session, messages);
      messages.push(message);

      if (message.content) {
        await emit(session, "AGENT_MESSAGE", { text: message.content });
      }

      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        await emit(session, "TASK_COMPLETED", { summary: message.content ?? "" });
        return;
      }

      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          /* argumentos inválidos */
        }

        await emit(session, "TOOL_CALL", { tool: name, args });

        let result;
        try {
          const fn = TOOLS[name];
          if (!fn) throw new Error(`ferramenta desconhecida: ${name}`);
          result = await fn(session, args);
        } catch (err) {
          result = { error: err.message };
          await emit(session, "TOOL_ERROR", { tool: name, error: err.message });
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: clip(JSON.stringify(result), 12000),
        });

        if (name === "task_complete") return;
      }
    }
    await emit(session, "TASK_FAILED", { error: `limite de ${MAX_STEPS} passos atingido` });
  } catch (err) {
    await emit(session, "TASK_FAILED", { error: err.message });
  } finally {
    try {
      await session.browser?.close();
    } catch {
      /* ignore */
    }
    sessions.delete(session.taskId);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 5_000_000) reject(new Error("payload grande demais"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (url.pathname === "/health") {
    return json(res, 200, { ok: true, sessions: sessions.size, uptime: process.uptime() });
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return json(res, 401, { error: "não autorizado" });
  }

  try {
    if (req.method === "POST" && url.pathname === "/tasks") {
      const body = await readBody(req);
      const { taskId, userId, prompt, model, apiKey, callbackUrl, callbackToken, history } = body;
      if (!taskId || !prompt || !apiKey) return json(res, 400, { error: "campos obrigatórios ausentes" });

      const workdir = path.join(WORKROOT, taskId);
      await fs.mkdir(workdir, { recursive: true });

      const session = {
        taskId,
        userId,
        prompt,
        model: model || "anthropic/claude-sonnet-4.5",
        apiKey,
        callbackUrl,
        callbackToken,
        history: history ?? [],
        workdir,
        cancelled: false,
      };
      sessions.set(taskId, session);
      runAgent(session);
      return json(res, 202, { accepted: true, taskId, workdir });
    }

    if (req.method === "POST" && url.pathname === "/cancel") {
      const { taskId } = await readBody(req);
      const session = sessions.get(taskId);
      if (session) session.cancelled = true;
      return json(res, 200, { cancelled: Boolean(session) });
    }

    if (req.method === "POST" && url.pathname === "/exec") {
      const { command, taskId } = await readBody(req);
      const cwd = taskId ? path.join(WORKROOT, taskId) : WORKROOT;
      await fs.mkdir(cwd, { recursive: true });
      return json(res, 200, await runShell(command, cwd));
    }

    if (req.method === "GET" && url.pathname === "/file") {
      const taskId = url.searchParams.get("taskId");
      const target = url.searchParams.get("path");
      const workdir = path.join(WORKROOT, taskId ?? "");
      const content = await fs.readFile(safeJoin(workdir, target), "utf8");
      return json(res, 200, { path: target, content: clip(content, 200000) });
    }

    return json(res, 404, { error: "rota não encontrada" });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

await fs.mkdir(WORKROOT, { recursive: true });
server.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVA Agent Runner ouvindo em :${PORT} — workspaces em ${WORKROOT} (${__dirname})`);
});
