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
      <div className="mx-auto w-full max-w-[768px] space-y-8 px-4 pb-8 pt-6 sm:pb-10 sm:pt-8">
        {messages.map((message) => <MessageRow key={message.id} message={message} />)}
        <div className="h-3" />
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const thinkingEnabled = useOmni((state) => state.thinkingEnabled);

  if (message.role === 'system') {
    return <div className="text-center text-[11px] text-white/30">{message.content}</div>;
  }

  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex justify-end">
        <div className="max-w-[92%] sm:max-w-[78%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {message.attachments.map((attachment) => (
                <div key={attachment.id} className="flex max-w-56 items-center gap-2 rounded-2xl bg-[#2f2f2f] px-3 py-2 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                    {attachment.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-white/85">{attachment.name}</span>
                    <span className="block text-[10px] text-white/35">{formatBytes(attachment.size)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap rounded-[22px] bg-[#2f2f2f] px-4 py-2.5 text-[15px] leading-6 text-[#ececec]">
            {message.content}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="group">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-white/40">
        <OmniNinjaLogo size={20} />
        <span>OMNINJA</span>
      </div>
      <div className="pl-0 sm:pl-7">
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
      <button onClick={() => void copy()} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-white/35 transition hover:bg-white/[0.05] hover:text-white/70" title="Copiar">
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
        className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-white/[0.05]', feedback === 'up' ? 'text-emerald-400' : 'text-white/30 hover:text-white/70')}
        title="Boa resposta"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
        className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-white/[0.05]', feedback === 'down' ? 'text-red-400' : 'text-white/30 hover:text-white/70')}
        title="Resposta ruim"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-7 text-[#ececec] prose-headings:text-[#f5f5f5] prose-p:my-2 prose-li:my-1 prose-strong:text-[#f5f5f5] prose-pre:m-0 prose-pre:bg-[#151515] prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[12px]" {...props}>{children}</code>;
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
    <div className="my-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[#151515]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <span className="font-mono text-[10px] uppercase text-white/35">{language}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="flex items-center gap-1 text-[10px] text-white/35 hover:text-white/70"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <SyntaxHighlighter language={language} style={oneDark} customStyle={{ margin: 0, background: '#151515', fontSize: '12px', padding: '14px' }}>
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function ResponseProgress({ thinkingEnabled }: { thinkingEnabled: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-white/45">
      <span>{thinkingEnabled ? 'Pensando' : 'Gerando resposta'}</span>
      <span className="flex gap-1">
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-cyan-300/80" style={{ animationDelay: '0ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-cyan-300/80" style={{ animationDelay: '150ms' }} />
        <span className="omni-dot h-1.5 w-1.5 rounded-full bg-cyan-300/80" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[768px] flex-col items-center justify-center px-4 py-10">
      <OmniNinjaLogo size={36} />
      <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight">Como posso ajudar?</h1>
    </div>
  );
}
