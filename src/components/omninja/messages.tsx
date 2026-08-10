'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, FileText, Image as ImageIcon, ThumbsDown, ThumbsUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { OmniNinjaLogo } from './brand';
import { useOmni, type ChatMessage } from '@/lib/store';
import { cn } from '@/lib/utils';

export function MessageList() {
  const messages = useOmni((state) => state.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  if (messages.length === 0) return <EmptyChat />;

  return (
    <div ref={scrollRef} className="omni-scroll h-full overflow-y-auto scroll-smooth">
      <div className="mx-auto w-full max-w-3xl space-y-7 px-3 py-8 sm:px-4 sm:py-10">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const thinkingEnabled = useOmni((state) => state.thinkingEnabled);

  if (message.role === 'system') {
    return <div className="text-center text-xs text-muted-foreground">{message.content}</div>;
  }

  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[92%] sm:max-w-[78%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex max-w-56 items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 text-left shadow-sm"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent">
                    {attachment.mimeType.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{attachment.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatBytes(attachment.size)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="whitespace-pre-wrap rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-[15px] leading-6">
            {message.content}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="group flex gap-3"
    >
      <div className="mt-0.5 shrink-0">
        <OmniNinjaLogo size={26} />
      </div>
      <div className="min-w-0 flex-1">
        {message.streaming && message.content === '' ? (
          <ResponseProgress thinkingEnabled={thinkingEnabled} />
        ) : (
          <MarkdownContent content={message.content} streaming={message.streaming} />
        )}

        {!message.streaming && message.content && <MessageActions content={message.content} />}
      </div>
    </motion.div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        onClick={() => void copy()}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent',
          feedback === 'up' ? 'text-success' : 'text-muted-foreground hover:text-foreground',
        )}
        title="Boa resposta"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent',
          feedback === 'down' ? 'text-danger' : 'text-muted-foreground hover:text-foreground',
        )}
        title="Resposta ruim"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-7 prose-p:my-2 prose-pre:m-0 prose-pre:bg-[#0a0a0c] prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return (
                <code className="rounded bg-accent px-1 py-0.5 font-mono text-[12px]" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match?.[1] ?? 'text'} value={String(children).replace(/\n$/, '')} />;
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
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-[#0a0a0c]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{language}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, background: '#0a0a0c', fontSize: '12px', padding: '14px' }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function ResponseProgress({ thinkingEnabled }: { thinkingEnabled: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <span>{thinkingEnabled ? 'Pensando' : 'Gerando resposta'}</span>
      <span className="flex gap-1">
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-foreground/70" style={{ animationDelay: '0ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-foreground/70" style={{ animationDelay: '150ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-foreground/70" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

function EmptyChat() {
  const prompts = [
    'Pesquise as novidades mais importantes de IA hoje',
    'Crie uma landing page moderna para meu projeto',
    'Analise este problema e me dê a melhor solução',
    'Escreva e teste um script Python para mim',
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10">
      <OmniNinjaLogo size={44} />
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Como posso ajudar?
      </h1>
      <p className="mt-2 max-w-md text-center text-sm leading-6 text-muted-foreground">
        Converse, envie imagens ou arquivos. O OMNINJA usa recursos internos quando necessário.
      </p>

      <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => window.dispatchEvent(new CustomEvent('omninja:prompt', { detail: prompt }))}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/70 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
