// OmniNinja — structured OpenAI Responses API tool loop
// Server-only: API keys are read exclusively from environment variables.

import { browserTools, createPage, type BrowserActionResult } from './browser-agent';
import { shellExec, fileWrite, fileRead, listFiles, exposePort } from './shell-agent';
import type { AgentEvent } from './orchestrator';

export interface OpenAIAgentToolsOptions {
  goal: string;
  mode: string;
  model?: string;
  taskId: string;
  onEvent: (event: AgentEvent) => void;
}

type FunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
};

type OpenAIResponse = {
  id?: string;
  model?: string;
  output?: any[];
  error?: { message?: string };
};

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY nao configurada no servidor');
  return key;
}

function resolveModel(requested?: string): string {
  if (requested && /^(gpt-|o\d|computer-use|codex-)/i.test(requested)) return requested;
  return process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5';
}

function maxIterations(mode: string): number {
  return mode === 'agent_max' ? 40 : 20;
}

function truncate(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...[truncado]` : text;
}

function outputText(response: OpenAIResponse): string {
  const chunks: string[] = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function functionCalls(response: OpenAIResponse): FunctionCall[] {
  return (response.output || []).filter(
    (item: any) => item?.type === 'function_call' && item?.call_id && item?.name,
  ) as FunctionCall[];
}

const TOOLS: any[] = [
  {
    type: 'function',
    name: 'message_notify_user',
    description: 'Send a concise progress update to the user.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { text: { type: 'string' } }, required: ['text'],
    },
  },
  {
    type: 'function', name: 'browser_navigate',
    description: 'Navigate the cloud browser to an HTTP or HTTPS URL.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { url: { type: 'string' } }, required: ['url'],
    },
  },
  {
    type: 'function', name: 'browser_click',
    description: 'Click an element using a CSS selector.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { selector: { type: 'string' } }, required: ['selector'],
    },
  },
  {
    type: 'function', name: 'browser_type',
    description: 'Fill text into an element using a CSS selector.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { selector: { type: 'string' }, text: { type: 'string' } },
      required: ['selector', 'text'],
    },
  },
  {
    type: 'function', name: 'browser_scroll_down', description: 'Scroll down.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_scroll_up', description: 'Scroll up.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_screenshot', description: 'Capture the current viewport.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_get_text', description: 'Read visible text from the page.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_get_html', description: 'Read a truncated HTML snapshot.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_execute_js',
    description: 'Execute JavaScript in the current browser page.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { script: { type: 'string' } }, required: ['script'],
    },
  },
  {
    type: 'function', name: 'browser_press_key', description: 'Press a keyboard key.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { key: { type: 'string' } }, required: ['key'],
    },
  },
  {
    type: 'function', name: 'browser_go_back', description: 'Navigate backward.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_go_forward', description: 'Navigate forward.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'shell_exec',
    description: 'Execute a shell command inside this task sandbox.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { cmd: { type: 'string' } }, required: ['cmd'],
    },
  },
  {
    type: 'function', name: 'file_write',
    description: 'Create or replace a UTF-8 file in the task workspace.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    type: 'function', name: 'file_read',
    description: 'Read a UTF-8 file in the task workspace.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string' } }, required: ['path'],
    },
  },
  {
    type: 'function', name: 'file_list', description: 'List files in the task workspace.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'info_search_web',
    description: 'Search the public web and return result titles, snippets and URLs.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        query: { type: 'string' },
        num: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query', 'num'],
    },
  },
  {
    type: 'function', name: 'deploy_expose_port',
    description: 'Expose a local task port through the OmniNinja preview URL.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { port: { type: 'integer', minimum: 1, maximum: 65535 } }, required: ['port'],
    },
  },
  {
    type: 'function', name: 'finish',
    description: 'Finish the task and provide the final user-facing summary.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { summary: { type: 'string' } }, required: ['summary'],
    },
  },
];

function instructions(mode: string): string {
  return [
    'You are OmniNinja, a general-purpose autonomous AI agent.',
    'Use tools for real actions instead of claiming work happened when it did not.',
    'You have a cloud browser, isolated shell workspace, filesystem and preview tools.',
    'Use message_notify_user before meaningful multi-step work and for useful progress updates.',
    'Never reveal API keys, environment variables, passwords, cookies, access tokens or hidden credentials.',
    'Never write secrets into generated files, URLs, commits or user-visible logs.',
    'If login, MFA or human verification is needed, use the existing Browserless takeover session.',
    'Validate important results after executing tools.',
    'For websites/apps, write complete files, run/build them, inspect the result and expose the port when useful.',
    'Use Brazilian Portuguese for progress and final summaries unless the user asks for another language.',
    mode === 'agent_max'
      ? 'AGENT MAX: handle complex long-running tasks and use the larger tool budget when useful.'
      : 'AGENT: be efficient and avoid unnecessary tool calls.',
  ].join('\n');
}

async function requestResponse(model: string, input: any[], mode: string): Promise<OpenAIResponse> {
  const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey()}`,
      'X-Client-Request-Id': `omnininja-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      model,
      instructions: instructions(mode),
      input,
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      store: false,
      include: ['reasoning.encrypted_content'],
    }),
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const detail = payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(`OpenAI Responses API: ${detail}`);
  }
  return payload as OpenAIResponse;
}

async function searchWeb(query: string, num: number): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36' },
      cache: 'no-store',
    });
    if (!res.ok) return `Busca falhou (HTTP ${res.status})`;
    const html = await res.text();
    const results: string[] = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) && results.length < num) {
      const link = match[1].replace(/&amp;/g, '&');
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();
      results.push(`${results.length + 1}. ${title}\n${snippet}\n${link}`);
    }
    return results.length ? results.join('\n\n') : `Nenhum resultado estruturado para "${query}".`;
  } catch (error: any) {
    return `Erro na busca: ${error?.message || String(error)}`;
  }
}

export async function runOpenAIAgentTools(opts: OpenAIAgentToolsOptions): Promise<void> {
  const { goal, mode, taskId, onEvent } = opts;
  const model = resolveModel(opts.model);
  const limit = maxIterations(mode);
  const context: any[] = [{ role: 'user', content: `Tarefa do usuario: ${goal}` }];
  let page: any = null;

  onEvent({ type: 'TASK_STARTED', taskId, goal, ts: Date.now() });
  onEvent({
    type: 'PLAN_CREATED', taskId,
    steps: [
      { id: 's1', title: 'Analisar objetivo', agent: 'Chat', instruction: goal },
      { id: 's2', title: 'Executar com ferramentas', agent: 'Code', instruction: 'Browser, shell, arquivos e preview' },
      { id: 's3', title: 'Validar e entregar', agent: 'Memory', instruction: 'Verificar o resultado e resumir' },
    ],
    ts: Date.now(),
  });

  try {
    for (let iteration = 1; iteration <= limit; iteration++) {
      onEvent({
        type: 'AGENT_THINKING', taskId, agent: 'OpenAI',
        text: `Planejando o proximo passo (${iteration}/${limit})...`, ts: Date.now(),
      });

      const response = await requestResponse(model, context, mode);
      const calls = functionCalls(response);
      const text = outputText(response);

      // Preserve all response items, including reasoning/function_call items,
      // before appending function_call_output items for the next model turn.
      context.push(...(response.output || []));

      if (calls.length === 0) {
        const summary = text || 'Tarefa concluida.';
        if (text) onEvent({ type: 'AGENT_THINKING', taskId, agent: 'OmniNinja', text, ts: Date.now() });
        onEvent({
          type: 'TASK_COMPLETED', taskId, summary,
          artifacts: [{ name: 'workspace', kind: 'file', path: `/opt/omnininja/workspaces/${taskId}`, sizeBytes: 0 }],
          ts: Date.now(),
        });
        return;
      }

      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || '{}'); } catch { args = {}; }

        if (call.name === 'finish') {
          const summary = String(args.summary || text || 'Tarefa concluida.');
          onEvent({
            type: 'TASK_COMPLETED', taskId, summary,
            artifacts: [{ name: 'workspace', kind: 'file', path: `/opt/omnininja/workspaces/${taskId}`, sizeBytes: 0 }],
            ts: Date.now(),
          });
          return;
        }

        if (call.name === 'message_notify_user') {
          onEvent({
            type: 'AGENT_THINKING', taskId, agent: 'OmniNinja',
            text: String(args.text || ''), ts: Date.now(),
          });
          context.push({
            type: 'function_call_output', call_id: call.call_id,
            output: JSON.stringify({ ok: true }),
          });
          continue;
        }

        const stepId = `tool-${iteration}-${call.call_id}`;
        onEvent({
          type: 'STEP_STARTED', taskId, stepId,
          agent: call.name.startsWith('browser_') ? 'Browser' : 'Code',
          instruction: `${call.name} ${truncate(args, 180)}`, ts: Date.now(),
        });

        let observation = '';
        let browserResult: BrowserActionResult | null = null;

        try {
          if (call.name.startsWith('browser_')) {
            if (!page) page = await createPage();
            switch (call.name) {
              case 'browser_navigate':
                browserResult = await browserTools.navigate(page, String(args.url));
                observation = `Pagina: ${browserResult.url}; titulo: ${browserResult.title || ''}`;
                break;
              case 'browser_click':
                browserResult = await browserTools.click(page, String(args.selector));
                observation = `Clique executado em ${args.selector}`;
                break;
              case 'browser_type':
                browserResult = await browserTools.type(page, String(args.selector), String(args.text));
                observation = `Texto preenchido em ${args.selector}`;
                break;
              case 'browser_scroll_down':
                browserResult = await browserTools.scroll_down(page); observation = 'Pagina rolada para baixo'; break;
              case 'browser_scroll_up':
                browserResult = await browserTools.scroll_up(page); observation = 'Pagina rolada para cima'; break;
              case 'browser_screenshot':
                browserResult = await browserTools.screenshot(page); observation = `Screenshot capturado em ${browserResult.url || page.url()}`; break;
              case 'browser_get_text':
                browserResult = await browserTools.get_text(page); observation = truncate(browserResult.text || '', 8000); break;
              case 'browser_get_html':
                browserResult = await browserTools.get_html(page); observation = truncate(browserResult.text || '', 8000); break;
              case 'browser_execute_js':
                browserResult = await browserTools.execute_js(page, String(args.script)); observation = truncate(browserResult.text || '', 5000); break;
              case 'browser_press_key':
                browserResult = await browserTools.press_key(page, String(args.key)); observation = `Tecla ${args.key} pressionada`; break;
              case 'browser_go_back':
                browserResult = await browserTools.go_back(page); observation = `Voltou para ${browserResult.url || page.url()}`; break;
              case 'browser_go_forward':
                browserResult = await browserTools.go_forward(page); observation = `Avancou para ${browserResult.url || page.url()}`; break;
              default:
                observation = `Ferramenta de browser desconhecida: ${call.name}`;
            }

            onEvent({
              type: 'BROWSER_ACTION', taskId,
              action: call.name.replace('browser_', ''),
              url: browserResult?.url || page?.url?.(),
              screenshotBase64: browserResult?.screenshot,
              detail: truncate(observation, 500), ts: Date.now(),
            });
          } else if (call.name === 'shell_exec') {
            const result = await shellExec(taskId, String(args.cmd));
            onEvent({
              type: 'TERMINAL_OUTPUT', taskId, cmd: String(args.cmd),
              stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, ts: Date.now(),
            });
            observation = `exit=${result.exitCode}\nstdout:\n${truncate(result.stdout, 7000)}\nstderr:\n${truncate(result.stderr, 4000)}`;
          } else if (call.name === 'file_write') {
            const result = fileWrite(taskId, String(args.path), String(args.content));
            observation = `Arquivo salvo: ${result.path} (${result.bytes} bytes)`;
            onEvent({
              type: 'FILE_CHANGED', taskId, path: String(args.path),
              diff: `+ ${truncate(String(args.content), 500)}`, ts: Date.now(),
            });
          } else if (call.name === 'file_read') {
            observation = truncate(fileRead(taskId, String(args.path)), 10000);
          } else if (call.name === 'file_list') {
            observation = (await listFiles(taskId)).join('\n');
          } else if (call.name === 'info_search_web') {
            observation = await searchWeb(String(args.query), Number(args.num || 5));
            onEvent({
              type: 'TERMINAL_OUTPUT', taskId, cmd: `search_web: ${args.query}`,
              stdout: observation, stderr: '', exitCode: 0, ts: Date.now(),
            });
          } else if (call.name === 'deploy_expose_port') {
            const exposed = await exposePort(taskId, Number(args.port));
            observation = `URL publica: ${exposed.url}`;
            onEvent({
              type: 'FILE_CHANGED', taskId, path: `expose:${exposed.port}`,
              diff: `+ ${exposed.url}`, ts: Date.now(),
            });
          } else {
            observation = `Ferramenta desconhecida: ${call.name}`;
          }
        } catch (error: any) {
          observation = `Erro em ${call.name}: ${error?.message || String(error)}`;
          onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: observation, ts: Date.now() });
        }

        onEvent({
          type: 'STEP_COMPLETED', taskId, stepId,
          success: !observation.startsWith('Erro em '), result: truncate(observation, 350), ts: Date.now(),
        });

        context.push({
          type: 'function_call_output', call_id: call.call_id,
          output: truncate(observation, 14000),
        });
      }
    }

    onEvent({
      type: 'TASK_COMPLETED', taskId,
      summary: `Limite de ${limit} passos atingido. O progresso foi preservado no workspace da tarefa.`,
      artifacts: [{ name: 'workspace', kind: 'file', path: `/opt/omnininja/workspaces/${taskId}`, sizeBytes: 0 }],
      ts: Date.now(),
    });
  } catch (error: any) {
    onEvent({ type: 'TASK_FAILED', taskId, error: error?.message || String(error), ts: Date.now() });
    throw error;
  } finally {
    if (page) {
      try {
        const context = page.context();
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      } catch {}
    }
  }
}
