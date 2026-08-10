// OmniNinja — Native OpenAI Responses API agent loop
// Uses structured function calling instead of asking the model to print JSON.
// Secrets are read from server-side environment variables only.

import { browserTools, createPage, type BrowserActionResult } from './browser-agent';
import { shellExec, fileWrite, fileRead, listFiles, exposePort } from './shell-agent';
import type { AgentEvent } from './orchestrator';

export interface OpenAIAgentLoopOptions {
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
  id: string;
  output?: Array<any>;
  error?: { message?: string };
};

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_AGENT_MODEL || 'gpt-5.2';

function maxIterationsFor(mode: string): number {
  return mode === 'agent_max' ? 40 : 20;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...[truncado]` : value;
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY nao configurada no servidor');
  return key;
}

function extractText(response: OpenAIResponse): string {
  const parts: string[] = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function functionCalls(response: OpenAIResponse): FunctionCall[] {
  return (response.output || []).filter(
    (item: any) => item?.type === 'function_call' && item.call_id && item.name,
  ) as FunctionCall[];
}

const TOOL_DEFINITIONS: any[] = [
  {
    type: 'function',
    name: 'message_notify_user',
    description: 'Send a short progress update to the user before or after meaningful work.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    type: 'function',
    name: 'browser_navigate',
    description: 'Navigate the OmniNinja cloud browser to an HTTP or HTTPS URL.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { url: { type: 'string' } }, required: ['url'],
    },
  },
  {
    type: 'function', name: 'browser_click',
    description: 'Click an element in the current browser page using a CSS selector.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { selector: { type: 'string' } }, required: ['selector'],
    },
  },
  {
    type: 'function', name: 'browser_type',
    description: 'Fill or type text into an element using a CSS selector.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { selector: { type: 'string' }, text: { type: 'string' } },
      required: ['selector', 'text'],
    },
  },
  {
    type: 'function', name: 'browser_scroll_down',
    description: 'Scroll the current browser page down.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_scroll_up',
    description: 'Scroll the current browser page up.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_screenshot',
    description: 'Capture the current browser viewport for the OmniNinja computer panel.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_get_text',
    description: 'Read visible text from the current browser page.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_get_html',
    description: 'Read a truncated HTML snapshot from the current browser page.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_execute_js',
    description: 'Execute JavaScript in the current browser page and return its result.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { script: { type: 'string' } }, required: ['script'],
    },
  },
  {
    type: 'function', name: 'browser_press_key',
    description: 'Press a keyboard key in the current browser page.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { key: { type: 'string' } }, required: ['key'],
    },
  },
  {
    type: 'function', name: 'browser_go_back',
    description: 'Navigate the current browser page backward.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'browser_go_forward',
    description: 'Navigate the current browser page forward.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'shell_exec',
    description: 'Execute a bash/shell command inside the isolated workspace for this task.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { cmd: { type: 'string' } }, required: ['cmd'],
    },
  },
  {
    type: 'function', name: 'file_write',
    description: 'Create or replace a UTF-8 file inside the task workspace.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    type: 'function', name: 'file_read',
    description: 'Read a UTF-8 file from the task workspace.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string' } }, required: ['path'],
    },
  },
  {
    type: 'function', name: 'file_list',
    description: 'List files currently present in the task workspace.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function', name: 'info_search_web',
    description: 'Run a lightweight public web search and return titles, snippets and result URLs.',
    strict: true,
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
    description: 'Expose a server port from the task workspace through the OmniNinja preview proxy.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { port: { type: 'integer', minimum: 1, maximum: 65535 } }, required: ['port'],
    },
  },
  {
    type: 'function', name: 'finish',
    description: 'Finish the task only when the requested work is complete or no more useful progress is possible.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { summary: { type: 'string' } }, required: ['summary'],
    },
  },
];

function systemInstructions(mode: string): string {
  const maxMode = mode === 'agent_max';
  return [
    'You are OmniNinja, a general-purpose AI agent running inside an isolated task workspace.',
    'Use function tools instead of pretending that actions happened.',
    'You can browse the web through the Browserless/Playwright browser, run shell commands in the task sandbox, and read/write files.',
    'Before meaningful multi-step work, send a concise progress update with message_notify_user.',
    'Never reveal server environment variables, API keys, access tokens, cookies, or hidden credentials.',
    'Do not place secrets in generated source files, logs, URLs, commits, or user-visible messages.',
    'When browser login, MFA, or human verification is required, rely on the existing interactive browser takeover session instead of asking for passwords in chat.',
    'Validate results after important actions. If a command fails, inspect the error and try a reasonable correction.',
    'For websites/apps, create complete files, run the build or dev server, validate it, and expose the relevant port when useful.',
    'Use Brazilian Portuguese for user-facing progress and final summaries unless the user requests another language.',
    maxMode
      ? 'AGENT MAX mode: handle longer and more complex tasks, using up to the full tool budget when useful.'
      : 'AGENT mode: be efficient and avoid unnecessary tool calls.',
  ].join('\n');
}

async function openAIRequest(body: Record<string, any>): Promise<OpenAIResponse> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`OpenAI Responses API: ${detail}`);
  }
  return payload as OpenAIResponse;
}

async function searchWeb(query: string, num: number): Promise<string> {
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
}

export async function runOpenAIAgentLoop(opts: OpenAIAgentLoopOptions): Promise<void> {
  const { goal, mode, taskId, onEvent } = opts;
  const model = process.env.OPENAI_AGENT_MODEL || DEFAULT_OPENAI_MODEL;
  const maxIterations = maxIterationsFor(mode);

  onEvent({ type: 'TASK_STARTED', taskId, goal, ts: Date.now() });
  onEvent({
    type: 'PLAN_CREATED',
    taskId,
    steps: [
      { id: 's1', title: 'Analisar objetivo', agent: 'Chat', instruction: goal },
      { id: 's2', title: 'Executar com ferramentas', agent: 'Code', instruction: 'Usar browser, shell e arquivos quando necessario' },
      { id: 's3', title: 'Validar e entregar', agent: 'Memory', instruction: 'Verificar resultado e resumir' },
    ],
    ts: Date.now(),
  });

  let page: any = null;
  let previousResponseId: string | undefined;
  let nextInput: any = `Tarefa do usuario: ${goal}`;

  try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      onEvent({
        type: 'AGENT_THINKING', taskId, agent: 'OpenAI',
        text: `Planejando o proximo passo (${iteration}/${maxIterations})...`, ts: Date.now(),
      });

      const requestBody: Record<string, any> = {
        model,
        instructions: systemInstructions(mode),
        input: nextInput,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        store: false,
      };
      if (previousResponseId) requestBody.previous_response_id = previousResponseId;

      const response = await openAIRequest(requestBody);
      previousResponseId = response.id;
      const calls = functionCalls(response);
      const text = extractText(response);

      if (calls.length === 0) {
        const summary = text || 'Tarefa concluida.';
        if (text) {
          onEvent({ type: 'AGENT_THINKING', taskId, agent: 'OmniNinja', text, ts: Date.now() });
        }
        onEvent({
          type: 'TASK_COMPLETED', taskId, summary,
          artifacts: [{ name: 'workspace', kind: 'file', path: `/opt/omnininja/workspaces/${taskId}`, sizeBytes: 0 }],
          ts: Date.now(),
        });
        return;
      }

      const outputs: any[] = [];

      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || '{}'); }
        catch { args = {}; }

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
          const message = String(args.text || '');
          onEvent({ type: 'AGENT_THINKING', taskId, agent: 'OmniNinja', text: message, ts: Date.now() });
          outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ ok: true }) });
          continue;
        }

        onEvent({
          type: 'STEP_STARTED', taskId, stepId: `tool-${iteration}`,
          agent: call.name.startsWith('browser_') ? 'Browser' : 'Code',
          instruction: `${call.name} ${truncate(JSON.stringify(args), 160)}`, ts: Date.now(),
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
                browserResult = await browserTools.get_text(page); observation = truncate(browserResult.text || '', 6000); break;
              case 'browser_get_html':
                browserResult = await browserTools.get_html(page); observation = truncate(browserResult.text || '', 6000); break;
              case 'browser_execute_js':
                browserResult = await browserTools.execute_js(page, String(args.script)); observation = truncate(browserResult.text || '', 4000); break;
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
            observation = `exit=${result.exitCode}\nstdout:\n${truncate(result.stdout, 6000)}\nstderr:\n${truncate(result.stderr, 3000)}`;
          } else if (call.name === 'file_write') {
            const result = fileWrite(taskId, String(args.path), String(args.content));
            observation = `Arquivo salvo: ${result.path} (${result.bytes} bytes)`;
            onEvent({ type: 'FILE_CHANGED', taskId, path: String(args.path), diff: `+ ${truncate(String(args.content), 500)}`, ts: Date.now() });
          } else if (call.name === 'file_read') {
            observation = truncate(fileRead(taskId, String(args.path)), 8000);
          } else if (call.name === 'file_list') {
            observation = (await listFiles(taskId)).join('\n');
          } else if (call.name === 'info_search_web') {
            observation = await searchWeb(String(args.query), Number(args.num || 5));
            onEvent({ type: 'TERMINAL_OUTPUT', taskId, cmd: `search_web: ${args.query}`, stdout: observation, stderr: '', exitCode: 0, ts: Date.now() });
          } else if (call.name === 'deploy_expose_port') {
            const exposed = await exposePort(taskId, Number(args.port));
            observation = `URL publica: ${exposed.url}`;
            onEvent({ type: 'FILE_CHANGED', taskId, path: `expose:${exposed.port}`, diff: `+ ${exposed.url}`, ts: Date.now() });
          } else {
            observation = `Ferramenta desconhecida: ${call.name}`;
          }
        } catch (error: any) {
          observation = `Erro em ${call.name}: ${error?.message || String(error)}`;
          onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: observation, ts: Date.now() });
        }

        onEvent({
          type: 'STEP_COMPLETED', taskId, stepId: `tool-${iteration}`,
          success: !observation.startsWith('Erro em '), result: truncate(observation, 300), ts: Date.now(),
        });

        outputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: truncate(observation, 12000),
        });
      }

      nextInput = outputs;
    }

    onEvent({
      type: 'TASK_COMPLETED', taskId,
      summary: `Limite de ${maxIterations} passos atingido. O progresso foi preservado no workspace da tarefa.`,
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
