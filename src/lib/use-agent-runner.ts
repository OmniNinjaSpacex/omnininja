'use client';

import { useCallback, useRef } from 'react';
import {
  useOmni,
  type ProviderId,
  type AgentMode,
  type ChatMessage,
  type BrowserSessionState,
} from '@/lib/store';
import type { AgentEvent } from '@/lib/orchestrator';
import { toast } from 'sonner';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Erro desconhecido');
}

/**
 * Chatbox-first OmniNinja runner.
 *
 * The UI exposes one conversation surface. Internally, requests are routed to:
 * - /api/chat for normal conversation
 * - /api/agent/run for OpenAI tool calling + Browserless + sandbox/files
 *
 * Tool events stay in task state for compact activity indicators. They are not
 * expanded into a separate Computer UI or noisy assistant messages.
 */
export function useAgentRunner() {
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useOmni.getState().updateTaskStatus('cancelled');
    toast.info('Execução interrompida');
  }, []);

  const run = useCallback(async (text: string, model: ProviderId, mode: AgentMode) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const store = useOmni.getState();
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    store.pushMessage(userMsg);

    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      model: String(model),
      streaming: true,
      createdAt: Date.now(),
    };
    store.pushMessage(assistantMsg);

    try {
      if (mode === 'chat') {
        try {
          const freshMessages = useOmni.getState().messages;
          await streamLLMChat(
            freshMessages,
            model,
            (full) => useOmni.getState().updateMessage(assistantMsg.id, { content: full }),
            abortController.signal,
          );
          useOmni.getState().updateMessage(assistantMsg.id, { streaming: false });
        } catch (error) {
          if (abortController.signal.aborted) {
            useOmni.getState().updateMessage(assistantMsg.id, {
              content: 'Resposta interrompida.',
              streaming: false,
            });
            return;
          }

          const message = errorMessage(error);
          useOmni.getState().updateMessage(assistantMsg.id, {
            content: `Não consegui concluir esta resposta.\n\n**Erro:** ${message}`,
            streaming: false,
          });
          toast.error('Falha no Chat', { description: message });
        }
        return;
      }

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
      store.setComputerOpen(false);
      store.setLive(true);
      store.setReplayIndex(null);

      let finalSummary = '';

      try {
        await runRealAgent(
          text,
          mode,
          model,
          (event) => {
            const currentStore = useOmni.getState();
            currentStore.appendEvent(event);

            if (event.type === 'TASK_COMPLETED') {
              finalSummary = event.summary;
            } else if (event.type === 'TASK_FAILED') {
              currentStore.updateTaskStatus('failed');
            }
          },
          (screenshot) => useOmni.getState().setScreenshot(screenshot),
          (session) => useOmni.getState().setBrowserSession(session),
          abortController.signal,
        );

        if (!finalSummary) {
          throw new Error('A execução terminou sem um resumo confirmado.');
        }

        useOmni.getState().updateMessage(assistantMsg.id, {
          content: finalSummary,
          streaming: false,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          useOmni.getState().updateMessage(assistantMsg.id, {
            content: 'Execução interrompida.',
            streaming: false,
          });
          return;
        }

        const message = errorMessage(error);
        useOmni.getState().updateTaskStatus('failed');
        useOmni.getState().updateMessage(assistantMsg.id, {
          content: `Não consegui concluir a tarefa.\n\n**Erro:** ${message}`,
          streaming: false,
        });
        toast.error('Falha na execução', { description: message });
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  }, []);

  return { run, stop };
}

async function runRealAgent(
  goal: string,
  mode: string,
  model: string,
  onEvent: (event: AgentEvent) => void,
  onScreenshot: (base64: string) => void,
  onBrowserSession: (session: BrowserSessionState) => void,
  signal: AbortSignal,
) {
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal, mode, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`agent run HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingScreenshot = '';
  let sawDone = false;

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
      if (!payload || payload === '{}' || payload === '[DONE]') continue;

      let obj: any;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }

      if (obj.type === 'screenshot' && typeof obj.data === 'string') {
        pendingScreenshot = obj.data;
        onScreenshot(pendingScreenshot);
        continue;
      }

      if (obj.type === 'browser_session' && typeof obj.liveURL === 'string') {
        const expiresInMs = Number(obj.expiresInMs);
        onBrowserSession({
          liveURL: obj.liveURL,
          browserSessionTicket:
            typeof obj.browserSessionTicket === 'string' ? obj.browserSessionTicket : undefined,
          expiresAt:
            Number.isFinite(expiresInMs) && expiresInMs > 0
              ? Date.now() + expiresInMs
              : undefined,
        });
        continue;
      }

      if (obj.type === 'event' && obj.event) {
        const event = obj.event as AgentEvent;
        if (obj.hasScreenshot && pendingScreenshot) {
          (event as any).screenshotBase64 = pendingScreenshot;
        }
        onEvent(event);
        continue;
      }

      if (obj.type === 'error') {
        throw new Error(obj.error || 'Agent execution failed');
      }

      if (obj.type === 'done') {
        sawDone = true;
      }
    }
  }

  if (!sawDone) {
    throw new Error('A conexão do Agent terminou sem confirmação de sucesso.');
  }
}

async function streamLLMChat(
  history: ChatMessage[],
  model: ProviderId,
  onChunk: (full: string) => void,
  signal: AbortSignal,
) {
  const messages = history
    .filter((message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      message.content &&
      !message.streaming,
    )
    .map((message) => ({ role: message.role, content: message.content }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`chat HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let sawDone = false;

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
      if (!payload || payload === '{}' || payload === '[DONE]') continue;

      let obj: any;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }

      if (obj.type === 'delta' && typeof obj.text === 'string') {
        full += obj.text;
        onChunk(full);
      } else if (obj.type === 'error') {
        throw new Error(obj.error || 'Chat streaming failed');
      } else if (obj.type === 'done') {
        sawDone = true;
      }
    }
  }

  if (!sawDone) {
    throw new Error('A conexão do Chat terminou sem confirmação de sucesso.');
  }
  if (!full) {
    throw new Error('O modelo não retornou conteúdo.');
  }
}
