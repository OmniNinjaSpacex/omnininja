'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, LogIn, LogOut, Moon, Plus, Sun } from 'lucide-react';
import { useOmni } from '@/lib/store';
import { useTheme } from '@/components/theme-provider';
import { Wordmark } from './brand';
import { Button } from '@/components/ui/button';
import { MessageList } from './messages';
import { ChatInput } from './chat-input';

interface Capabilities {
  chat: boolean;
  agent: boolean;
  browserless: boolean;
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

  const loadSession = async () => {
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
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const newChat = () => {
    clearMessages();
    setCurrentTask(null);
    setComputerOpen(false);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    newChat();
    await loadSession();
  };

  const isGuest = Boolean(user?.email?.endsWith('@guest.omnininja.local'));
  const activity = useMemo(() => getInternalActivity(currentTask), [currentTask]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Wordmark />
          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground sm:inline">
            Beta
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={newChat}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova conversa</span>
          </Button>

          {isGuest ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push('/login')}>
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Entrar</span>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
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

      {capabilities && !capabilities.chat && (
        <StatusBanner tone="warning">
          <AlertCircle className="h-3.5 w-3.5" /> OpenAI não está configurada neste deploy.
        </StatusBanner>
      )}

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList />
        </div>

        {activity && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              <span>{activity}</span>
            </div>
          </div>
        )}

        <ChatInput />
      </main>
    </div>
  );
}

function getInternalActivity(task: ReturnType<typeof useOmni.getState>['currentTask']): string {
  if (!task || !['running', 'planning', 'queued', 'awaiting_input'].includes(task.status)) return '';

  const events = task.events;
  const last = events[events.length - 1];
  if (!last) return 'Pensando…';

  if (last.type === 'BROWSER_ACTION') return 'Pesquisando e navegando na web…';
  if (last.type === 'TERMINAL_OUTPUT') return 'Executando código em ambiente isolado…';
  if (last.type === 'FILE_CHANGED') return 'Trabalhando com arquivos…';
  if (last.type === 'STEP_STARTED') return `Executando: ${last.instruction}`;
  if (last.type === 'AGENT_THINKING') return 'Pensando e escolhendo as ferramentas necessárias…';
  if (last.type === 'PLAN_CREATED') return 'Planejando a execução…';

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
    <div className={`flex items-center justify-center gap-2 border-b px-3 py-1.5 text-[11px] ${className}`}>
      {children}
    </div>
  );
}
