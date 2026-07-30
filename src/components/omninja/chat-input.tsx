'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Square, Plus, Mic, Smile, Paperclip, Sparkles, Search,
  FileText, Clock, Wand2, HardDrive, Figma, ChevronDown, AtSign, Coins, CreditCard,
} from 'lucide-react';
import { useOmni, type AgentMode } from '@/lib/store';
import { ModelSelector } from './model-selector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useAgentRunner } from '@/lib/use-agent-runner';
import { cn } from '@/lib/utils';

export function ChatInput() {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mode = useOmni((s) => s.mode);
  const setMode = useOmni((s) => s.setMode);
  const model = useOmni((s) => s.model);
  const currentTask = useOmni((s) => s.currentTask);
  const user = useOmni((s) => s.user);
  const { run, stop } = useAgentRunner();
  const [running, setRunning] = useState(false);

  const isRunning = !!currentTask && ['running', 'planning', 'queued', 'awaiting_input'].includes(currentTask.status);
  const totalCredits = user ? user.credits + user.bonusCredits : 0;

  useEffect(() => {
    setRunning(isRunning);
  }, [isRunning]);

  // auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  // listen for prompt chips
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setText(detail);
      taRef.current?.focus();
    };
    window.addEventListener('omninja:prompt', handler);
    return () => window.removeEventListener('omninja:prompt', handler);
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (!t || running) return;
    setText('');
    setRunning(true);
    try {
      await run(t, model, mode);
    } finally {
      setRunning(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {/* Mobile: credits remaining + buy credits bar */}
        <div className="mb-2 flex items-center gap-2 md:hidden">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-warning" />
            <span className="font-medium tabular-nums">{totalCredits.toLocaleString()}</span> credits remaining
          </span>
          <button className="ml-auto flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-medium text-brand transition-colors hover:bg-brand/20">
            <CreditCard className="h-3 w-3" /> Buy credits
          </button>
        </div>

        {/* mode + quick toggles row */}
        <div className="mb-2 flex items-center gap-1.5">
          <ModePill mode="chat" current={mode} setMode={setMode} />
          <ModePill mode="agent" current={mode} setMode={setMode} />
          <ModePill mode="agent_max" current={mode} setMode={setMode} />
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1 border-border/60 text-[10px] text-muted-foreground">
              <Sparkles className="h-2.5 w-2.5" /> {mode === 'chat' ? 'Conversa rápida' : mode === 'agent' ? 'Pensa + ferramentas' : 'Poder máximo'}
            </Badge>
          </span>
        </div>

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 transition-colors focus-within:border-brand/50">
          {/* attach menu */}
          <AttachMenu />

          {/* model selector */}
          <ModelSelector />

          {/* textarea */}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={mode === 'chat' ? 'Pergunte qualquer coisa…' : mode === 'agent' ? 'Descreva a tarefa — vou pensar e usar ferramentas…' : 'Descreva algo complexo — posso criar sites, deployar, executar…'}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />

          {/* emoji + mic */}
          <button className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex">
            <Smile className="h-4 w-4" />
          </button>
          <button className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex">
            <Mic className="h-4 w-4" />
          </button>

          {/* send / stop */}
          {running ? (
            <Button size="icon" variant="destructive" className="h-8 w-8 rounded-lg" onClick={stop} aria-label="Parar">
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Enviar"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
          O Computador só abre quando a tarefa precisa de ferramentas. Enter envia · Shift+Enter quebra linha.
        </p>
      </div>
    </div>
  );
}

function ModePill({ mode, current, setMode }: { mode: AgentMode; current: AgentMode; setMode: (m: AgentMode) => void }) {
  const label = mode === 'agent_max' ? 'Agent MAX' : mode.charAt(0).toUpperCase() + mode.slice(1);
  return (
    <button
      onClick={() => setMode(mode)}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
        current === mode ? 'bg-brand text-brand-foreground' : 'bg-accent text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function AttachMenu() {
  const items = [
    { icon: HardDrive, label: 'Arquivos locais', hint: 'Upload' },
    { icon: Clock, label: 'Arquivos recentes', hint: '' },
    { icon: FileText, label: 'Tarefas recentes', hint: '' },
    { icon: Wand2, label: 'Habilidades (Skills)', hint: '' },
    { icon: AtSign, label: 'Mencionar', hint: '' },
    { icon: Search, label: 'Buscar na web', hint: '' },
  ];
  const stubs = [
    { icon: Paperclip, label: 'Google Drive', soon: true },
    { icon: Figma, label: 'Figma', soon: true },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Anexar">
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 border-border bg-popover p-1" align="start" sideOffset={8}>
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Anexar</div>
        {items.map((it) => (
          <button key={it.label} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent">
            <it.icon className="h-4 w-4 text-muted-foreground" />
            <span>{it.label}</span>
            {it.hint && <span className="ml-auto text-[10px] text-muted-foreground">{it.hint}</span>}
          </button>
        ))}
        <div className="my-1 border-t border-border" />
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Integrações</div>
        {stubs.map((it) => (
          <button key={it.label} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent" disabled>
            <it.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{it.label}</span>
            <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] text-muted-foreground">Em breve</Badge>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
