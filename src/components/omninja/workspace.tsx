'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  FileSearch,
  FolderPlus,
  Library,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Telescope,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOmni, type ChatMessage, type ReasoningEffort, type WorkspaceMode } from '@/lib/store';
import { Wordmark } from './brand';
import { MessageList } from './messages';
import { ChatInput } from './chat-input';

interface Capabilities {
  chat?: boolean;
  tools?: boolean;
  reasoningEffort?: boolean;
  thinkingToggle?: boolean;
}

interface ConversationSummary {
  id: string;
  projectId: string | null;
  title: string;
  status: string;
  createdAt: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  updatedAt: string;
  tasksCount: number;
}

const quickActions = [
  { icon: Search, label: 'Pesquisar', prompt: 'Pesquise e verifique informações atuais sobre: ' },
  { icon: Telescope, label: 'Pesquisa profunda', prompt: 'Faça uma pesquisa profunda e verificável. Compare várias fontes atuais, destaque incertezas e cite as fontes sobre: ', profile: 'deep-research' as const },
  { icon: WandSparkles, label: 'Criar site', prompt: 'Crie um site completo para: ' },
  { icon: FileSearch, label: 'Analisar arquivos', prompt: 'Analise os arquivos que eu enviar e extraia o que importa.' },
  { icon: Monitor, label: 'Automatizar', prompt: 'Realize esta tarefa do início ao fim e verifique o resultado: ' },
];

const effortLabel: Record<ReasoningEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

