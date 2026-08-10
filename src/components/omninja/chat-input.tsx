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

  const canSend = Boolean(text.trim() || attachments.length > 0);

  return (
    <div className="relative bg-transparent pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void addFiles(event.target.files)} />
      <input ref={photosRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
      <input ref={filesRef} type="file" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />

      <div className="mx-auto w-full max-w-[768px] px-3 sm:px-4">
        <AnimatePresence initial={false}>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 6, height: 0 }}
              className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 omni-scroll"
            >
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group flex min-w-44 max-w-56 items-center gap-2 rounded-2xl bg-[#2f2f2f] px-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                    {attachment.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-white/85">{attachment.name}</div>
                    <div className="text-[10px] text-white/35">{formatBytes(attachment.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.07] hover:text-white/80"
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
          className="rounded-[26px] bg-[#2f2f2f] shadow-[0_0_0_1px_rgba(255,255,255,0.025),0_10px_35px_rgba(0,0,0,0.12)] transition focus-within:bg-[#303030]"
        >
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Pergunte qualquer coisa"
            aria-label="Mensagem para o OmniNinja"
            className="max-h-[220px] min-h-[58px] w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-[#ececec] outline-none placeholder:text-white/35 sm:px-5"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5 sm:px-3">
            <button
              type="button"
              onClick={() => setAttachmentMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.07] hover:text-white active:scale-95"
              aria-label="Adicionar arquivo"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.06] hover:text-white/80"
                  aria-label="Esforço de raciocínio"
                >
                  <Gauge className="h-3.5 w-3.5" /> {EFFORT_LABELS[reasoningEffort]} <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 rounded-2xl border-white/[0.08] bg-[#2f2f2f] p-1.5 shadow-2xl">
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Esforço</div>
                {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => setReasoningEffort(effort)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.055]',
                      reasoningEffort === effort && 'bg-white/[0.06]',
                    )}
                  >
                    <Gauge className="mt-0.5 h-3.5 w-3.5 text-white/40" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-white/85">{EFFORT_LABELS[effort]}</span>
                      <span className="block text-[10px] text-white/35">{EFFORT_DESCRIPTIONS[effort]}</span>
                    </span>
                    {reasoningEffort === effort && <Check className="mt-0.5 h-3.5 w-3.5 text-cyan-300" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition active:scale-[0.97]',
                thinkingEnabled ? 'bg-cyan-300/[0.08] text-cyan-200' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
              )}
              aria-pressed={thinkingEnabled}
              aria-label="Ativar ou desativar pensamento"
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pensar</span>
            </button>

            <div className="ml-auto">
              {running ? (
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition active:scale-95"
                  onClick={stopRun}
                  aria-label="Parar resposta"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95',
                    canSend ? 'bg-white text-black hover:bg-white/90' : 'bg-white/[0.08] text-white/25',
                  )}
                  onClick={() => void submit()}
                  disabled={!canSend}
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <p className="mt-2 text-center text-[10px] text-white/25">OMNINJA pode cometer erros. Confira informações importantes.</p>
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
              className="fixed bottom-3 left-3 right-3 z-[60] mx-auto max-w-sm overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#2f2f2f] p-2 shadow-2xl sm:absolute sm:bottom-[76px] sm:left-4 sm:right-auto sm:w-72"
            >
              <div className="px-3 pb-1 pt-2 text-xs font-medium text-white/40">Adicionar</div>
              <AttachmentMenuButton icon={Camera} label="Câmera" onClick={() => cameraRef.current?.click()} />
              <AttachmentMenuButton icon={ImageIcon} label="Fotos" onClick={() => photosRef.current?.click()} />
              <AttachmentMenuButton icon={FileText} label="Arquivos" onClick={() => filesRef.current?.click()} />
              <div className="px-3 pb-2 pt-1 text-[10px] leading-relaxed text-white/30">
                Até {MAX_ATTACHMENTS_PER_MESSAGE} itens, {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB por item nesta beta.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttachmentMenuButton({ icon: Icon, label, onClick }: { icon: typeof Camera; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-white/80 transition hover:bg-white/[0.06] active:scale-[0.99]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06]">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
