// OmniNinja — Real Agent Loop (estilo Manus)
// O Orquestrador: usa o LLM (via OpenRouter) para decidir qual ferramenta
// chamar a cada passo, executa, alimenta a observacao de volta, repete ate
// concluir a tarefa. Loop real (analisar -> escolher ferramenta -> executar
// -> iterar), igual ao Manus AI.
//
// 3 MODOS (igual Manus AI):
// - chat:      NAO usa este loop — e conversa normal via /api/chat
// - agent:     ferramentas + fala com o usuario, pensa mais, 15 iteracoes
// - agent_max: poder maximo, cria sites/deploy, 30 iteracoes, fala tambem

import { completion, type OpenRouterModel, type ChatMessage } from './openrouter';
import { browserTools, createPage, closeBrowser, type BrowserActionResult } from './browser-agent';
import { shellExec, fileWrite, fileRead, exposePort } from './shell-agent';
import type { AgentEvent } from './orchestrator';

export interface AgentLoopOptions {
  goal: string;
  mode: string; // agent | agent_max (chat nunca chega aqui)
  model: string; // provider id (claude, chatgpt, ...) -> OpenRouterModel
  taskId: string;
  onEvent: (event: AgentEvent) => void;
}

// Iteracoes dinamicas por modo — agent_max tem mais rodadas para tarefas complexas
function maxIterationsFor(mode: string): number {
  if (mode === 'agent_max') return 30;
  return 15; // agent
}

// System prompt dinamico por modo
function systemPromptFor(mode: string, maxIter: number): string {
  const isMax = mode === 'agent_max';

  const powerLine = isMax
    ? `Voce esta no modo AGENT MAX — poder maximo. Voce pode criar sites completos, deployar aplicacoes, executar tarefas longas e complexas. Pense profundamente, decomponha problemas grandes em sub-passos, e NAO desista facilmente. Use todas as ${maxIter} iteracoes se necessario. Quando criar um site/app, sirva-o com shell_exec (background) e use deploy_expose_port para dar a URL publica ao usuario.`
    : `Voce esta no modo AGENT — inteligente e capaz. Use ferramentas quando necessario, pense antes de agir, explique ao usuario o que esta fazendo. Voce tem ate ${maxIter} iteracoes. Seja eficiente mas cuidadoso.`;

  return `Voce e o OmniNinja, um agente de IA autonomo (estilo Manus AI). ${powerLine}

REGRA DE OURO — FALE COM O USUARIO: Antes de executar acoes importantes (navegar, rodar comandos, criar arquivos), use a ferramenta "message_notify_user" para explicar o que vai fazer e por que, como se estivesse conversando. EXEMPLO: {"tool":"message_notify_user","args":{"text":"Vou pesquisar sobre o tema primeiro para te dar uma resposta fundamentada."}}. Isso deixa a experiencia natural — o usuario te ve "pensando em voz alta", igual a um humano trabalhando.

FERRAMENTAS DISPONIVEIS (responda SEMPRE em JSON valido, um unico objeto):

1. {"tool":"message_notify_user","args":{"text":"mensagem para o usuario"}} — FALA com o usuario (conversa normal, explica o que esta fazendo). USE SEMPRE antes de acoes importantes e para dar atualizacoes.
2. {"tool":"browser_navigate","args":{"url":"https://..."}} — abre uma URL no navegador real (Chromium via Browserless)
3. {"tool":"browser_click","args":{"selector":"button.submit"}} — clica num elemento (seletor CSS)
4. {"tool":"browser_type","args":{"selector":"input[name=q]","text":"busca"}} — preenche um campo
5. {"tool":"browser_scroll_down","args":{}} — rola a pagina pra baixo
6. {"tool":"browser_scroll_up","args":{}} — rola a pagina pra cima
7. {"tool":"browser_screenshot","args":{}} — tira screenshot e ve a pagina
8. {"tool":"browser_get_text","args":{}} — extrai o texto visivel da pagina
9. {"tool":"browser_execute_js","args":{"script":"document.title"}} — executa JavaScript na pagina
10. {"tool":"browser_press_key","args":{"key":"Enter"}} — pressiona uma tecla
11. {"tool":"shell_exec","args":{"cmd":"ls -la"}} — executa comando bash/python/node REAL no sandbox
12. {"tool":"file_write","args":{"path":"arquivo.txt","content":"conteudo"}} — cria/sobrescreve arquivo
13. {"tool":"file_read","args":{"path":"arquivo.txt"}} — le conteudo de arquivo
14. {"tool":"info_search_web","args":{"query":"termo de busca","num":5}} — busca na web (DuckDuckGo HTML)
15. {"tool":"deploy_expose_port","args":{"port":3000}} — expoe uma porta local para acesso publico
16. {"tool":"finish","args":{"summary":"resumo do que fez"}} — QUANDO TERMINAR a tarefa

REGRAS (iguais as do Manus):
- Responda SEMPRE com UM JSON valido, nada mais (sem markdown, sem texto fora do JSON).
- Apos cada acao, voce recebe a observacao (resultado). Decida a proxima com base nela.
- Maximo ${maxIter} acoes. Se nao conseguir terminar, use "finish" com o progresso.
- Para criar sites/codigo: use file_write com o codigo COMPLETO.
- Para pesquisar: use info_search_web ou browser_navigate em sites relevantes, depois browser_get_text.
- Para servir um app: crie os arquivos com file_write, instale dependencias via shell_exec, rode via shell_exec em background, depois deploy_expose_port.
- SEMPRE que for fazer algo importante, AVISE o usuario com message_notify_user primeiro.
- Sempre em portugues do Brasil nas mensagens ao usuario e resumos.`;
}

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

