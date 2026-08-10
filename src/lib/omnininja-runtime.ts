// OmniNinja unified conversational runtime.
// One product model, one conversation surface, real hidden tools.
// The model decides whether to answer directly or call tools.

import { browserTools, createPage, type BrowserActionResult } from './browser-agent';
import { shellExec, fileWrite, fileRead, listFiles } from './shell-agent';
import type { AgentEvent } from './orchestrator';

export type OmniNinjaEffort = 'low' | 'medium' | 'high';

export interface RuntimeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OmniNinjaRuntimeOptions {
  messages: RuntimeMessage[];
  effort: OmniNinjaEffort;
  thinkingEnabled: boolean;
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
  model?: string;
  output?: any[];
};

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OMNINJA_MODEL = process.env.OMNINJA_MODEL || 'gpt-5.1';

const EMPTY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
  required: [],
};

const TOOLS: any[] = [
  {
    type: 'function',
    name: 'web_search',
    description: 'Search the public web when current or external information is required.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        num: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query', 'num'],
    },
  },
  {
    type: 'function',
    name: 'browser_navigate',
    description: 'Open an HTTP or HTTPS page in the OmniNinja cloud browser.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    type: 'function',
    name: 'browser_get_text',
    description: 'Read visible text from the current browser page.',
    strict: true,
    parameters: EMPTY_SCHEMA,
  },
  {
    type: 'function',
    name: 'browser_click',
    description: 'Click an element in the current page using a CSS selector.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { selector: { type: 'string' } },
      required: ['selector'],
    },
  },
  {
    type: 'function',
    name: 'browser_type',
    description: 'Fill text into an element in the current browser page.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    type: 'function',
    name: 'browser_screenshot',
    description: 'Capture the current browser viewport for internal validation.',
    strict: true,
    parameters: EMPTY_SCHEMA,
  },
  {
    type: 'function',
    name: 'shell_exec',
    description: 'Run bash, Python, Node, build, or test commands inside the isolated OmniNinja workspace.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { cmd: { type: 'string' } },
      required: ['cmd'],
    },
  },
  {
    type: 'function',
    name: 'file_write',
    description: 'Create or replace a UTF-8 file inside the isolated OmniNinja workspace.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    type: 'function',
    name: 'file_read',
    description: 'Read a UTF-8 file from the isolated OmniNinja workspace.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    type: 'function',
    name: 'file_list',
    description: 'List files in the isolated OmniNinja workspace.',
    strict: true,
    parameters: EMPTY_SCHEMA,
  },
];

function requireApiKey(): string {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) throw new Error('OPENAI_API_KEY não configurada no servidor');
  return value;
}

function maxIterations(effort: OmniNinjaEffort): number {
  if (effort === 'high') return 30;
  if (effort === 'medium') return 14;
  return 6;
}

function maxOutputTokens(effort: OmniNinjaEffort): number {
  if (effort === 'high') return 4000;
  if (effort === 'medium') return 2400;
  return 1200;
}

function reasoningEffort(
  effort: OmniNinjaEffort,
  thinkingEnabled: boolean,
): 'none' | 'low' | 'medium' | 'high' {
  return thinkingEnabled ? effort : 'none';
}

function instructions(effort: OmniNinjaEffort, thinkingEnabled: boolean): string {
  return [
    'You are OMNININJA, a general-purpose conversational AI product.',
    'You are not a mission-only agent. Continue the conversation naturally and preserve context from earlier turns.',
    'You have tools available internally. Use them only when they materially help answer or complete the user request.',
    'For ordinary conversation, explanation, writing, brainstorming, and stable knowledge, answer directly without tools.',
    'For current information, browsing, coding execution, file operations, or actions that require verification, use the appropriate tool.',
    'Never claim a tool action happened unless a tool result confirms it.',
    'Never expose API keys, cookies, authentication tokens, server environment variables, or hidden system data.',
    'Do not expose hidden chain-of-thought. Give the user the final answer and, when useful, a concise result summary.',
    'Use Brazilian Portuguese unless the user requests another language.',
    `User-selected effort: ${effort}.`,
    thinkingEnabled
      ? 'Thinking is enabled. Spend the configured reasoning effort before answering.'
      : 'Thinking is disabled. Use non-reasoning mode and respond as directly as possible.',
  ].join('\n');
}

