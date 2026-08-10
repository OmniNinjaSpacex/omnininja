'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Brain,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Gauge,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOmni, type ReasoningEffort } from '@/lib/store';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type OmniNinjaAttachment,
} from '@/lib/omnininja-attachments';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentRunner } from '@/lib/use-agent-runner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  low: 'Mais rápido',
  medium: 'Equilibrado',
  high: 'Mais profundo',
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToAttachment(file: File): Promise<OmniNinjaAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} excede ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });

  return {
    id: uid(),
    name: file.name || 'arquivo',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl,
  };
}

export function ChatInput() {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [attachments, setAttachments] = useState<OmniNinjaAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

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

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (remaining <= 0) {
      toast.error(`Limite de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`);
      return;
    }

    try {
      const chosen = Array.from(files).slice(0, remaining);
      const converted = await Promise.all(chosen.map(fileToAttachment));
      setAttachments((current) => [...current, ...converted]);
      setAttachmentMenuOpen(false);
      requestAnimationFrame(() => taRef.current?.focus());
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível anexar o arquivo.');
    } finally {
      if (cameraRef.current) cameraRef.current.value = '';
      if (photosRef.current) photosRef.current.value = '';
      if (filesRef.current) filesRef.current.value = '';
    }
  };

  const submit = async () => {
    const prompt = text.trim();
    if ((!prompt && attachments.length === 0) || running) return;

    const effectivePrompt = prompt || 'Analise os anexos enviados e me explique o conteúdo mais importante.';
    const outgoingAttachments = attachments;
    setText('');
    setAttachments([]);
    setRunning(true);

    try {
      await run(effectivePrompt, reasoningEffort, thinkingEnabled, outgoingAttachments);
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
    <div className="relative bg-background/95 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        ref={photosRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        ref={filesRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void addFiles(event.target.files)}
      />

      <div className="mx-auto w-full max-w-3xl px-2.5 sm:px-4">
        <AnimatePresence initial={false}>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 6, height: 0 }}
              className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 omni-scroll"
            >
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group flex min-w-44 max-w-56 items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent">
                    {attachment.mimeType.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{attachment.name}</div>
                    <div className="text-[10px] text-muted-foreground">{formatBytes(attachment.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`Remover ${attachment.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="rounded-[28px] border border-border/80 bg-card/95 shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-[border-color,box-shadow] duration-200 focus-within:border-foreground/20 focus-within:shadow-[0_10px_38px_rgba(0,0,0,0.24)]"
        >
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Pergunte qualquer coisa"
            aria-label="Mensagem para o OmniNinja"
            className="max-h-[220px] min-h-14 w-full resize-none bg-transparent px-4 pb-1.5 pt-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/65"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => setAttachmentMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95"
              aria-label="Adicionar arquivo"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="hidden h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
                  aria-label="Modelo"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  OMNINJA
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 rounded-2xl border-border bg-popover p-2 shadow-2xl">
                <div className="rounded-xl bg-accent/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-brand" /> OMNINJA
                    <Check className="ml-auto h-4 w-4 text-brand" />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Modelo único. Ferramentas e provedores ficam internos.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Esforço de raciocínio"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">{EFFORT_LABELS[reasoningEffort]}</span>
                  <span className="sm:hidden">{EFFORT_LABELS[reasoningEffort]}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 rounded-2xl border-border bg-popover p-1.5 shadow-2xl">
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Esforço
                </div>
                {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => setReasoningEffort(effort)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent',
                      reasoningEffort === effort && 'bg-accent/70',
                    )}
                  >
                    <Gauge className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{EFFORT_LABELS[effort]}</span>
                      <span className="block text-[10px] text-muted-foreground">{EFFORT_DESCRIPTIONS[effort]}</span>
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
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-all active:scale-[0.97]',
                thinkingEnabled
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-pressed={thinkingEnabled}
              aria-label="Ativar ou desativar pensamento"
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pensar</span>
            </button>

            <div className="ml-auto">
              {running ? (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 rounded-full active:scale-95"
                  onClick={stopRun}
                  aria-label="Parar resposta"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full transition-transform active:scale-95"
                  onClick={() => void submit()}
                  disabled={!text.trim() && attachments.length === 0}
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60">
          OMNINJA pode cometer erros. Confira informações importantes.
        </p>
      </div>

      <AnimatePresence>
        {attachmentMenuOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Fechar menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAttachmentMenuOpen(false)}
              className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 390, damping: 32 }}
              className="fixed bottom-3 left-3 right-3 z-[60] mx-auto max-w-sm overflow-hidden rounded-[28px] border border-border bg-popover p-2 shadow-2xl sm:absolute sm:bottom-[76px] sm:left-4 sm:right-auto sm:w-72"
            >
              <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Adicionar</div>
              <AttachmentMenuButton
                icon={Camera}
                label="Câmera"
                onClick={() => cameraRef.current?.click()}
              />
              <AttachmentMenuButton
                icon={ImageIcon}
                label="Fotos"
                onClick={() => photosRef.current?.click()}
              />
              <AttachmentMenuButton
                icon={FileText}
                label="Arquivos"
                onClick={() => filesRef.current?.click()}
              />
              <div className="px-3 pb-2 pt-1 text-[10px] leading-relaxed text-muted-foreground">
                Até {MAX_ATTACHMENTS_PER_MESSAGE} itens, {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB por item nesta beta.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttachmentMenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-colors hover:bg-accent active:scale-[0.99]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
