// OmniNinja — Real Agent Loop (estilo Manus)
// O Orquestrador: usa o LLM (via OpenRouter) para decidir qual ferramenta
// chamar a cada passo, executa, alimenta a observação de volta, repete até
// concluir a tarefa. Loop real (analisar -> escolher ferramenta -> executar
// -> iterar), igual ao Manus AI.

import { completion, type OpenRouterModel, type ChatMessage } from './openrouter';
import { browserTools, createPage, closeBrowser, type BrowserActionResult } from './browser-agent';
import { shellExec, fileWrite, fileRead, exposePort } from './shell-agent';
import type { AgentEvent } from './orchestrator';

export interface AgentLoopOptions {
  goal: string;
  mode: string; // chat | agent | agent_max
  model: string; // provider id (claude, chatgpt, ...) -> OpenRouterModel
  taskId: string;
  onEvent: (event: AgentEvent) => void;
}

const MAX_ITERATIONS = 20;

const SYSTEM_PROMPT = `Você é o OmniNinja, um orquestrador de agentes de IA autônomo (estilo Manus AI). Você recebe uma tarefa e decide qual ferramenta usar a cada passo, até entregar o resultado final.

FERRAMENTAS DISPONÍVEIS (responda SEMPRE em JSON válido, um único objeto):

1. {"tool":"browser_navigate","args":{"url":"https://..."}}  — abre uma URL no navegador real (Chromium)
2. {"tool":"browser_click","args":{"selector":"button.submit"}}  — clica num elemento (seletor CSS)
3. {"tool":"browser_type","args":{"selector":"input[name=q]","text":"busca"}}  — preenche um campo
4. {"tool":"browser_scroll_down","args":{}}  — rola a página pra baixo
5. {"tool":"browser_scroll_up","args":{}}  — rola a página pra cima
6. {"tool":"browser_screenshot","args":{}}  — tira screenshot e vê a página
7. {"tool":"browser_get_text","args":{}}  — extrai o texto visível da página
8. {"tool":"browser_execute_js","args":{"script":"document.title"}}  — executa JavaScript na página
9. {"tool":"browser_press_key","args":{"key":"Enter"}}  — pressiona uma tecla
10. {"tool":"shell_exec","args":{"cmd":"ls -la"}}  — executa comando bash/python/node REAL no sandbox
11. {"tool":"file_write","args":{"path":"arquivo.txt","content":"conteúdo"}}  — cria/sobrescreve arquivo
12. {"tool":"file_read","args":{"path":"arquivo.txt"}}  — lê conteúdo de arquivo
13. {"tool":"info_search_web","args":{"query":"termo de busca","num":5}}  — busca na web ( DuckDuckGo HTML )
14. {"tool":"deploy_expose_port","args":{"port":3000}}  — expõe uma porta local para acesso público
15. {"tool":"finish","args":{"summary":"resumo do que fez"}}  — QUANDO TERMINAR a tarefa

REGRAS (iguais às do Manus):
- Responda SEMPRE com UM JSON válido, nada mais (sem markdown, sem texto fora do JSON).
- Após cada ação, você recebe a observação (resultado). Decida a próxima com base nela.
- Máximo ${MAX_ITERATIONS} ações. Se não conseguir terminar, use "finish" com o progresso.
- Seja eficiente: não navegue sem propósito, não rode comandos desnecessários.
- Para criar sites/código: use file_write com o código COMPLETO.
- Para pesquisar: use info_search_web ou browser_navigate em sites relevantes, depois browser_get_text.
- Para servir um app: crie os arquivos com file_write, instale dependências via shell_exec, rode via shell_exec em background, depois deploy_expose_port.
- Sempre em português nos resumos e observações.`;

interface ToolCall {
  tool: string;
  args: any;
}

function parseToolCall(text: string): ToolCall | null {
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const jsonStr = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...[truncado]' : s;
}

