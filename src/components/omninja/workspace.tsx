'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Bot,
  Home,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useOmni } from '@/lib/store';
import { useTheme } from '@/components/theme-provider';
import { Wordmark } from './brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModelSelector } from './model-selector';
import { MessageList } from './messages';
import { ChatInput } from './chat-input';
import { ComputerPanel, ProgressWidget } from './computer-panel';
import { Sheet, SheetContent } from '@/components/ui/sheet';

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
  const setView = useOmni((state) => state.setView);
  const computerOpen = useOmni((state) => state.computerOpen);
  const computerFullscreen = useOmni((state) => state.computerFullscreen);
  const sidebarOpen = useOmni((state) => state.sidebarOpen);
  const setSidebarOpen = useOmni((state) => state.setSidebarOpen);
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

  const newTask = () => {
    clearMessages();
    setCurrentTask(null);
    setComputerOpen(false);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    clearMessages();
    setCurrentTask(null);
    setComputerOpen(false);
    await loadSession();
  };

  const isGuest = Boolean(user?.email?.endsWith('@guest.omnininja.local'));
  const totalCredits = (user?.credits ?? 0) + (user?.bonusCredits ?? 0);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar/60 md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <button onClick={() => setView('landing')} className="transition-opacity hover:opacity-80">
            <Wordmark />
          </button>
          <Badge variant="outline" className="ml-auto text-[9px] text-muted-foreground">Beta</Badge>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-2">
          <Button className="justify-start gap-2" onClick={newTask}>
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>

          <div className="mt-3 space-y-1">
            <SidebarItem
              icon={Bot}
              label="Agent"
              detail="ferramentas reais"
              onClick={() => useOmni.getState().setMode('agent')}
            />
            <SidebarItem
              icon={ShieldCheck}
              label="Agent MAX"
              detail="mais iterações"
              onClick={() => useOmni.getState().setMode('agent_max')}
            />
          </div>

          <div className="mt-5 rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estado deste deploy</div>
            <CapabilityRow label="OpenAI" ready={Boolean(capabilities?.chat)} />
            <CapabilityRow label="Browserless" ready={Boolean(capabilities?.browserless)} />
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Terminal só executa quando o host oferece o sandbox seguro exigido pelo backend.
            </p>
          </div>

          <div className="mt-auto space-y-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                  {(user?.name || 'G')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{user?.name || 'Carregando…'}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {isGuest ? 'Sessão guest isolada' : user?.email}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                {totalCredits.toLocaleString()} créditos disponíveis
              </div>
            </div>

            {isGuest ? (
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => router.push('/login')}>
                <LogIn className="h-3.5 w-3.5" /> Entrar / Criar conta
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
                <LogOut className="h-3.5 w-3.5" /> Sair
              </Button>
            )}
          </div>
        </div>
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 border-border bg-sidebar p-3">
          <div className="flex items-center justify-between pb-4">
            <Wordmark />
            <Badge variant="outline" className="text-[9px]">Beta</Badge>
          </div>
          <Button
            className="w-full justify-start gap-2"
            onClick={() => {
              newTask();
              setSidebarOpen(false);
            }}
          >
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
          <div className="mt-3 space-y-1">
            <SidebarItem
              icon={Bot}
              label="Agent"
              detail="ferramentas reais"
              onClick={() => {
                useOmni.getState().setMode('agent');
                setSidebarOpen(false);
              }}
            />
            <SidebarItem
              icon={ShieldCheck}
              label="Agent MAX"
              detail="mais iterações"
              onClick={() => {
                useOmni.getState().setMode('agent_max');
                setSidebarOpen(false);
              }}
            />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            {isGuest ? (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/login')}>
                <User className="h-4 w-4" /> Entrar / Criar conta
              </Button>
            ) : (
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={logout}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:flex" onClick={() => setView('landing')}>
            <Home className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {currentTask?.goal?.slice(0, 60) || 'Nova conversa'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {currentTask ? `${currentTask.mode} · ${currentTask.status}` : 'Chat, Agent e ferramentas reais'}
            </div>
          </div>

          <ModelSelector />
          <Badge variant="outline" className="hidden text-[10px] text-muted-foreground sm:flex">
            {totalCredits.toLocaleString()} créditos
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Alternar tema"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>

        {sessionError && (
          <StatusBanner tone="danger">
            <AlertCircle className="h-3.5 w-3.5" /> {sessionError}
          </StatusBanner>
        )}
        {capabilities && !capabilities.chat && (
          <StatusBanner tone="warning">
            <AlertCircle className="h-3.5 w-3.5" /> OpenAI não está configurada neste deploy. Chat e Agent falharão explicitamente; não existe fallback simulado.
          </StatusBanner>
        )}
        {capabilities?.chat && !capabilities.browserless && (
          <StatusBanner tone="neutral">
            <AlertCircle className="h-3.5 w-3.5" /> Browserless não está configurado; tarefas que exigem navegador serão limitadas.
          </StatusBanner>
        )}

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <MessageList />
            </div>
            <ChatInput />
          </section>

          {computerOpen && !computerFullscreen && (
            <aside className="fixed inset-0 z-40 bg-background md:static md:z-auto md:w-[52%] md:min-w-[420px] md:border-l md:border-border">
              <ComputerPanel />
            </aside>
          )}
        </div>
      </div>

      {computerOpen && computerFullscreen && <ComputerPanel />}
      <ProgressWidget />
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: typeof Bot;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className="ml-auto text-[9px] text-muted-foreground/70">{detail}</span>
    </button>
  );
}

function CapabilityRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px]">
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-success' : 'bg-muted-foreground/40'}`} />
      <span>{label}</span>
      <span className="ml-auto text-muted-foreground">{ready ? 'configurado' : 'ausente'}</span>
    </div>
  );
}

function StatusBanner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'danger' | 'warning' | 'neutral';
}) {
  const className = tone === 'danger'
    ? 'border-danger/30 bg-danger/5 text-danger'
    : tone === 'warning'
      ? 'border-warning/30 bg-warning/5 text-warning'
      : 'border-border bg-accent/40 text-muted-foreground';

  return (
    <div className={`flex items-center gap-2 border-b px-3 py-1.5 text-[11px] ${className}`}>
      {children}
    </div>
  );
}
