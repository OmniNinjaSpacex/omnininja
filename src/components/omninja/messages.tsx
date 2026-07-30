'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Bot, RotateCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { OmniNinjaLogo } from './brand';
import { useOmni, type ChatMessage } from '@/lib/store';
import { TIER_CONFIG } from '@/lib/credits';
import { cn } from '@/lib/utils';

export function MessageList() {
  const messages = useOmni((s) => s.messages);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scroll after paint so streaming content height is reflected
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  if (messages.length === 0) {
    return <EmptyChat />;
  }

  return (
    <div ref={scrollRef} className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === 'system') {
    return (
      <div className="flex justify-center animate-fade-up">
        <Badge variant="outline" className="border-border/60 text-muted-foreground">{message.content}</Badge>
      </div>
    );
  }
  return (
    <div className="group flex gap-3 animate-fade-up">
      <div className="flex-shrink-0">
        <OmniNinjaLogo size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">OmniNinja</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-normal uppercase">
            {TIER_CONFIG.pro.label}
          </Badge>
          {message.model && <Badge variant="outline" className="h-4 px-1.5 text-[9px]">{message.model}</Badge>}
        </div>
        <div className="text-sm leading-relaxed text-foreground/90">
          {message.streaming && message.content === '' ? (
            <ThinkingDots />
          ) : (
            <MarkdownContent content={message.content} streaming={message.streaming} />
          )}
        </div>
        {!message.streaming && message.content && (
          <MessageActions content={message.content} />
        )}
      </div>
    </div>
  );
}

function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        onClick={copy}
        className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Regenerar"
      >
        <RotateCw className="h-3 w-3" />
      </button>
      <button
        onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent',
          feedback === 'up' ? 'text-success' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Boa resposta"
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent',
          feedback === 'down' ? 'text-danger' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Resposta ruim"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  );
}

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:m-0 prose-pre:bg-[#0a0a0c] prose-pre:p-3 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return <code className="rounded bg-accent px-1 py-0.5 font-mono text-[12px] text-brand" {...props}>{children}</code>;
            }
            return (
              <CodeBlock language={match?.[1] ?? 'text'} value={String(children).replace(/\n$/, '')} />
            );
          },
        }}
      >
        {content + (streaming ? '▋' : '')}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{language}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, background: '#0a0a0c', fontSize: '12px', padding: '12px' }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground">Pensando</span>
      <span className="flex gap-1">
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: '0ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: '150ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-brand" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

function EmptyChat() {
  const setModel = useOmni((s) => s.setModel);
  const setMode = useOmni((s) => s.setMode);
  const mode = useOmni((s) => s.mode);

  const prompts = [
    { icon: '🌐', title: 'Criar site', text: 'Crie uma landing page moderna para um SaaS de gestão de tarefas com hero, features e preços.' },
    { icon: '📊', title: 'Pesquisar mercado', text: 'Pesquise o mercado de agentes de IA autônomos em 2026 e gere um relatório comparativo.' },
    { icon: '🐍', title: 'Script Python', text: 'Escreva um script Python que baixa dados de uma API, normaliza e gera um gráfico.' },
    { icon: '🎯', title: 'Design', text: 'Crie uma identidade visual (logo + paleta) para uma marca de café especial.' },
  ];

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-10">
      <OmniNinjaLogo size={48} />
      <h1 className="mt-5 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        O que posso fazer por você?
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Digite uma tarefa ou escolha um atalho. O Computador abre quando preciso.
      </p>

      {/* mode chips */}
      <div className="mt-6 flex items-center gap-1.5 rounded-full border border-border bg-card p-1">
        {(['chat', 'agent', 'agent_max'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              mode === m ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m === 'agent_max' ? 'Agent MAX' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p.title}
            onClick={() => useOmni.setState((s) => {
              // trigger send via a custom event the input listens to
              window.dispatchEvent(new CustomEvent('omninja:prompt', { detail: p.text }));
              return s;
            })}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-brand/40 hover:bg-accent/40"
          >
            <span className="text-xl">{p.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{p.title}</div>
              <div className="truncate text-xs text-muted-foreground">{p.text}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