export function Workspace() {
  const router = useRouter();
  const user = useOmni((state) => state.user);
  const messages = useOmni((state) => state.messages);
  const currentTask = useOmni((state) => state.currentTask);
  const clearMessages = useOmni((state) => state.clearMessages);
  const setCurrentTask = useOmni((state) => state.setCurrentTask);
  const reasoningEffort = useOmni((state) => state.reasoningEffort);
  const setReasoningEffort = useOmni((state) => state.setReasoningEffort);
  const thinkingEnabled = useOmni((state) => state.thinkingEnabled);
  const setThinkingEnabled = useOmni((state) => state.setThinkingEnabled);
  const workspaceMode = useOmni((state) => state.workspaceMode);
  const setWorkspaceMode = useOmni((state) => state.setWorkspaceMode);
  const activeProjectId = useOmni((state) => state.activeProjectId);
  const setActiveProjectId = useOmni((state) => state.setActiveProjectId);

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [openAIHealthy, setOpenAIHealthy] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePanel, setActivePanel] = useState<'library' | 'settings' | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.user) {
        throw new Error(data?.error || `Falha ao carregar sessão (HTTP ${response.status})`);
      }
      useOmni.getState().setUser(data.user);
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
      if (response.ok && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (response.ok && Array.isArray(data.projects)) setProjects(data.projects);
    } finally {
      setProjectsLoading(false);
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
    const timer = window.setTimeout(() => {
      void (async () => {
        await loadSession();
        await Promise.all([loadConversations(), loadProjects(), checkOpenAI()]);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSession, loadConversations, loadProjects, checkOpenAI]);

  useEffect(() => {
    if (currentTask?.status === 'completed' || currentTask?.status === 'failed') {
      const timer = window.setTimeout(() => {
        void Promise.all([loadConversations(), loadProjects()]);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [currentTask?.status, loadConversations, loadProjects]);

  useEffect(() => {
    const closeTransientUi = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSidebarOpen(false);
      setControlsMenuOpen(false);
      setActivePanel(null);
    };
    window.addEventListener('keydown', closeTransientUi);
    return () => window.removeEventListener('keydown', closeTransientUi);
  }, []);

  const newTask = () => {
    clearMessages();
    setCurrentTask(null);
    setSidebarOpen(false);
  };

  const selectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    newTask();
  };

  const createProject = async (name: string): Promise<boolean> => {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok || !data.project) return false;
    setProjects((current) => [data.project, ...current]);
    selectProject(data.project.id);
    return true;
  };

  const deleteProject = async (projectId: string) => {
    if (!window.confirm('Excluir este projeto? As conversas serão mantidas sem projeto.')) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    if (!response.ok) return;
    setProjects((current) => current.filter((project) => project.id !== projectId));
    if (activeProjectId === projectId) selectProject(null);
    setConversations((current) => current.map((conversation) => (
      conversation.projectId === projectId ? { ...conversation, projectId: null } : conversation
    )));
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
          attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
          media: Array.isArray(message.media) ? message.media : undefined,
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
  const libraryAttachments = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap((message) => message.attachments || []).filter((attachment) => {
      const key = `${attachment.name}:${attachment.size}:${attachment.mimeType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);
  const taskActivity = useMemo(() => {
    if (!currentTask) return null;
    if (currentTask.status === 'planning') return 'Planejando a tarefa…';
    if (currentTask.status === 'running') return 'Executando e verificando…';
    if (currentTask.status === 'awaiting_input') return 'Aguardando sua confirmação…';
    return null;
  }, [currentTask]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#212121] text-[#ececec]">
      <aside className="hidden w-[260px] shrink-0 bg-[#181818] lg:flex">
        <Sidebar
          conversations={conversations}
          projects={projects}
          historyLoading={historyLoading}
          projectsLoading={projectsLoading}
          onNewTask={newTask}
          onConversation={openConversation}
          activeProjectId={activeProjectId}
          onProject={selectProject}
          onCreateProject={createProject}
          onDeleteProject={deleteProject}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onSearchOpen={() => setSearchOpen((value) => !value)}
          onSearchQuery={setSearchQuery}
          onOpenPanel={setActivePanel}
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
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 35 }}
              className="fixed inset-y-0 left-0 z-50 w-[min(92vw,360px)] bg-[#181818] shadow-2xl lg:hidden"
            >
              <Sidebar
                conversations={conversations}
                projects={projects}
                historyLoading={historyLoading}
                projectsLoading={projectsLoading}
                onNewTask={newTask}
                onConversation={openConversation}
                activeProjectId={activeProjectId}
                onProject={selectProject}
                onCreateProject={createProject}
                onDeleteProject={deleteProject}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                onSearchOpen={() => setSearchOpen((value) => !value)}
                onSearchQuery={setSearchQuery}
                onOpenPanel={(panel) => {
                  setActivePanel(panel);
                  setSidebarOpen(false);
                }}
                openAIHealthy={openAIHealthy}
                user={user}
                isGuest={isGuest}
                onLogin={() => router.push('/login')}
                onLogout={logout}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <section className="flex min-w-0 flex-1 flex-col bg-[#212121]">
        <header className="relative flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end px-3 pb-1 sm:h-14 sm:items-center sm:pb-0 sm:px-4">
          <button
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.045] text-white/65 transition hover:bg-white/[0.08] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="relative min-w-0">
            <button
              onClick={() => setControlsMenuOpen((value) => !value)}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-[14px] font-semibold text-white/90 transition hover:bg-white/[0.055] sm:flex"
            >
              OMNININJA <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            </button>
            <AnimatePresence>
              {controlsMenuOpen && (
                <>
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setControlsMenuOpen(false)}
                    aria-label="Fechar opções do OMNININJA"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    className="absolute left-0 top-11 z-30 w-[min(18rem,calc(100vw-1.5rem))] origin-top-left rounded-2xl border border-white/[0.08] bg-[#2f2f2f] p-2 shadow-2xl"
                  >
                  <div className="rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <Sparkles className="h-4 w-4 text-cyan-300" /> OMNININJA
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-white/45">Uma única IA com ferramentas internas automáticas.</div>
                  </div>
                  <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[.12em] text-white/30">Esforço</div>
                  {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                    <button
                      key={effort}
                      onClick={() => {
                        setReasoningEffort(effort);
                        setControlsMenuOpen(false);
                      }}
                      className={`mt-0.5 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[12px] transition ${reasoningEffort === effort ? 'bg-white/[0.08] text-white' : 'text-white/65 hover:bg-white/[0.05]'}`}
                    >
                      <span>{effortLabel[effort]}</span>
                      {reasoningEffort === effort && <span className="ml-auto h-2 w-2 rounded-full bg-cyan-300" />}
                    </button>
                  ))}
                  <button
                    onClick={() => setThinkingEnabled(!thinkingEnabled)}
                    className="mt-1 flex w-full items-center rounded-xl px-3 py-2.5 text-[12px] text-white/65 transition hover:bg-white/[0.05]"
                  >
                    Pensamento
                    <span className={`ml-auto rounded-full px-2 py-1 text-[9px] ${thinkingEnabled ? 'bg-cyan-300/10 text-cyan-200' : 'bg-white/[0.05] text-white/35'}`}>
                      {thinkingEnabled ? 'Ligado' : 'Desligado'}
                    </span>
                  </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <WorkspaceModeSwitch mode={workspaceMode} onMode={setWorkspaceMode} />

          <div className="ml-auto flex items-center gap-1 text-[11px] text-white/35">
            {openAIHealthy === true && (
              <span className="hidden items-center gap-1.5 rounded-full px-2 py-1 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
              </span>
            )}
            <button
              onClick={() => {
                setSearchOpen(true);
                setSidebarOpen(true);
              }}
              className="hidden rounded-lg p-2 transition hover:bg-white/[0.055] sm:block"
              aria-label="Pesquisar"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={newTask}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/55 transition hover:bg-white/[0.055] hover:text-white lg:hidden"
              aria-label="Nova tarefa"
            >
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
        </header>

        {sessionError && (
          <div className="mx-3 flex items-center gap-2 rounded-xl bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-300">
            <AlertCircle className="h-3.5 w-3.5" /> {sessionError}
          </div>
        )}
        {capabilities && capabilities.chat === false && (
          <div className="mx-3 rounded-xl bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-300">
            OMNININJA ainda não está configurado neste deploy.
          </div>
        )}

        <main className="relative flex min-h-0 flex-1 flex-col">
          {hasConversation ? (
            <>
              <div className="min-h-0 flex-1 overflow-hidden"><MessageList /></div>
              {taskActivity && (
                <div className="mx-auto w-full max-w-[768px] px-4 pb-1 text-[11px] text-white/40">
                  <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                  {taskActivity}
                </div>
              )}
              <ChatInput />
            </>
          ) : (
            <HomeComposer />
          )}
        </main>

        <AnimatePresence>
          {activePanel && (
            <>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60"
                onClick={() => setActivePanel(null)}
                aria-label="Fechar painel"
              />
              <motion.section
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="fixed inset-0 z-50 mx-auto max-h-[100dvh] w-full overflow-y-auto bg-[#212121] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl sm:inset-x-3 sm:bottom-auto sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:max-w-xl sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-[#282828] sm:p-5"
                aria-modal="true"
                role="dialog"
                aria-label={activePanel === 'library' ? 'Biblioteca' : 'Configurações'}
              >
                <div className="flex items-center">
                  <h2 className="text-base font-semibold text-white/90">
                    {activePanel === 'library' ? 'Biblioteca' : 'Configurações'}
                  </h2>
                  <button
                    onClick={() => setActivePanel(null)}
                    className="ml-auto rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {activePanel === 'library' ? (
                  <div className="mt-4 space-y-2">
                    {libraryAttachments.length ? libraryAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
                        <FileSearch className="h-4 w-4 shrink-0 text-cyan-300" />
                        <div className="min-w-0">
                          <div className="truncate text-xs text-white/80">{attachment.name}</div>
                          <div className="mt-0.5 text-[10px] text-white/35">{attachment.mimeType} · {Math.max(1, Math.round(attachment.size / 1024))} KB</div>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-xs leading-5 text-white/35">
                        Os anexos da conversa atual aparecerão aqui.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-5">
                    <div>
                      <div className="text-xs font-medium text-white/70">Esforço de raciocínio</div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                          <button
                            key={effort}
                            onClick={() => setReasoningEffort(effort)}
                            className={`rounded-xl border px-3 py-2 text-xs transition ${reasoningEffort === effort ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/[0.06] text-white/45 hover:bg-white/[0.04]'}`}
                          >
                            {effortLabel[effort]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setThinkingEnabled(!thinkingEnabled)}
                      className="flex w-full items-center rounded-xl border border-white/[0.06] px-3 py-3 text-left text-xs text-white/70"
                    >
                      Pensamento interno
                      <span className={`ml-auto rounded-full px-2 py-1 text-[10px] ${thinkingEnabled ? 'bg-cyan-300/10 text-cyan-200' : 'bg-white/[0.05] text-white/35'}`}>
                        {thinkingEnabled ? 'Ligado' : 'Desligado'}
                      </span>
                    </button>
                    <div className="rounded-xl bg-white/[0.025] px-3 py-3 text-[11px] leading-5 text-white/38">
                      {user ? `${user.credits + user.bonusCredits} créditos disponíveis.` : 'Carregando sua conta…'} As ferramentas internas são escolhidas automaticamente pelo OMNININJA.
                    </div>
                  </div>
                )}
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function HomeComposer() {
  const workspaceMode = useOmni((state) => state.workspaceMode);
  const setWorkspaceMode = useOmni((state) => state.setWorkspaceMode);
  const setReasoningEffort = useOmni((state) => state.setReasoningEffort);
  const setThinkingEnabled = useOmni((state) => state.setThinkingEnabled);
  const copy = {
    chat: {
      title: 'Como posso ajudar?',
      description: 'Converse naturalmente. O OMNININJA pesquisa e usa ferramentas somente quando isso melhora a resposta.',
    },
    work: {
      title: 'O que vamos realizar?',
      description: 'Defina o resultado. O OMNININJA organiza as etapas, executa o necessário e verifica a entrega.',
    },
    codex: {
      title: 'O que vamos construir?',
      description: 'Descreva o projeto, correção ou ideia. O OMNININJA programa, executa builds e testa em ambiente isolado.',
    },
  }[workspaceMode];

  return (
    <div className="omni-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8 pt-6">
      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col justify-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-200">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-center text-[30px] font-semibold tracking-[-.03em] text-white/95 sm:text-[36px]">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-center text-[13px] leading-5 text-white/40">
          {copy.description}
        </p>

        <div className="mt-7"><ChatInput /></div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {quickActions.map(({ icon: Icon, label, prompt, profile }) => (
            <button
              key={label}
              onClick={() => {
                if (profile === 'deep-research') {
                  setWorkspaceMode('work');
                  setReasoningEffort('high');
                  setThinkingEnabled(true);
                }
                window.dispatchEvent(new CustomEvent('omninja:prompt', { detail: prompt }));
              }}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-transparent px-3.5 text-[11px] text-white/50 transition hover:bg-white/[0.045] hover:text-white/80"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-10 flex items-center gap-3 text-[11px] text-white/30">
          <Bot className="h-4 w-4 text-cyan-300/70" />
          <span>Ferramentas hospedadas e ambientes isolados, escolhidos automaticamente.</span>
        </div>
      </div>
    </div>
  );
}

function WorkspaceModeSwitch({
  mode,
  onMode,
}: {
  mode: WorkspaceMode;
  onMode: (mode: WorkspaceMode) => void;
}) {
  const modes: Array<{ id: WorkspaceMode; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'work', label: 'Work' },
    { id: 'codex', label: 'Codex' },
  ];

  return (
    <div className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-full border border-white/[0.055] bg-black/20 p-1 shadow-sm">
      {modes.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onMode(item.id)}
          className={`relative isolate flex h-7 min-w-[48px] items-center justify-center rounded-full px-2 text-[10px] font-medium transition sm:min-w-[56px] sm:text-[11px] ${mode === item.id ? 'text-white/90' : 'text-white/38 hover:text-white/65'}`}
          aria-pressed={mode === item.id}
        >
          {mode === item.id && (
            <motion.span
              layoutId="workspace-mode-pill"
              className="absolute inset-0 -z-10 rounded-full bg-white/[0.09]"
              transition={{ type: 'spring', stiffness: 430, damping: 34 }}
            />
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Sidebar({
  conversations,
  projects,
  historyLoading,
  projectsLoading,
  onNewTask,
  onConversation,
  activeProjectId,
  onProject,
  onCreateProject,
  onDeleteProject,
  searchOpen,
  searchQuery,
  onSearchOpen,
  onSearchQuery,
  onOpenPanel,
  openAIHealthy,
  user,
  isGuest,
  onLogin,
  onLogout,
  onClose,
}: {
  conversations: ConversationSummary[];
  projects: ProjectSummary[];
  historyLoading: boolean;
  projectsLoading: boolean;
  onNewTask: () => void;
  onConversation: (id: string) => void;
  activeProjectId: string | null;
  onProject: (id: string | null) => void;
  onCreateProject: (name: string) => Promise<boolean>;
  onDeleteProject: (id: string) => void;
  searchOpen: boolean;
  searchQuery: string;
  onSearchOpen: () => void;
  onSearchQuery: (query: string) => void;
  onOpenPanel: (panel: 'library' | 'settings') => void;
  openAIHealthy: boolean | null;
  user: { name: string; email: string; tier: string; credits: number; bonusCredits: number } | null;
  isGuest: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const nav = [
    { icon: Sparkles, label: 'Chat', action: onNewTask },
    { icon: Search, label: 'Buscar', action: onSearchOpen },
    { icon: Library, label: 'Biblioteca', action: () => onOpenPanel('library') },
  ];

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('pt-BR');
  const visibleConversations = conversations.filter((conversation) => (
    (!activeProjectId || conversation.projectId === activeProjectId) &&
    (!normalizedSearch || conversation.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
  ));

  const submitProject = async () => {
    const name = projectName.trim();
    if (!name || projectSaving) return;
    setProjectSaving(true);
    try {
      if (await onCreateProject(name)) {
        setProjectName('');
        setProjectFormOpen(false);
      }
    } finally {
      setProjectSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-[max(0.625rem,env(safe-area-inset-top))]">
      <div className="flex h-11 items-center px-2">
        <Wordmark />
        {onClose && (
          <button onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.06] hover:text-white" aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        onClick={onNewTask}
        className="mt-1 flex h-10 items-center gap-3 rounded-xl px-2.5 text-[13px] font-medium text-white/85 transition hover:bg-white/[0.055]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-300 text-[#0c2632]"><Plus className="h-4 w-4" /></span>
        Nova tarefa
      </button>

      <div className="mt-2 space-y-0.5">
        {nav.map(({ icon: Icon, label, action }, index) => (
          <button
            key={label}
            onClick={action}
            className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[12px] transition ${index === 0 ? 'bg-white/[0.055] text-white/85' : 'text-white/48 hover:bg-white/[0.04] hover:text-white/78'}`}
          >
            <Icon className={`h-4 w-4 ${index === 0 ? 'text-cyan-300' : ''}`} />
            {label}
          </button>
        ))}
      </div>

      {searchOpen && (
        <div className="mt-2 px-1">
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-black/10 px-2.5">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(event) => onSearchQuery(event.target.value)}
              placeholder="Buscar conversas"
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[11px] text-white/75 outline-none placeholder:text-white/25"
            />
            {searchQuery && (
              <button onClick={() => onSearchQuery('')} className="p-1 text-white/30 hover:text-white/70" aria-label="Limpar busca">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center px-3 text-[10px] font-medium text-white/28">
        <button onClick={() => onProject(null)} className="hover:text-white/60">Projetos</button>
        <button onClick={() => setProjectFormOpen((value) => !value)} className="ml-auto rounded-md p-1 hover:bg-white/[0.05]" aria-label="Novo projeto"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      {projectFormOpen && (
        <div className="mt-1 px-1">
          <div className="rounded-xl border border-white/[0.08] bg-black/10 p-2">
            <input
              autoFocus
              value={projectName}
              maxLength={80}
              onChange={(event) => setProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitProject();
                if (event.key === 'Escape') setProjectFormOpen(false);
              }}
              placeholder="Nome do projeto"
              className="h-8 w-full rounded-lg bg-white/[0.04] px-2.5 text-[11px] text-white/75 outline-none placeholder:text-white/25"
            />
            <div className="mt-2 flex justify-end gap-1">
              <button onClick={() => setProjectFormOpen(false)} className="rounded-lg px-2 py-1 text-[10px] text-white/35 hover:text-white/70">Cancelar</button>
              <button disabled={!projectName.trim() || projectSaving} onClick={() => void submitProject()} className="rounded-lg bg-cyan-300 px-2 py-1 text-[10px] font-medium text-[#0c2632] disabled:opacity-40">
                {projectSaving ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
        {projectsLoading ? (
          <div className="mx-2 h-8 rounded-lg omni-shimmer" />
        ) : projects.length ? projects.map((project) => (
          <div key={project.id} className={`group flex items-center rounded-lg ${activeProjectId === project.id ? 'bg-white/[0.055]' : 'hover:bg-white/[0.04]'}`}>
            <button
              onClick={() => onProject(project.id)}
              className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[11px] ${activeProjectId === project.id ? 'text-white/80' : 'text-white/40'}`}
            >
              <FolderPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-[9px] text-white/20">{project.tasksCount}</span>
            </button>
            <button
              onClick={() => onDeleteProject(project.id)}
              className="mr-1 rounded-md p-1 text-white/0 transition hover:bg-white/[0.05] hover:text-red-300 group-hover:text-white/20 focus:text-white/35"
              aria-label={`Excluir projeto ${project.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )) : (
          <button onClick={() => setProjectFormOpen(true)} className="flex h-8 w-full items-center gap-3 rounded-lg px-3 text-[11px] text-white/35 hover:bg-white/[0.04] hover:text-white/65">
            <FolderPlus className="h-3.5 w-3.5" /> Novo projeto
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center px-3 text-[10px] font-medium text-white/28"><span>Recentes</span></div>
      <div className="omni-scroll mt-1 min-h-0 flex-1 overflow-y-auto">
        {historyLoading ? (
          <div className="space-y-1 px-2">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-8 rounded-lg omni-shimmer" />)}
          </div>
        ) : visibleConversations.length ? (
          visibleConversations.slice(0, 20).map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onConversation(conversation.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-white/42 transition hover:bg-white/[0.045] hover:text-white/75"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-white/25" />
              <span className="truncate">{conversation.title}</span>
            </button>
          ))
        ) : (
          <div className="px-3 py-4 text-[10px] text-white/20">
            {normalizedSearch ? 'Nenhuma conversa encontrada.' : 'Nenhuma tarefa ainda.'}
          </div>
        )}
      </div>

      <div className="pt-2">
        <button onClick={() => onOpenPanel('settings')} className="flex h-8 w-full items-center gap-3 rounded-lg px-3 text-[11px] text-white/42 hover:bg-white/[0.04]">
          <Settings className="h-3.5 w-3.5" /> Configurações
        </button>
        <div className="mt-1 flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/[0.035]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300 text-[11px] font-semibold text-[#0c2632]">
            {user?.name?.slice(0, 1)?.toUpperCase() || 'G'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-white/70">{user?.name || 'Workspace privado'}</div>
            <div className="truncate text-[9px] text-white/28">
              {openAIHealthy === true ? 'OMNININJA conectado' : openAIHealthy === false ? 'OMNININJA indisponível' : 'Verificando…'}
            </div>
          </div>
          <button onClick={isGuest ? onLogin : onLogout} className="p-1.5 text-white/30 hover:text-white/70" aria-label={isGuest ? 'Entrar' : 'Sair'}>
            {isGuest ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
