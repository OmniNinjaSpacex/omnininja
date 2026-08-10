'use client';

import { useCallback, useRef } from 'react';
import {
  useOmni,
  type ChatMessage,
  type MessageMedia,
  type ReasoningEffort,
} from '@/lib/store';
import type { OmniNinjaAttachment } from '@/lib/omnininja-attachments';
import type { AgentEvent } from '@/lib/orchestrator';
import { toast } from 'sonner';

export type OmniRunMode = 'chat' | 'image' | 'video';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Erro desconhecido');
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

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
    attachments: OmniNinjaAttachment[] = [],
    mode: OmniRunMode = 'chat',
  ) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const store = useOmni.getState();
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      attachments: attachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
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
      content: mode === 'image' ? 'Criando imagem…' : mode === 'video' ? 'Criando vídeo…' : '',
      model: 'OMNINJA',
      streaming: true,
      createdAt: Date.now(),
    };
    store.pushMessage(assistantMessage);

    store.setCurrentTask({
      id: uid(),
      goal: text,
      mode: 'chat',
      model: 'openai',
      status: 'running',
      steps: [],
      stepsDone: 0,
      events: [],
      artifacts: [],
      startedAt: Date.now(),
    });
    store.setComputerOpen(false);

    try {
      if (mode === 'image') {
        const response = await fetch('/api/openai/image', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
          signal: abortController.signal,
        });
        const data = await response.json().catch(() => ({} as any));
        if (!response.ok || !data?.media?.url) {
          throw new Error(data?.error || `Falha ao gerar imagem (HTTP ${response.status})`);
        }
        const media = data.media as MessageMedia;
        useOmni.getState().updateMessage(assistantMessage.id, {
          content: 'Imagem gerada.',
          media: [media],
          streaming: false,
        });
        useOmni.getState().updateTaskStatus('completed');
        return;
      }

      if (mode === 'video') {
        const create = await fetch('/api/openai/video', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: text, seconds: '8', size: '1280x720' }),
          signal: abortController.signal,
        });
        const created = await create.json().catch(() => ({} as any));
        if (!create.ok || !created?.id) {
          throw new Error(created?.error || `Falha ao iniciar vídeo (HTTP ${create.status})`);
        }

        const videoId = String(created.id);
        let status = String(created.status || 'queued');
        let progress = Number(created.progress || 0);
        useOmni.getState().updateMessage(assistantMessage.id, {
          content: `Gerando vídeo… ${Math.max(0, Math.min(100, progress))}%`,
        });

        for (let attempt = 0; attempt < 60 && !['completed', 'failed'].includes(status); attempt += 1) {
          await sleep(2000, abortController.signal);
          const check = await fetch(`/api/openai/video?id=${encodeURIComponent(videoId)}`, {
            cache: 'no-store',
            signal: abortController.signal,
          });
          const data = await check.json().catch(() => ({} as any));
          if (!check.ok) throw new Error(data?.error || 'Falha ao consultar vídeo.');
          status = String(data.status || status);
          progress = Number(data.progress || progress || 0);
          useOmni.getState().updateMessage(assistantMessage.id, {
            content: status === 'completed'
              ? 'Vídeo gerado.'
              : `Gerando vídeo… ${Math.max(0, Math.min(100, progress))}%`,
          });
        }

        if (status === 'failed') throw new Error('A geração do vídeo falhou.');
        if (status !== 'completed') {
          useOmni.getState().updateMessage(assistantMessage.id, {
            content: 'O vídeo continua sendo processado. Você pode tentar novamente em alguns instantes.',
            media: [{ id: videoId, kind: 'video', url: '', status, progress }],
            streaming: false,
          });
          useOmni.getState().updateTaskStatus('completed');
          return;
        }

        useOmni.getState().updateMessage(assistantMessage.id, {
          content: 'Vídeo gerado.',
          media: [{
            id: videoId,
            kind: 'video',
            name: 'Vídeo gerado pelo OMNINJA',
            mimeType: 'video/mp4',
            url: `/api/openai/video?id=${encodeURIComponent(videoId)}&content=1`,
            status: 'completed',
            progress: 100,
          }],
          streaming: false,
        });
        useOmni.getState().updateTaskStatus('completed');
        return;
      }

      await streamOmniNinjaResponse(
        history,
        effort,
        thinkingEnabled,
        attachments,
        (event) => useOmni.getState().appendEvent(event),
        (serverTaskId) => {
          const current = useOmni.getState().currentTask;
          if (current) useOmni.getState().setCurrentTask({ ...current, id: serverTaskId });
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
  attachments: OmniNinjaAttachment[],
  onActivity: (event: AgentEvent) => void,
  onStart: (taskId: string) => void,
  onFinal: (text: string) => void,
  signal: AbortSignal,
) {
  const response = await fetch('/api/omnininja/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, effort, thinkingEnabled, attachments }),
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
  let streamedText = '';

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
      } else if (data.type === 'delta' && typeof data.delta === 'string') {
        streamedText += data.delta;
        onFinal(streamedText);
      } else if (data.type === 'final' && typeof data.text === 'string') {
        sawFinal = true;
        streamedText = data.text;
        onFinal(data.text);
      } else if (data.type === 'error') {
        throw new Error(data.error || 'OMNINJA execution failed');
      } else if (data.type === 'done') {
        sawDone = true;
      }
    }
  }

  if (!sawDone) throw new Error('A conexão terminou sem confirmação de sucesso.');
  if (!sawFinal) throw new Error('O OMNINJA terminou sem uma resposta final.');
}
