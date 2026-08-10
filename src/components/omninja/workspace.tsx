'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOmni, type ChatMessage } from '@/lib/store';
import { useTheme } from '@/components/theme-provider';
import { Wordmark } from './brand';
import { Button } from '@/components/ui/button';
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

export function Workspace() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const user = useOmni((state) => state.user);
  const currentTask = useOmni((state) => state.currentTask);
  const clearMessages = useOmni((state) => state.clearMessages);
  const setCurrentTask = useOmni((state) => state.setCurrentTask);
  const setComputerOpen = useOmni((state) => state.setComputerOpen);

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openAIHealthy, setOpenAIHealthy] = useState<boolean | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.user) {
        throw new Error(data?.error || `Falha ao carregar sessão (HTTP ${response.status})`);
      }

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
      if (response.ok && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
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
  }, [checkOpenAI, loadConversations, loadSession]);

  useEffect(() => {
    if (currentTask?.status === 'completed' || currentTask?.status === 'failed') {
      void loadConversations();
    }
  }, [currentTask?.status, loadConversations]);

  const newChat = () => {
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
      const messages = data.conversation.messages as Array<any>;
      for (const message of messages) {
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
    } catch {
      // Keep the current conversation if loading history fails.
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    newChat();
    await loadSession();
    await loadConversations();
  };

  const isGuest = Boolean(user?.email?.endsWith('@guest.omnininja.local'));
  const activity = useMemo(() => getInternalActivity(currentTask), [currentTask]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <AnimatePresence initial={false}>
        {desktopSidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="hidden shrink-0 overflow-hidden border-r border-border/60 bg-sidebar lg:flex"
          >
            <SidebarContent
              conversations={conversations}
              historyLoading={historyLoading}
              onNewChat={newChat}
              onConversation={openConversation}
              onClose={() => setDesktopSidebar(false)}
              openAIHealthy={openAIHealthy}
              isGuest={isGuest}
              onLogin={() => router.push('/login')}
              onLogout={logout}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Fechar menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border/60 bg-sidebar lg:hidden"
            >
              <SidebarContent
                conversations={conversations}
                historyLoading={historyLoading}
                onNewChat={newChat}
                onConversation={openConversation}
                onClose={() => setSidebarOpen(false)}
                openAIHealthy={openAIHealthy}
                isGuest={isGuest}
                onLogin={() => router.push('/login')}
                onLogout={logout}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 bg-background/90 px-2.5 backdrop-blur-xl sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => {
              if (window.innerWidth >= 1024) setDesktopSidebar((value) => !value);
              else setSidebarOpen(true);
            }}
            aria-label="Abrir menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </Button>

          <div className="min-w-0 flex-1 lg:hidden">
            <Wordmark />
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            {!desktopSidebar && <Wordmark />}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={newChat} aria-label="Nova conversa">
              <Plus className="h-4 w-4" />
            </Button>

            {isGuest ? (
              <Button variant="ghost" size="sm" className="hidden rounded-full sm:flex" onClick={() => router.push('/login')}>
                <LogIn className="mr-1.5 h-4 w-4" /> Entrar
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={logout} aria-label="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Alternar tema"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {sessionError && (
          <StatusBanner tone="danger">
            <AlertCircle className="h-3.5 w-3.5" /> {sessionError}
          </StatusBanner>
        )}

        {capabilities && capabilities.chat === false && (
          <StatusBanner tone="warning">
            <AlertCircle className="h-3.5 w-3.5" /> OMNINJA não está configurado neste deploy.
          </StatusBanner>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <MessageList />
          </div>

          <AnimatePresence initial={false}>
            {activity && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mx-auto w-full max-w-3xl px-4 pb-1"
              >
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
                  <span>{activity}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ChatInput />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  conversations,
  historyLoading,
  onNewChat,
  onConversation,
  onClose,
  openAIHealthy,
  isGuest,
  onLogin,
  onLogout,
}: {
  conversations: ConversationSummary[];
  historyLoading: boolean;
  onNewChat: () => void;
  onConversation: (id: string) => void;
  onClose: () => void;
  openAIHealthy: boolean | null;
  isGuest: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex h-full w-[260px] flex-col p-2.5">
      <div className="flex h-11 items-center gap-2 px-1">
        <div className="min-w-0 flex-1"><Wordmark /></div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label="Fechar sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <button
        type="button"
        onClick={onNewChat}
        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent"
      >
        <Plus className="h-4 w-4" /> Nova conversa
      </button>

      <div className="mt-2 flex items-center gap-2 rounded-xl bg-sidebar-accent/70 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar conversas"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Recentes
      </div>
      <div className="omni-scroll mt-1 min-h-0 flex-1 overflow-y-auto">
        {historyLoading ? (
          <div className="space-y-1 px-2 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-8 rounded-lg omni-shimmer" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onConversation(conversation.id)}
              className="group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{conversation.title}</span>
            </button>
          ))
        ) : (
          <div className="px-3 py-5 text-xs text-muted-foreground">Nenhuma conversa ainda.</div>
        )}
      </div>

      <div className="border-t border-sidebar-border pt-2">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              openAIHealthy === true
                ? 'bg-success'
                : openAIHealthy === false
                  ? 'bg-danger'
                  : 'bg-muted-foreground/40'
            }`}
          />
          <span className="flex-1">
            {openAIHealthy === true
              ? 'OMNINJA operacional'
              : openAIHealthy === false
                ? 'OMNINJA indisponível'
                : 'Verificando OMNINJA…'}
          </span>
        </div>
        <button
          type="button"
          onClick={isGuest ? onLogin : onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {isGuest ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          {isGuest ? 'Entrar ou criar conta' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}

function getInternalActivity(task: ReturnType<typeof useOmni.getState>['currentTask']): string {
  if (!task || !['running', 'planning', 'queued', 'awaiting_input'].includes(task.status)) return '';

  const events = task.events;
  const last = events[events.length - 1];
  if (!last) return 'Processando…';

  if (last.type === 'BROWSER_ACTION') return 'Pesquisando e navegando na web…';
  if (last.type === 'TERMINAL_OUTPUT') return 'Executando código em ambiente isolado…';
  if (last.type === 'FILE_CHANGED') return 'Trabalhando com arquivos…';
  if (last.type === 'STEP_STARTED') return 'Usando uma ferramenta…';
  if (last.type === 'AGENT_THINKING') return 'Processando…';
  if (last.type === 'PLAN_CREATED') return 'Organizando a resposta…';

  return 'Trabalhando…';
}

function StatusBanner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'danger' | 'warning';
}) {
  const className = tone === 'danger'
    ? 'border-danger/30 bg-danger/5 text-danger'
    : 'border-warning/30 bg-warning/5 text-warning';

  return (
    <div className={`flex items-center justify-center gap-2 border-y px-3 py-1.5 text-[11px] ${className}`}>
      {children}
    </div>
  );
}
