'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useOmni, type AgentMode } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { useAgentRunner } from '@/lib/use-agent-runner';

export function ChatInput() {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const model = useOmni((state) => state.model);
  const currentTask = useOmni((state) => state.currentTask);
  const { run, stop } = useAgentRunner();

  const taskRunning = Boolean(
    currentTask && ['running', 'planning', 'queued', 'awaiting_input'].includes(currentTask.status),
  );

  useEffect(() => {
    if (taskRunning) setRunning(true);
  }, [taskRunning]);

  useEffect(() => {
    const textarea = taRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setText(detail);
      taRef.current?.focus();
    };
    window.addEventListener('omninja:prompt', handler);
    return () => window.removeEventListener('omninja:prompt', handler);
  }, []);

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || running) return;

    const internalMode = chooseInternalMode(prompt);
    useOmni.getState().setMode(internalMode);

    setText('');
    setRunning(true);
    try {
      await run(prompt, model, internalMode);
    } finally {
      setRunning(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const stopRun = () => {
    stop();
    setRunning(false);
  };

  return (
    <div className="bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
        <div className="flex items-end gap-2 rounded-[24px] border border-border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-brand/50 focus-within:shadow-md">
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Mensagem para o OmniNinja"
            aria-label="Mensagem para o OmniNinja"
            className="max-h-[220px] min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          {running ? (
            <Button
              size="icon"
              variant="secondary"
              className="mb-0.5 h-9 w-9 shrink-0 rounded-full"
              onClick={stopRun}
              aria-label="Parar resposta"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="mb-0.5 h-9 w-9 shrink-0 rounded-full"
              onClick={() => void submit()}
              disabled={!text.trim()}
              aria-label="Enviar mensagem"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground/65">
          O OmniNinja escolhe automaticamente quando usar web, navegador, código, terminal e arquivos.
        </p>
      </div>
    </div>
  );
}

function chooseInternalMode(prompt: string): AgentMode {
  const text = prompt.toLowerCase();

  const toolSignals = [
    'pesquise',
    'pesquisar',
    'procure',
    'buscar na web',
    'acesse',
    'abra o site',
    'navegue',
    'clique',
    'preencha',
    'crie um site',
    'criar um site',
    'crie um app',
    'criar um app',
    'rode',
    'execute',
    'terminal',
    'python',
    'node',
    'arquivo',
    'arquivos',
    'deploy',
    'publique',
    'automatize',
    'scrape',
    'extraia',
    'analise este site',
    'compare preços',
  ];

  const complexSignals = [
    'pesquisa profunda',
    'relatório completo',
    'construa do zero',
    'crie uma plataforma',
    'crie um sistema',
    'faça tudo',
    'end-to-end',
    'ponta a ponta',
    'múltiplas fontes',
    'varias fontes',
    'várias fontes',
  ];

  const toolHits = toolSignals.filter((signal) => text.includes(signal)).length;
  const complexHits = complexSignals.filter((signal) => text.includes(signal)).length;

  if (complexHits > 0 || (toolHits >= 2 && prompt.length > 280)) return 'agent_max';
  if (toolHits > 0 || /^https?:\/\//i.test(prompt.trim())) return 'agent';
  return 'chat';
}