// Busca web simples via DuckDuckGo HTML (sem chave necessária).
async function searchWeb(query: string, num = 5): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    });
    if (!res.ok) return `Busca falhou (HTTP ${res.status})`;
    const html = await res.text();
    // Extrai títulos + links + snippets do HTML do DDG
    const results: string[] = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(html)) && count < num) {
      const link = m[1].replace(/&amp;/g, '&');
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      const snippet = m[3].replace(/<[^>]+>/g, '').trim();
      results.push(`${count + 1}. ${title}\n   ${snippet}\n   ${link}`);
      count++;
    }
    if (results.length === 0) {
      // fallback: pega qualquer texto útil
      return `Busca por "${query}" não retornou resultados estruturados. Tente browser_navigate em um site específico.`;
    }
    return results.join('\n\n');
  } catch (err: any) {
    return `Erro na busca: ${err.message}`;
  }
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<void> {
  const { goal, taskId, onEvent, model } = opts;

  onEvent({ type: 'TASK_STARTED', taskId, goal, ts: Date.now() });
  const planSteps = [
    { id: 's1', title: 'Analisar objetivo', agent: 'Chat' as const, instruction: goal },
    { id: 's2', title: 'Executar ações', agent: 'Code' as const, instruction: 'Usar ferramentas' },
    { id: 's3', title: 'Entregar resultado', agent: 'Memory' as const, instruction: 'Resumir' },
  ];
  onEvent({ type: 'PLAN_CREATED', taskId, steps: planSteps, ts: Date.now() });

  const providerModel = (model as OpenRouterModel) || 'claude';

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Tarefa: ${goal}\n\nDecida a primeira ação (responda em JSON):` },
  ];

  let page: any = null;
  let stepNum = 0;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      stepNum = i + 1;

      onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: `Decidindo ação ${stepNum}...`, ts: Date.now() });

      let llmResponse = '';
      try {
        const result = await completion({
          messages,
          model: providerModel,
          temperature: 0.4,
          maxTokens: 256,
          fallback: true,
        });
        llmResponse = result.content;
      } catch (err: any) {
        onEvent({ type: 'TASK_FAILED', taskId, error: `LLM error: ${err.message}`, ts: Date.now() });
        return;
      }

      const toolCall = parseToolCall(llmResponse);
      if (!toolCall) {
        messages.push({ role: 'assistant', content: llmResponse });
        messages.push({ role: 'user', content: 'Responda apenas com JSON válido da próxima ferramenta.' });
        continue;
      }

      messages.push({ role: 'assistant', content: llmResponse });

      if (toolCall.tool === 'finish') {
        const summary = toolCall.args?.summary ?? 'Tarefa concluída.';
        onEvent({ type: 'STEP_COMPLETED', taskId, stepId: `s${stepNum}`, success: true, result: summary, ts: Date.now() });
        onEvent({
          type: 'TASK_COMPLETED',
          taskId,
          summary,
          artifacts: [{ name: 'workspace', kind: 'file', path: `/opt/omnininja/workspaces/${taskId}`, sizeBytes: 0 }],
          ts: Date.now(),
        });
        return;
      }

      onEvent({
        type: 'STEP_STARTED',
        taskId,
        stepId: `s${stepNum}`,
        agent: toolCall.tool.startsWith('browser') ? 'Browser' : 'Code',
        instruction: `${toolCall.tool} ${JSON.stringify(toolCall.args).slice(0, 100)}`,
        ts: Date.now(),
      });

      let observation = '';
      let browserResult: BrowserActionResult | null = null;

      try {
        if (toolCall.tool.startsWith('browser_')) {
          if (!page) {
            onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Browser', text: 'Abrindo Chromium local...', ts: Date.now() });
            page = await createPage();
          }
          const toolName = toolCall.tool.replace('browser_', '');
          const args = toolCall.args || {};

          switch (toolName) {
            case 'navigate':
              browserResult = await browserTools.navigate(page, args.url);
              observation = `Página carregada: ${browserResult.url}. Título: ${browserResult.title}`;
              break;
            case 'click':
              browserResult = await browserTools.click(page, args.selector);
              observation = `Clicou em ${args.selector}`;
              break;
            case 'type':
              browserResult = await browserTools.type(page, args.selector, args.text);
              observation = `Digitou "${args.text}" em ${args.selector}`;
              break;
            case 'scroll_down':
              browserResult = await browserTools.scroll_down(page);
              observation = 'Rolou para baixo';
              break;
            case 'scroll_up':
              browserResult = await browserTools.scroll_up(page);
              observation = 'Rolou para cima';
              break;
            case 'screenshot':
              browserResult = await browserTools.screenshot(page);
              observation = `Screenshot capturado. URL: ${browserResult.url}`;
              break;
            case 'get_text':
              browserResult = await browserTools.get_text(page);
              observation = `Texto da página: ${truncate(browserResult.text ?? '', 2000)}`;
              break;
            case 'get_html':
              browserResult = await browserTools.get_html(page);
              observation = `HTML: ${truncate(browserResult.text ?? '', 2000)}`;
              break;
            case 'execute_js':
              browserResult = await browserTools.execute_js(page, args.script);
              observation = `Resultado JS: ${truncate(browserResult.text ?? '', 1000)}`;
              break;
            case 'press_key':
              browserResult = await browserTools.press_key(page, args.key);
              observation = `Pressionou ${args.key}`;
              break;
            case 'go_back':
              browserResult = await browserTools.go_back(page);
              observation = `Voltou para ${browserResult.url}`;
              break;
            default:
              observation = `Ferramenta de navegador desconhecida: ${toolCall.tool}`;
          }

          onEvent({
            type: 'BROWSER_ACTION',
            taskId,
            action: toolName,
            url: browserResult.url,
            screenshotBase64: browserResult.screenshot,
            detail: observation,
            ts: Date.now(),
          });
        } else if (toolCall.tool === 'shell_exec') {
          const result = await shellExec(taskId, toolCall.args.cmd);
          onEvent({
            type: 'TERMINAL_OUTPUT',
            taskId,
            cmd: toolCall.args.cmd,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            ts: Date.now(),
          });
          observation = `Comando: ${toolCall.args.cmd}\nSaída: ${truncate(result.stdout || result.stderr, 2000)}\nExit code: ${result.exitCode}`;
        } else if (toolCall.tool === 'file_write') {
          const result = fileWrite(taskId, toolCall.args.path, toolCall.args.content);
          onEvent({
            type: 'FILE_CHANGED',
            taskId,
            path: toolCall.args.path,
            diff: `+ ${toolCall.args.content.slice(0, 500)}`,
            ts: Date.now(),
          });
          observation = `Arquivo criado: ${result.path} (${result.bytes} bytes)`;
        } else if (toolCall.tool === 'file_read') {
          const content = fileRead(taskId, toolCall.args.path);
          observation = `Conteúdo de ${toolCall.args.path}: ${truncate(content, 2000)}`;
        } else if (toolCall.tool === 'info_search_web') {
          const results = await searchWeb(toolCall.args.query, toolCall.args.num ?? 5);
          observation = `Resultados da busca por "${toolCall.args.query}":\n${results}`;
          onEvent({
            type: 'TERMINAL_OUTPUT',
            taskId,
            cmd: `search_web: ${toolCall.args.query}`,
            stdout: results,
            stderr: '',
            exitCode: 0,
            ts: Date.now(),
          });
        } else if (toolCall.tool === 'deploy_expose_port') {
          const exposed = await exposePort(taskId, toolCall.args.port);
          observation = `Porta ${toolCall.args.port} exposta. URL pública: ${exposed.url}`;
          onEvent({
            type: 'FILE_CHANGED',
            taskId,
            path: `expose:${toolCall.args.port}`,
            diff: `+ ${exposed.url}`,
            ts: Date.now(),
          });
        } else {
          observation = `Ferramenta não reconhecida: ${toolCall.tool}`;
        }
      } catch (err: any) {
        observation = `Erro ao executar ${toolCall.tool}: ${err.message}`;
        onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: observation, ts: Date.now() });
      }

      onEvent({ type: 'STEP_COMPLETED', taskId, stepId: `s${stepNum}`, success: true, result: observation.slice(0, 200), ts: Date.now() });

      messages.push({ role: 'user', content: `Observação: ${observation}\n\nPróxima ação (JSON):` });
    }

    onEvent({
      type: 'TASK_COMPLETED',
      taskId,
      summary: `Tarefa interrompida após ${MAX_ITERATIONS} ações. Veja o progresso no painel.`,
      artifacts: [],
      ts: Date.now(),
    });
  } finally {
    if (page) {
      try {
        const ctx = page.context();
        await page.close().catch(() => {});
        await ctx.close().catch(() => {}); // fecha context isolado da task
      } catch {}
    }
  }
}
