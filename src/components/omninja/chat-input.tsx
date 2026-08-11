'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Brain,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Gauge,
  Image as ImageIcon,
  Mic,
  Plus,
  Square,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOmni, type ReasoningEffort } from '@/lib/store';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type OmniNinjaAttachment,
} from '@/lib/omnininja-attachments';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentRunner, type OmniRunMode } from '@/lib/use-agent-runner';
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

const MODE_LABELS: Record<OmniRunMode, string> = {
  chat: '',
  image: 'Criar imagem',
  video: 'Criar vídeo',
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

function inferMediaMode(prompt: string): OmniRunMode {
  const normalized = prompt.toLowerCase();
  const createVerb = /\b(crie|criar|gere|gerar|faça|fazer|produza|produzir|desenhe|desenhar|create|generate|make|draw|crea|crear|genera|generar|haz|dibuja)\b/i;
  if (!createVerb.test(normalized)) return 'chat';
  if (/\b(vídeo|video|clipe|clip|animação|animacao|animation)\b/i.test(normalized)) return 'video';
  if (/\b(imagem|image|foto|photo|picture|ilustração|ilustracao|illustration|arte|art|pôster|poster)\b/i.test(normalized)) return 'image';
  return 'chat';
}

async function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', listener);
      resolve();
    };
    const listener = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timeout = window.setTimeout(finish, 4000);
    pc.addEventListener('icegatheringstatechange', listener);
  });
}

