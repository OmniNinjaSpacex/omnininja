'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Clock3,
  FileSearch,
  FolderPlus,
  Globe2,
  Library,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Plus,
  Plug,
  Search,
  Settings,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOmni, type ChatMessage, type ReasoningEffort } from '@/lib/store';
import { Wordmark } from './brand';
import { MessageList } from './messages';
import { ChatInput } from './chat-input';

interface Capabilities {
  chat?: boolean;
  tools?: boolean;
  browserless?: boolean;
  reasoningEffort?: boolean;
  thinkingToggle?: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

const quickActions = [
  { icon: Search, label: 'Pesquisa ampla', prompt: 'Faça uma pesquisa ampla e atualizada sobre: ' },
  { icon: WandSparkles, label: 'Criar site', prompt: 'Crie um site completo para: ' },
  { icon: FileSearch, label: 'Analisar arquivos', prompt: 'Analise os arquivos que eu enviar e extraia o que importa.' },
  { icon: Monitor, label: 'Usar computador', prompt: 'Use o navegador/computador para realizar esta tarefa: ' },
  { icon: MoreHorizontal, label: 'Mais', prompt: 'Quero realizar uma tarefa complexa: ' },
];

const effortLabel: Record<ReasoningEffort, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto' };

export function Workspace() {
  const router = useRouter();
  const user = useOmni((state) => state.user);
  const messages = useOmni((state) => state.messages);
  const currentTask = useOmni((state) => state.currentTask);
  const clearMessages = useOmni((state) => state.clearMessages);
  const setCurrentTask = useOmni((state) => state.setCurrentTask);
  const setComputerOpen = useOmni((state) => state.setComputerOpen);
  const reasoningEffort = useOmni((state) => state.reasoningEffort);
  const setReasoningEffort = useOmni((state) => state.setReasoningEffort);
  const thinkingEnabled = useOmni((state) => state.thinkingEnabled);
  const setThinkingEnabled = useOmni((state) => state.setThinkingEnabled);

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openAIHealthy, setOpenAIHealthy] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.user) throw new Error(data?.error || `Falha ao carregar sessão (HTTP ${response.status})`);
      useOmni.getState().setUser(data.user);
      useOmni.getState().setConfiguredProviders(Array.isArray(data.providers) ? data.providers : []);
      useOmni.getState().setDemoMode(false);
      setCapabilities(data.capabilities ?? null);
      setSessionError('');
    } catch (error: any) {
      setSessionError(error?.message || 'Não foi possível carregar a sessão.');
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (response.ok && Array.isArray(data.conversations)) setConversations(data.conversations);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const checkOpenAI = useCallback(async () => {
    try {
      const response = await fetch('/api/health/openai', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      setOpenAIHealthy(Boolean(response.ok && data?.ok));
    } catch {
      setOpenAIHealthy(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadSession(), loadConversations(), checkOpenAI()]);
  }, [loadSession, loadConversations, checkOpenAI]);

  useEffect(() => {
    if (currentTask?.status === 'completed' || currentTask?.status === 'failed') void loadConversations();
  }, [currentTask?.status, loadConversations]);

  const newTask = () => {
    clearMessages();
    setCurrentTask(null);
    setComputerOpen(false);
    setSidebarOpen(false);
  };

  const openConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.conversation?.messages) return;
      clearMessages();
      for (const message of data.conversation.messages as Array<any>) {
        const chatMessage: ChatMessage = {
          id: String(message.id),
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content || ''),
          model: message.model || undefined,
          streaming: false,
          createdAt: new Date(message.createdAt).getTime() || Date.now(),
        };
        useOmni.getState().pushMessage(chatMessage);
      }
      setCurrentTask(null);
      setSidebarOpen(false);
    } catch {}
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    newTask();
    await loadSession();
  };

  const isGuest = Boolean(user?.email?.endsWith('@guest.omnininja.local'));
  const hasConversation = messages.length > 0;
  const taskActivity = useMemo(() => {
    if (!currentTask) return null;
    if (currentTask.status === 'planning') return 'Planejando a tarefa…';
    if (currentTask.status === 'running') return 'Executando e verificando…';
    if (currentTask.status === 'awaiting_input') return 'Aguardando sua confirmação…';
    return null;
  }, [currentTask]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#171717] text-[#f1f1f1]">
      <aside className="hidden w-[258px] shrink-0 border-r border-white/[0.055] bg-[#1c1c1c] lg:flex">
        <Sidebar
          conversations={conversations}
          historyLoading={historyLoading}
          onNewTask={newTask}
          onConversation={openConversation}
          openAIHealthy={openAIHealthy}
          user={user}
          isGuest={isGuest}
          onLogin={() => router.push('/login')}
          onLogout={logout}
        />
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
            <motion.aside initial={{ x: -270 }} animate={{ x: 0 }} exit={{ x: -270 }} className="fixed inset-y-0 left-0 z-50 w-[258px] border-r border-white/[0.055] bg-[#1c1c1c] lg:hidden">
              <Sidebar conversations={conversations} historyLoading={historyLoading} onNewTask={newTask} onConversation={openConversation} openAIHealthy={openAIHealthy} user={user} isGuest={isGuest} onLogin={() => router.push('/login')} onLogout={logout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <section className="flex min-w-0 flex-1 flex-col bg-[#171717]">
        <header className="relative flex h-[58px] shrink-0 items-center border-b border-white/[0.055] px-4">
          <button className="mr-2 rounded-lg p-2 text-white/55 hover:bg-white/[0.05] lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-4 w-4" /></button>
          <div className="relative">
            <button onClick={() => setModelMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold hover:bg-white/[0.04]">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> OMNINJA <ChevronDown className="h-3 w-3 text-white/30" />
            </button>
            <AnimatePresence>
              {modelMenuOpen && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute left-0 top-10 z-30 w-72 rounded-xl border border-white/[0.08] bg-[#272727] p-2 shadow-2xl">
                  <div className="rounded-lg bg-white/[0.04] p-3">
                    <div className="flex items-center gap-2 text-[12px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-cyan-300" /> OMNINJA</div>
                    <div className="mt-1 text-[10px] leading-5 text-white/35">Um único agente. O esforço muda profundidade e orçamento de execução.</div>
                  </div>
                  <div className="mt-2 px-2 text-[9px] uppercase tracking-[.16em] text-white/25">Esforço</div>
                  {(['high', 'medium', 'low'] as ReasoningEffort[]).map((effort) => (
                    <button key={effort} onClick={() => { setReasoningEffort(effort); setModelMenuOpen(false); }} className={`mt-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] ${reasoningEffort === effort ? 'bg-cyan-300/[0.08] text-cyan-100' : 'text-white/60 hover:bg-white/[0.04]'}`}>
                      <span>OMNINJA · {effortLabel[effort]}</span><span className="ml-auto text-[9px] text-white/25">{reasoningEffort === effort ? 'ativo' : ''}</span>
                    </button>
                  ))}
                  <button onClick={() => setThinkingEnabled(!thinkingEnabled)} className="mt-2 flex w-full items-center rounded-lg border-t border-white/[0.06] px-3 pt-3 text-[11px] text-white/60">
                    Pensamento <span className={`ml-auto rounded-full px-2 py-1 text-[9px] ${thinkingEnabled ? 'bg-cyan-300/10 text-cyan-300' : 'bg-white/[0.05] text-white/35'}`}>{thinkingEnabled ? 'Ligado' : 'Desligado'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-white/30">
            {openAIHealthy === true && <span className="hidden items-center gap-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> operacional</span>}
            <button className="rounded-lg p-2 hover:bg-white/[0.04]"><Search className="h-3.5 w-3.5" /></button>
          </div>
        </header>

        {sessionError && <div className="flex items-center gap-2 border-b border-red-400/10 bg-red-400/[0.04] px-4 py-2 text-[11px] text-red-300"><AlertCircle className="h-3.5 w-3.5" />{sessionError}</div>}
        {capabilities && capabilities.chat === false && <div className="border-b border-amber-400/10 bg-amber-400/[0.04] px-4 py-2 text-[11px] text-amber-300">OMNINJA ainda não está configurado neste deploy.</div>}

        <main className="relative flex min-h-0 flex-1 flex-col">
          {hasConversation ? (
            <>
              <div className="min-h-0 flex-1 overflow-hidden"><MessageList /></div>
              {taskActivity && <div className="mx-auto w-full max-w-3xl px-4 pb-1 text-[10px] text-white/35"><span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />{taskActivity}</div>}
              <ChatInput />
            </>
          ) : (
            <HomeComposer conversations={conversations} historyLoading={historyLoading} />
          )}
        </main>
      </section>
    </div>
  );
}

function HomeComposer({ conversations, historyLoading }: { conversations: ConversationSummary[]; historyLoading: boolean }) {
  return (
    <div className="omni-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-10">
      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col justify-center">
        <h1 className="text-center font-serif text-[34px] tracking-[-.035em] text-white/92 sm:text-[44px]">O que posso fazer por você?</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-[11px] leading-5 text-white/25">Atribua uma tarefa ao OMNINJA. Ele pode pesquisar, criar, analisar arquivos e usar ferramentas quando necessário.</p>
        <div className="mt-7"><ChatInput /></div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {quickActions.map(({ icon: Icon, label, prompt }) => (
            <button key={label} onClick={() => window.dispatchEvent(new CustomEvent('omninja:prompt', { detail: prompt }))} className="flex h-8 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.015] px-3 text-[10px] text-white/50 transition hover:border-cyan-300/15 hover:bg-cyan-300/[0.035] hover:text-white/75">
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-12 flex w-full max-w-[610px] items-center rounded-xl border border-white/[0.065] bg-[#202020] p-3">
          <div className="mr-4 flex h-12 w-16 items-center justify-center rounded-lg border border-cyan-300/10 bg-[#101c24] text-cyan-300"><Bot className="h-5 w-5" /></div>
          <div><div className="text-[11px] font-semibold text-white/72">Seu agente, trabalhando em um workspace privado</div><div className="mt-1 text-[9px] text-white/25">AI Lab · Browserless · arquivos e ferramentas isoladas por tarefa</div></div>
          <span className="ml-auto text-[16px] text-white/20">›</span>
        </div>

        <div className="mx-auto mt-10 w-full max-w-[720px] rounded-xl border border-white/[0.055] bg-[#1c1c1c] p-4">
          <div className="mb-3 flex items-center text-[9px] font-medium text-white/35"><span>Continuar de onde parou</span><span className="ml-auto text-cyan-300/50">Ver todos</span></div>
          {historyLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-7 rounded-lg omni-shimmer" />)}</div>
          ) : conversations.length ? conversations.slice(0, 4).map((c) => (
            <button key={c.id} onClick={() => window.dispatchEvent(new CustomEvent('omninja:prompt', { detail: `Continue a tarefa: ${c.title}` }))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] text-white/45 hover:bg-white/[0.035] hover:text-white/70"><Sparkles className="h-3 w-3 text-cyan-300/60" /><span className="truncate">{c.title}</span><span className="ml-auto text-[8px] text-white/18">Recurso salvo</span></button>
          )) : <div className="py-5 text-center text-[10px] text-white/20">Suas tarefas aparecerão aqui.</div>}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ conversations, historyLoading, onNewTask, onConversation, openAIHealthy, user, isGuest, onLogin, onLogout }: {
  conversations: ConversationSummary[];
  historyLoading: boolean;
  onNewTask: () => void;
  onConversation: (id: string) => void;
  openAIHealthy: boolean | null;
  user: { name: string; email: string; tier: string; credits: number; bonusCredits: number } | null;
  isGuest: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const nav = [
    { icon: Sparkles, label: 'Agente' },
    { icon: Search, label: 'Buscar' },
    { icon: Plug, label: 'Plugins' },
    { icon: Clock3, label: 'Agendado' },
    { icon: Library, label: 'Biblioteca' },
  ];
  return (
    <div className="flex h-full w-full flex-col p-2.5">
      <div className="flex h-12 items-center px-1"><Wordmark /></div>
      <button onClick={onNewTask} className="mt-2 flex h-10 items-center gap-3 rounded-lg px-2 text-[12px] font-medium text-white/85 hover:bg-white/[0.045]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#168ac9] text-white"><Plus className="h-4 w-4" /></span>Nova tarefa<span className="ml-auto text-[9px] text-white/20">⌘ K</span></button>
      <button onClick={onNewTask} className="mt-2 flex h-9 items-center gap-3 rounded-lg bg-white/[0.055] px-3 text-[11px] text-white/75"><WandSparkles className="h-3.5 w-3.5 text-cyan-300" />Nova tarefa</button>
      <div className="mt-2 space-y-0.5">
        {nav.map(({ icon: Icon, label }) => <button key={label} className="flex h-8 w-full items-center gap-3 rounded-lg px-3 text-left text-[11px] text-white/48 hover:bg-white/[0.04] hover:text-white/75"><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div>

      <div className="mt-5 flex items-center px-3 text-[9px] font-semibold uppercase tracking-[.12em] text-white/23"><span>Projetos</span><button className="ml-auto rounded-md p-1 hover:bg-white/[0.05]"><Plus className="h-3 w-3" /></button></div>
      <button className="mt-1 flex h-8 w-full items-center gap-3 rounded-lg px-3 text-[11px] text-white/42 hover:bg-white/[0.04]"><FolderPlus className="h-3.5 w-3.5" />Novo projeto</button>

      <div className="mt-5 flex items-center px-3 text-[9px] font-semibold uppercase tracking-[.12em] text-white/23"><span>Tarefas</span><Plus className="ml-auto h-3 w-3" /></div>
      <div className="omni-scroll mt-1 min-h-0 flex-1 overflow-y-auto">
        {historyLoading ? <div className="space-y-1 px-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-7 rounded-md omni-shimmer" />)}</div> : conversations.length ? conversations.slice(0, 8).map((conversation) => (
          <button key={conversation.id} onClick={() => onConversation(conversation.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-white/38 hover:bg-white/[0.04] hover:text-white/70"><MessageSquare className="h-3 w-3 text-cyan-300/50" /><span className="truncate">{conversation.title}</span></button>
        )) : <div className="px-3 py-4 text-[10px] text-white/20">Nenhuma tarefa ainda.</div>}
      </div>

      <div className="border-t border-white/[0.055] pt-2">
        <button className="flex h-8 w-full items-center gap-3 rounded-lg px-3 text-[11px] text-white/42 hover:bg-white/[0.04]"><Settings className="h-3.5 w-3.5" />Configurações</button>
        <div className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#168ac9] text-[10px] font-semibold">{user?.name?.slice(0, 1)?.toUpperCase() || 'G'}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-[10px] text-white/65">{user?.name || 'Workspace privado'}</div><div className="truncate text-[8px] text-white/22">{openAIHealthy === true ? 'OMNINJA conectado' : openAIHealthy === false ? 'OMNINJA indisponível' : 'Verificando…'}</div></div>
          <button onClick={isGuest ? onLogin : onLogout} className="p-1.5 text-white/30 hover:text-white/65" aria-label={isGuest ? 'Entrar' : 'Sair'}>{isGuest ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}</button>
        </div>
      </div>
    </div>
  );
}
