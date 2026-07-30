'use client';

import { useCallback, useRef } from 'react';
import { useOmni, type ProviderId, type AgentMode, type ChatMessage } from '@/lib/store';
import { buildEventTimeline, type AgentEvent } from '@/lib/orchestrator';
import { toast } from 'sonner';

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

/**
 * Drives the OmniNinja experience end-to-end on the client.
 *
 * 3 MODOS (igual Manus AI):
 * - chat:      conversa normal e rapida, sem ferramentas. Vai direto para /api/chat.
 * - agent:     fala com o usuario (normal) + usa ferramentas. Pensamento mais profundo.
 *              Vai para /api/agent/run com mode=agent. O agente "fala" via message_notify_user.
 * - agent_max: poder maximo. Cria sites, deploya, executa tarefas complexas.
 *              Vai para /api/agent/run com mode=agent_max. Mais iteracoes.
 *
 * Em TODOS os modos o agente conversa normalmente com o usuario. A diferenca e
 * que agent/agent_max tem acesso a ferramentas (navegador, terminal, arquivos)
 * e "pensam" mais antes de responder.
 */
export function useAgentRunner() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopRef = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    if (stopRef.current) return;
    const t = setTimeout(fn, delay);
    timers.current.push(t);
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    clearTimers();
    useOmni.getState().updateTaskStatus('cancelled');
    toast.info('Execução interrompida');
  }, [clearTimers]);

  const run = useCallback(
    async (text: string, model: ProviderId, mode: AgentMode) => {
      stopRef.current = false;
      clearTimers();

      const store = useOmni.getState();
      const userMsg: ChatMessage = {
        id: uid(), role: 'user', content: text, createdAt: Date.now(),
      };
      store.pushMessage(userMsg);

      // ===== MODO CHAT — conversa normal, rapida, sem ferramentas =====
      if (mode === 'chat') {
        const aMsg: ChatMessage = {
          id: uid(), role: 'assistant', content: '', model: String(model), streaming: true, createdAt: Date.now(),
        };
        store.pushMessage(aMsg);
        const freshMessages = useOmni.getState().messages;
        try {
          await streamLLMChat(text, freshMessages, model, (chunk) => {
            useOmni.getState().updateMessage(aMsg.id, { content: chunk });
          });
        } catch (err: any) {
          const reply = chatReply(text);
          await streamText(reply, (chunk) => {
            useOmni.getState().updateMessage(aMsg.id, { content: chunk });
          }, 10);
          toast.warning('LLM indisponível — usando resposta local', { description: err?.message });
        }
        useOmni.getState().updateMessage(aMsg.id, { streaming: false });
        return;
      }

      // ===== MODO AGENT / AGENT MAX — ferramentas + conversa =====
      // O agente usa ferramentas reais (navegador, terminal, arquivos) e
      // FALA com o usuario via message_notify_user durante a execucao.
      // Tudo e transmitido em tempo real via SSE.

      const modeLabel = mode === 'agent_max' ? 'Agent MAX' : 'Agent';

      store.setCurrentTask({
        id: uid(),
        goal: text,
        mode,
        model,
        status: 'running',
        steps: [],
        stepsDone: 0,
        events: [],
        artifacts: [],
        startedAt: Date.now(),
      });
      store.setComputerOpen(true);
      store.setLive(true);
      store.setReplayIndex(null);

      // Mensagem introdutoria do assistente (conversa normal)
      const introMsg: ChatMessage = {
        id: uid(), role: 'assistant', content: '', model: String(model), streaming: true, createdAt: Date.now(),
      };
      store.pushMessage(introMsg);
      const introText = mode === 'agent_max'
        ? `Modo **Agent MAX** ativado! 🚀 Vou resolver isso com poder total — posso criar sites, deployar apps, rodar código e muito mais. Acompanhe pelo painel **Computador** à direita. Deixa comigo!`
        : `Modo **Agent** ativado! 🧠 Vou pensar com mais calma e usar ferramentas reais (navegador + terminal) para resolver isso. Acompanhe pelo painel **Computador** à direita.`;
      await streamText(
        introText,
        (chunk) => useOmni.getState().updateMessage(introMsg.id, { content: chunk }),
        10
      );
      useOmni.getState().updateMessage(introMsg.id, { streaming: false });

      // Executa o agente REAL via SSE
      // O agente vai "falar" com o usuario durante a execucao via message_notify_user.
      // Essas mensagens sao exibidas no chat em tempo real (conversa natural).
      let finalSummary = '';
      const conversationalMessages: ChatMessage[] = []; // mensagens do agente durante execucao

      try {
        await runRealAgent(text, mode, model, (event) => {
          const s = useOmni.getState();
          s.appendEvent(event);

          // ===== STREAM MENSAGENS CONVERSACIONAIS NO CHAT =====
          // Quando o agente usa message_notify_user, emitimos AGENT_THINKING com agent='OmniNinja'.
          // Esses eventos viram mensagens de chat em tempo real — o usuario ve o agente "falando".
          if (event.type === 'AGENT_THINKING' && event.agent === 'OmniNinja' && event.text) {
            // Cria uma nova mensagem de chat para cada fala do agente
            const talkMsg: ChatMessage = {
              id: uid(),
              role: 'assistant',
              content: event.text,
              model: String(model),
              streaming: false,
              createdAt: Date.now(),
            };
            conversationalMessages.push(talkMsg);
            useOmni.getState().pushMessage(talkMsg);
          }

          // auto-switch computer tab based on event type
          if (event.type === 'BROWSER_ACTION') {
            s.setComputerTab('browser');
          } else if (event.type === 'TERMINAL_OUTPUT') {
            s.setComputerTab('terminal');
          } else if (event.type === 'FILE_CHANGED') {
            s.setComputerTab('code');
          } else if (event.type === 'PLAN_CREATED') {
            s.setComputerTab('code');
          } else if (event.type === 'TASK_COMPLETED') {
            finalSummary = event.summary;
          }
        }, (screenshot) => {
          useOmni.getState().setScreenshot(screenshot);
        });
      } catch (err: any) {
        finalSummary = `Erro na execução: ${err.message}`;
      }

      // Mensagem final de resumo
      const sumMsg: ChatMessage = {
        id: uid(), role: 'assistant', content: '', model: String(model), streaming: true, createdAt: Date.now(),
      };
      useOmni.getState().pushMessage(sumMsg);
      await streamText(finalSummary || 'Tarefa concluída.', (chunk) => {
        useOmni.getState().updateMessage(sumMsg.id, { content: chunk });
      }, 8);
      useOmni.getState().updateMessage(sumMsg.id, { streaming: false });
    },
    [clearTimers, schedule]
  );

  return { run, stop };
}