// Busca web simples via DuckDuckGo HTML (sem chave necessaria).
async function searchWeb(query: string, num = 5): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    });
    if (!res.ok) return `Busca falhou (HTTP ${res.status})`;
    const html = await res.text();
    // Extrai titulos + links + snippets do HTML do DDG
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
      // fallback: pega qualquer texto util
      return `Busca por "${query}" nao retornou resultados estruturados. Tente browser_navigate em um site especifico.`;
    }
    return results.join('\n\n');
  } catch (err: any) {
    return `Erro na busca: ${err.message}`;
  }
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<void> {
  const { goal, taskId, onEvent, model, mode } = opts;
  const MAX_ITERATIONS = maxIterationsFor(mode);
  const SYSTEM_PROMPT = systemPromptFor(mode, MAX_ITERATIONS);

  onEvent({ type: 'TASK_STARTED', taskId, goal, ts: Date.now() });
  const planSteps = [
    { id: 's1', title: 'Analisar objetivo', agent: 'Chat' as const, instruction: goal },
    { id: 's2', title: 'Executar acoes', agent: 'Code' as const, instruction: 'Usar ferramentas' },
    { id: 's3', title: 'Entregar resultado', agent: 'Memory' as const, instruction: 'Resumir' },
  ];
  onEvent({ type: 'PLAN_CREATED', taskId, steps: planSteps, ts: Date.now() });

  const providerModel = (model as OpenRouterModel) || 'claude';

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Tarefa: ${goal}\n\nComece avisando o usuario o que vai fazer (use message_notify_user), depois execute. Responda em JSON:` },
  ];

  let page: any = null;
  let stepNum = 0;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      stepNum = i + 1;

      onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: `Pensando... (passo ${stepNum}/${MAX_ITERATIONS})`, ts: Date.now() });

      let llmResponse = '';
      try {
        const result = await completion({
          messages,
          model: providerModel,
          temperature: 0.5,
          maxTokens: 300,
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
        messages.push({ role: 'user', content: 'Responda apenas com JSON valido da proxima ferramenta.' });
        continue;
      }

      messages.push({ role: 'assistant', content: llmResponse });

      // finish — tarefa concluida
      if (toolCall.tool === 'finish') {
        const summary = toolCall.args?.summary ?? 'Tarefa concluida.';
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

      // message_notify_user — o agente FALA com o usuario (conversa natural)
      if (toolCall.tool === 'message_notify_user') {
        const userMsg = toolCall.args?.text ?? '';
        // Emite um evento AGENT_THINKING com a mensagem — o client vai exibir no chat
        onEvent({ type: 'AGENT_THINKING', taskId, agent: 'OmniNinja', text: userMsg, ts: Date.now() });
        messages.push({ role: 'user', content: `Observacao: Mensagem enviada ao usuario. Continue com a proxima acao (JSON):` });
        continue;
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
            onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Browser', text: 'Abrindo navegador (Browserless/Chromium)...', ts: Date.now() });
            page = await createPage();
          }
          const toolName = toolCall.tool.replace('browser_', '');
          const args = toolCall.args || {};

          switch (toolName) {
            case 'navigate':
              browserResult = await browserTools.navigate(page, args.url);
              observation = `Pagina carregada: ${browserResult.url}. Titulo: ${browserResult.title}`;
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
              observation = `Texto da pagina: ${truncate(browserResult.text ?? '', 2000)}`;
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
            url: browserResult?.url,
            screenshotBase64: browserResult?.screenshot,
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
          observation = `Comando: ${toolCall.args.cmd}\nSaida: ${truncate(result.stdout || result.stderr, 2000)}\nExit code: ${result.exitCode}`;
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
          observation = `Conteudo de ${toolCall.args.path}: ${truncate(content, 2000)}`;
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
          observation = `Porta ${toolCall.args.port} exposta. URL publica: ${exposed.url}`;
          onEvent({
            type: 'FILE_CHANGED',
            taskId,
            path: `expose:${toolCall.args.port}`,
            diff: `+ ${exposed.url}`,
            ts: Date.now(),
          });
        } else {
          observation = `Ferramenta nao reconhecida: ${toolCall.tool}`;
        }
      } catch (err: any) {
        observation = `Erro ao executar ${toolCall.tool}: ${err.message}`;
        onEvent({ type: 'AGENT_THINKING', taskId, agent: 'Orchestrator', text: observation, ts: Date.now() });
      }

      onEvent({ type: 'STEP_COMPLETED', taskId, stepId: `s${stepNum}`, success: true, result: observation.slice(0, 200), ts: Date.now() });

      messages.push({ role: 'user', content: `Observacao: ${observation}\n\nProxima acao (JSON):` });
    }

    onEvent({
      type: 'TASK_COMPLETED',
      taskId,
      summary: `Tarefa interrompida apos ${MAX_ITERATIONS} acoes. Veja o progresso no painel.`,
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
