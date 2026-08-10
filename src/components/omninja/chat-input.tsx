'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Brain, Check, ChevronDown, Gauge, Sparkles, Square } from 'lucide-react';
import { useOmni, type ReasoningEffort } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentRunner } from '@/lib/use-agent-runner';
import { cn } from '@/lib/utils';

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  low: 'Mais rápido e econômico',
  medium: 'Equilíbrio entre velocidade e profundidade',
  high: 'Mais raciocínio para problemas difíceis',
};

export function ChatInput() {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const currentTask = useOmni((state) => state.currentTask);
  const reasoningEffort = useOmni((state) => state.reasoningEffort);
  const setReasoningEffort = useOmni((state) => state.setReasoningEffort);
  const thinkingEnabled = useOmni((state) => state.thinkingEnabled);
  const setThinkingEnabled = useOmni((state) => state.setThinkingEnabled);
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

    setText('');
    setRunning(true);
    try {
      await run(prompt, reasoningEffort, thinkingEnabled);
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
        <div className="rounded-[26px] border border-border bg-card shadow-sm transition-colors focus-within:border-brand/50 focus-within:shadow-md">
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Mensagem para o OmniNinja"
            aria-label="Mensagem para o OmniNinja"
            className="max-h-[220px] min-h-14 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 text-[11px] font-medium transition-colors hover:bg-accent"
                  aria-label="Modelo"
                >
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                  OMNINJA
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 border-border bg-popover p-2">
                <div className="rounded-lg bg-accent/60 p-2.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-brand" /> OMNINJA
                    <Check className="ml-auto h-4 w-4 text-brand" />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Modelo único do produto. O backend escolhe e usa recursos internos sem expor provedores ao usuário.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Esforço de raciocínio"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  Esforço: {EFFORT_LABELS[reasoningEffort]}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 border-border bg-popover p-1.5">
                {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => setReasoningEffort(effort)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent',
                      reasoningEffort === effort && 'bg-accent/70',
                    )}
                  >
                    <Gauge className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{EFFORT_LABELS[effort]}</span>
                      <span className="block text-[10px] leading-relaxed text-muted-foreground">
                        {EFFORT_DESCRIPTIONS[effort]}
                      </span>
                    </span>
                    {reasoningEffort === effort && <Check className="mt-0.5 h-3.5 w-3.5 text-brand" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors',
                thinkingEnabled
                  ? 'bg-brand/10 text-brand hover:bg-brand/15'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-pressed={thinkingEnabled}
              aria-label="Ativar ou desativar pensamento"
            >
              <Brain className="h-3.5 w-3.5" />
              Pensamento {thinkingEnabled ? 'ativado' : 'desativado'}
            </button>

            <div className="ml-auto">
              {running ? (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 rounded-full"
                  onClick={stopRun}
                  aria-label="Parar resposta"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => void submit()}
                  disabled={!text.trim()}
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground/65">
          O esforço altera o raciocínio real do modelo. Ferramentas como web, navegador, código e arquivos são usadas internamente quando necessárias.
        </p>
      </div>
    </div>
  );
}