export function ChatInput() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<OmniNinjaAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [generationMode, setGenerationMode] = useState<OmniRunMode>('chat');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceLive, setVoiceLive] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const realtimePcRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const submittingRef = useRef(false);

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

  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimePcRef.current?.close();
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeAudioRef.current?.pause();
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
    if ((!prompt && attachments.length === 0) || taskRunning || submittingRef.current) return;

    const effectivePrompt = prompt || 'Analise os anexos enviados e me explique o conteúdo mais importante.';
    const outgoingAttachments = attachments;
    const effectiveMode = generationMode === 'chat' ? inferMediaMode(effectivePrompt) : generationMode;
    setText('');
    setAttachments([]);
    setGenerationMode('chat');
    submittingRef.current = true;

    try {
      await run(effectivePrompt, reasoningEffort, thinkingEnabled, outgoingAttachments, effectiveMode);
    } finally {
      submittingRef.current = false;
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
    submittingRef.current = false;
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Gravação de voz não é suportada neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordedChunksRef.current = [];
        if (!blob.size) return;

        setTranscribing(true);
        try {
          const form = new FormData();
          form.set('file', blob, 'voz.webm');
          const response = await fetch('/api/openai/transcribe', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({} as any));
          if (!response.ok) throw new Error(data?.error || 'Falha ao transcrever voz');
          const transcript = String(data?.text || '').trim();
          if (transcript) {
            setText((current) => current ? `${current} ${transcript}` : transcript);
            requestAnimationFrame(() => taRef.current?.focus());
          }
        } catch (error: any) {
          toast.error(error?.message || 'Não foi possível transcrever o áudio.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Não foi possível acessar o microfone.');
    }
  };

  const stopRealtimeVoice = () => {
    realtimePcRef.current?.close();
    realtimePcRef.current = null;
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeStreamRef.current = null;
    realtimeAudioRef.current?.pause();
    realtimeAudioRef.current = null;
    setVoiceLive(false);
  };

  const toggleRealtimeVoice = async () => {
    setAttachmentMenuOpen(false);
    if (voiceLive) {
      stopRealtimeVoice();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      toast.error('Modo de voz não é suportado neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        void audio.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          stopRealtimeVoice();
        }
      };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error('Não foi possível iniciar a sessão de voz.');

      const response = await fetch('/api/openai/realtime', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdp }),
      });
      const answer = await response.text();
      if (!response.ok) throw new Error('Não foi possível conectar o modo de voz.');
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });

      realtimePcRef.current = pc;
      realtimeStreamRef.current = stream;
      realtimeAudioRef.current = audio;
      setVoiceLive(true);
      toast.success('Modo de voz conectado');
    } catch (error: any) {
      stopRealtimeVoice();
      toast.error(error?.message || 'Falha ao iniciar voz ao vivo.');
    }
  };

  const canSend = Boolean(text.trim() || attachments.length > 0);

  return (
    <div className="relative bg-transparent pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void addFiles(event.target.files)} />
      <input ref={photosRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
      <input ref={filesRef} type="file" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />

      <div className="mx-auto w-full max-w-[768px] px-3 sm:px-4">
        <AnimatePresence initial={false}>
          {(attachments.length > 0 || generationMode !== 'chat' || voiceLive) && (
            <motion.div initial={{ opacity: 0, y: 8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: 6, height: 0 }} className="mb-2 flex flex-wrap gap-2 px-1">
              {generationMode !== 'chat' && (
                <button type="button" onClick={() => setGenerationMode('chat')} className="flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] text-cyan-100">
                  {generationMode === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                  {MODE_LABELS[generationMode]} <X className="h-3 w-3" />
                </button>
              )}
              {voiceLive && (
                <button type="button" onClick={stopRealtimeVoice} className="flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] text-cyan-100">
                  <AudioLines className="h-3.5 w-3.5" /> Voz ao vivo <X className="h-3 w-3" />
                </button>
              )}
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group flex min-w-44 max-w-56 items-center gap-2 rounded-2xl bg-[#2f2f2f] px-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                    {attachment.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-white/85">{attachment.name}</div>
                    <div className="text-[10px] text-white/35">{formatBytes(attachment.size)}</div>
                  </div>
                  <button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.07] hover:text-white/80" aria-label={`Remover ${attachment.name}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="rounded-[26px] bg-[#2f2f2f] shadow-[0_0_0_1px_rgba(255,255,255,0.025),0_10px_35px_rgba(0,0,0,0.12)] transition focus-within:bg-[#303030]">
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={generationMode === 'image' ? 'Descreva a imagem' : generationMode === 'video' ? 'Descreva o vídeo' : voiceLive ? 'Voz ao vivo conectada' : 'Pergunte qualquer coisa'}
            aria-label="Mensagem para o OmniNinja"
            className="max-h-[220px] min-h-[58px] w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-[#ececec] outline-none placeholder:text-white/35 sm:px-5"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5 sm:px-3">
            <button type="button" onClick={() => setAttachmentMenuOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.07] hover:text-white active:scale-95" aria-label="Adicionar ou criar">
              <Plus className="h-[18px] w-[18px]" />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.06] hover:text-white/80" aria-label="Esforço de raciocínio">
                  <Gauge className="h-3.5 w-3.5" /> {EFFORT_LABELS[reasoningEffort]} <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 rounded-2xl border-white/[0.08] bg-[#2f2f2f] p-1.5 shadow-2xl">
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Esforço</div>
                {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                  <button key={effort} type="button" onClick={() => setReasoningEffort(effort)} className={cn('flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.055]', reasoningEffort === effort && 'bg-white/[0.06]')}>
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

            <button type="button" onClick={() => setThinkingEnabled(!thinkingEnabled)} className={cn('flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition active:scale-[0.97]', thinkingEnabled ? 'bg-cyan-300/[0.08] text-cyan-200' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75')} aria-pressed={thinkingEnabled} aria-label="Ativar ou desativar pensamento">
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pensar</span>
            </button>

            <button type="button" onClick={() => void toggleRecording()} disabled={transcribing || voiceLive} className={cn('flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95', recording ? 'bg-red-400/15 text-red-300' : transcribing ? 'text-cyan-300' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80')} aria-label={recording ? 'Parar gravação' : 'Ditar por voz'}>
              {recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className={cn('h-4 w-4', transcribing && 'animate-pulse')} />}
            </button>

            <div className="ml-auto">
              {taskRunning ? (
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition active:scale-95" onClick={stopRun} aria-label="Parar resposta">
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button type="button" className={cn('flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95', canSend ? 'bg-white text-black hover:bg-white/90' : 'bg-white/[0.08] text-white/25')} onClick={() => void submit()} disabled={!canSend} aria-label="Enviar mensagem">
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
            <motion.button type="button" aria-label="Fechar menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAttachmentMenuOpen(false)} className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
            <motion.div initial={{ opacity: 0, y: 28, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} transition={{ type: 'spring', stiffness: 390, damping: 32 }} className="fixed bottom-3 left-3 right-3 z-[60] mx-auto max-w-sm overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#2f2f2f] p-2 shadow-2xl sm:absolute sm:bottom-[76px] sm:left-4 sm:right-auto sm:w-72">
              <div className="px-3 pb-1 pt-2 text-xs font-medium text-white/40">Adicionar ou criar</div>
              <AttachmentMenuButton icon={Camera} label="Câmera" onClick={() => cameraRef.current?.click()} />
              <AttachmentMenuButton icon={ImageIcon} label="Fotos" onClick={() => photosRef.current?.click()} />
              <AttachmentMenuButton icon={FileText} label="Arquivos" onClick={() => filesRef.current?.click()} />
              <div className="my-1 border-t border-white/[0.06]" />
              <AttachmentMenuButton icon={ImageIcon} label="Criar imagem" onClick={() => { setGenerationMode('image'); setAttachmentMenuOpen(false); requestAnimationFrame(() => taRef.current?.focus()); }} />
              <AttachmentMenuButton icon={Video} label="Criar vídeo" onClick={() => { setGenerationMode('video'); setAttachmentMenuOpen(false); requestAnimationFrame(() => taRef.current?.focus()); }} />
              <AttachmentMenuButton icon={AudioLines} label={voiceLive ? 'Encerrar voz ao vivo' : 'Voz ao vivo'} onClick={() => void toggleRealtimeVoice()} active={voiceLive} />
              <div className="px-3 pb-2 pt-1 text-[10px] leading-relaxed text-white/30">
                Arquivos: até {MAX_ATTACHMENTS_PER_MESSAGE} itens, {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB por item.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttachmentMenuButton({ icon: Icon, label, onClick, active = false }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition active:scale-[0.99]', active ? 'bg-cyan-300/[0.08] text-cyan-100' : 'text-white/80 hover:bg-white/[0.06]')}>
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', active ? 'bg-cyan-300/10' : 'bg-white/[0.06]')}>
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