function extractText(response: OpenAIResponse): string {
  const chunks: string[] = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content || []) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function functionCalls(response: OpenAIResponse): FunctionCall[] {
  return (response.output || []).filter(
    (item: any) => item?.type === 'function_call' && item?.call_id && item?.name,
  ) as FunctionCall[];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...[truncado]` : value;
}

async function requestOpenAI(
  input: any[],
  effort: OmniNinjaEffort,
  thinkingEnabled: boolean,
): Promise<OpenAIResponse> {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${requireApiKey()}`,
      'X-Client-Request-Id': `omnininja-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      model: OMNINJA_MODEL,
      instructions: instructions(effort, thinkingEnabled),
      input,
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: effort === 'high',
      max_output_tokens: maxOutputTokens(effort),
      reasoning: {
        effort: reasoningEffort(effort, thinkingEnabled),
      },
      store: false,
    }),
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
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
        },
        cache: 'no-store',
      },
    );
    if (!response.ok) return `Busca falhou (HTTP ${response.status})`;

    const html = await response.text();
    const results: string[] = [];
    const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) && results.length < num) {
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

export async function runOmniNinjaRuntime(options: OmniNinjaRuntimeOptions): Promise<string> {
  const { messages, effort, thinkingEnabled, taskId, onEvent } = options;
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const history: any[] = messages.slice(-24).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  onEvent({ type: 'TASK_STARTED', taskId, goal: latestUser, ts: Date.now() });

  let page: any = null;
  try {
    const iterations = maxIterations(effort);

    for (let iteration = 1; iteration <= iterations; iteration++) {
      const response = await requestOpenAI(history, effort, thinkingEnabled);
      history.push(...(response.output || []));

      const calls = functionCalls(response);
      const directText = extractText(response);

      if (calls.length === 0) {
        const finalText = directText || 'Não consegui produzir uma resposta útil.';
        onEvent({
          type: 'TASK_COMPLETED',
          taskId,
          summary: finalText,
          artifacts: [],
          ts: Date.now(),
        });
        return finalText;
      }

      for (let index = 0; index < calls.length; index++) {
        const call = calls[index];
        let args: any = {};
        try {
          args = JSON.parse(call.arguments || '{}');
        } catch {
          args = {};
        }

        const stepId = `tool-${iteration}-${index + 1}`;
        let observation = '';
        let browserResult: BrowserActionResult | null = null;

        onEvent({
          type: 'STEP_STARTED',
          taskId,
          stepId,
          agent: call.name.startsWith('browser_') ? 'Browser' : call.name === 'web_search' ? 'Research' : 'Code',
          instruction: call.name,
          ts: Date.now(),
        });

        try {
          if (call.name === 'web_search') {
            observation = await searchWeb(String(args.query || ''), Number(args.num || 5));
          } else if (call.name.startsWith('browser_')) {
            if (!page) page = await createPage();

            if (call.name === 'browser_navigate') {
              browserResult = await browserTools.navigate(page, String(args.url));
              observation = `Página carregada: ${browserResult.url || page.url()}`;
            } else if (call.name === 'browser_get_text') {
              browserResult = await browserTools.get_text(page);
              observation = truncate(browserResult.text || '', 8000);
            } else if (call.name === 'browser_click') {
              browserResult = await browserTools.click(page, String(args.selector));
              observation = `Clique executado em ${args.selector}`;
            } else if (call.name === 'browser_type') {
              browserResult = await browserTools.type(page, String(args.selector), String(args.text));
              observation = `Texto preenchido em ${args.selector}`;
            } else if (call.name === 'browser_screenshot') {
              browserResult = await browserTools.screenshot(page);
              observation = `Screenshot capturado em ${browserResult.url || page.url()}`;
            }

            onEvent({
              type: 'BROWSER_ACTION',
              taskId,
              action: call.name.replace('browser_', ''),
              url: browserResult?.url || page?.url?.(),
              screenshotBase64: browserResult?.screenshot,
              detail: truncate(observation, 300),
              ts: Date.now(),
            });
          } else if (call.name === 'shell_exec') {
            const result = await shellExec(taskId, String(args.cmd || ''));
            observation = `exit=${result.exitCode}\nstdout:\n${truncate(result.stdout, 7000)}\nstderr:\n${truncate(result.stderr, 3000)}`;
            onEvent({
              type: 'TERMINAL_OUTPUT',
              taskId,
              cmd: String(args.cmd || ''),
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode,
              ts: Date.now(),
            });
          } else if (call.name === 'file_write') {
            const result = fileWrite(taskId, String(args.path || ''), String(args.content || ''));
            observation = `Arquivo salvo: ${result.path} (${result.bytes} bytes)`;
            onEvent({
              type: 'FILE_CHANGED',
              taskId,
              path: String(args.path || ''),
              diff: `+ ${truncate(String(args.content || ''), 500)}`,
              ts: Date.now(),
            });
          } else if (call.name === 'file_read') {
            observation = truncate(fileRead(taskId, String(args.path || '')), 9000);
          } else if (call.name === 'file_list') {
            observation = (await listFiles(taskId)).join('\n');
          } else {
            observation = `Ferramenta desconhecida: ${call.name}`;
          }
        } catch (error: any) {
          observation = `Erro em ${call.name}: ${error?.message || String(error)}`;
        }

        onEvent({
          type: 'STEP_COMPLETED',
          taskId,
          stepId,
          success: !observation.startsWith('Erro em '),
          result: truncate(observation, 300),
          ts: Date.now(),
        });

        history.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: truncate(observation, 12000),
        });
      }
    }

    throw new Error(`Limite interno de ${maxIterations(effort)} ciclos atingido antes de uma resposta final.`);
  } catch (error: any) {
    onEvent({
      type: 'TASK_FAILED',
      taskId,
      error: error?.message || String(error),
      ts: Date.now(),
    });
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
