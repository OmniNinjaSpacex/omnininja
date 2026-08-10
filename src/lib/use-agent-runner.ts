'use client';

import { useCallback, useRef } from 'react';
import {
  useOmni,
  type ChatMessage,
  type ReasoningEffort,
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
 * One conversation runner for the whole product.
 * Every request goes through OMNINJA. The runtime itself decides whether tools
 * are needed. There is no user-visible Chat/Agent split.
 */
export function useAgentRunner() {
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useOmni.getState().updateTaskStatus('cancelled');
    toast.info('Resposta interrompida');
  }, []);

  const run = useCallback(async (
    text: string,
    effort: ReasoningEffort,
    thinkingEnabled: boolean,
  ) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const store = useOmni.getState();
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    store.pushMessage(userMessage);

    const history = useOmni.getState().messages
      .filter((message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        message.content &&
        !message.streaming,
      )
      .map((message) => ({ role: message.role, content: message.content }));

    const assistantMessage: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      model: 'OMNINJA',
      streaming: true,
      createdAt: Date.now(),
    };
    store.pushMessage(assistantMessage);

    store.setCurrentTask({
      id: uid(),
      goal: text,
      mode: 'chat',
      model: 'chatgpt',
      status: 'running',
      steps: [],
      stepsDone: 0,
      events: [],
      artifacts: [],
      startedAt: Date.now(),
    });
    store.setComputerOpen(false);

    try {
      await streamOmniNinjaResponse(
        history,
        effort,
        thinkingEnabled,
        (event) => useOmni.getState().appendEvent(event),
        (serverTaskId) => {
          const current = useOmni.getState().currentTask;
          if (current) {
            useOmni.getState().setCurrentTask({ ...current, id: serverTaskId });
          }
        },
        (finalText) => {
          useOmni.getState().updateMessage(assistantMessage.id, {
            content: finalText,
            model: 'OMNINJA',
          });
        },
        abortController.signal,
      );

      useOmni.getState().updateMessage(assistantMessage.id, { streaming: false });
      useOmni.getState().updateTaskStatus('completed');
    } catch (error) {
      if (abortController.signal.aborted) {
        useOmni.getState().updateMessage(assistantMessage.id, {
          content: 'Resposta interrompida.',
          streaming: false,
        });
        return;
      }

      const message = errorMessage(error);
      useOmni.getState().updateTaskStatus('failed');
      useOmni.getState().updateMessage(assistantMessage.id, {
        content: `Não consegui concluir esta resposta.\n\n**Erro:** ${message}`,
        streaming: false,
      });
      toast.error('Falha no OMNINJA', { description: message });
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  }, []);

  return { run, stop };
}

async function streamOmniNinjaResponse(
  messages: { role: 'user' | 'assistant'; content: string }[],
  effort: ReasoningEffort,
  thinkingEnabled: boolean,
  onActivity: (event: AgentEvent) => void,
  onStart: (taskId: string) => void,
  onFinal: (text: string) => void,
  signal: AbortSignal,
) {
  const response = await fetch('/api/omnininja/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, effort, thinkingEnabled }),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OMNINJA HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
  let sawFinal = false;

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

      let data: any;
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }

      if (data.type === 'start' && typeof data.taskId === 'string') {
        onStart(data.taskId);
      } else if (data.type === 'activity' && data.event) {
        onActivity(data.event as AgentEvent);
      } else if (data.type === 'final' && typeof data.text === 'string') {
        sawFinal = true;
        onFinal(data.text);
      } else if (data.type === 'error') {
        throw new Error(data.error || 'OMNINJA execution failed');
      } else if (data.type === 'done') {
        sawDone = true;
      }
    }
  }

  if (!sawDone) {
    throw new Error('A conexão terminou sem confirmação de sucesso.');
  }
  if (!sawFinal) {
    throw new Error('O OMNINJA terminou sem uma resposta final.');
  }
}