/**
 * Runs the REAL agent via /api/agent/run (SSE).
 * Receives events and screenshots from the server-side agent loop
 * (LLM + Browserless + shell), feeds them into the store.
 */
async function runRealAgent(
  goal: string,
  mode: string,
  model: string,
  onEvent: (event: AgentEvent) => void,
  onScreenshot: (base64: string) => void
) {
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal, mode, model }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`agent run HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingScreenshot = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '{}' || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (obj.type === 'screenshot') {
          pendingScreenshot = obj.data;
          onScreenshot(pendingScreenshot);
        } else if (obj.type === 'event' && obj.event) {
          // If the event has hasScreenshot flag, attach the pending screenshot
          const event = obj.event as AgentEvent;
          if (obj.hasScreenshot && pendingScreenshot) {
            (event as any).screenshotBase64 = pendingScreenshot;
          }
          onEvent(event);
        } else if (obj.type === 'error') {
          throw new Error(obj.error);
        }
      } catch (e) {
        // ignore parse errors on partial chunks
      }
    }
  }
}

/**
 * Streams a real LLM chat response from /api/chat (SSE).
 * Falls back throws so caller can use a canned reply.
 */
async function streamLLMChat(
  text: string,
  history: ChatMessage[],
  model: ProviderId,
  onChunk: (full: string) => void
) {
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content && !m.streaming)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, model }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`chat HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '{}' || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (obj.type === 'delta' && obj.text) {
          full += obj.text;
          onChunk(full);
        } else if (obj.type === 'error') {
          throw new Error(obj.error);
        }
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }
  if (full) onChunk(full);
}

async function streamText(text: string, onChunk: (full: string) => void, speed = 14) {
  // simulate token-by-token streaming (production uses SSE from the LLM)
  let i = 0;
  // stream word-by-word for readability, char granularity for short text
  const tokens = text.length > 120 ? text.split(/(\s+)/) : text.split('');
  for (const tk of tokens) {
    i += tk.length;
    onChunk(text.slice(0, i));
    await new Promise((r) => setTimeout(r, speed + Math.random() * 18));
  }
  onChunk(text);
}

function chatReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('olá') || t.includes('ola') || t.includes('oi') || t.includes('hello') || t.includes('hi')) {
    return 'Olá! 👋 Sou o **OmniNinja**. Posso responder direto (modo Chat) ou abrir o **Computador** com sandbox, terminal e navegador para executar tarefas reais (modo Agent / Agent MAX).\n\nO que você gostaria de fazer?';
  }
  if (t.includes('o que você') || t.includes('o que voce') || t.includes('quem é') || t.includes('quem e')) {
    return 'Sou um **agente de IA autônomo** inspirado no Manus AI e no Ninja AI. Decomponho tarefas, delego a sub-agentes especializados (Browser, Code, Research, Memory, Chat) e mostro cada passo em tempo real num painel "Computador" dentro do chat.\n\nPara uma tarefa real, mude para o modo **Agent** e descreva o que precisa.';
  }
  if (t.includes('modelo') || t.includes('modelos')) {
    return 'O OmniNinja é **model-agnostic**: orquestra 5 provedores — Claude, GPT, Gemini, Kimi e Grok via OpenRouter. O seletor mostra apenas os que têm chave configurada. Se o modelo escolhido falhar, há fallback automático.';
  }
  return `Entendi. Isso parece uma **pergunta** — respondi direto no modo Chat.\n\nSe você quiser que eu **execute** algo de verdade (criar site, pesquisar, rodar código), mude para o modo **Agent** ou **Agent MAX** no seletor abaixo e envie novamente. Abrirei o painel Computador com sandbox, terminal e navegador reais. 🥷`;
}
