'use client';

import { useEffect, useState } from 'react';
import {
  Plus, Bot, Puzzle, CalendarClock, Library, Folder, MessageSquare,
  Sparkles, Share2, BarChart3, Coins, Settings, LogOut, ChevronLeft,
  Menu, Home, ShieldCheck, FileText, Activity, User, Crown, Zap, AlertCircle,
  Sun, Moon, Search, Gift, CreditCard, Store, MoreVertical, ChevronRight,
} from 'lucide-react';
import { useOmni } from '@/lib/store';
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts';
import { useTheme } from '@/components/theme-provider';
import { Wordmark, OmniNinjaLogo } from './brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModelSelector } from './model-selector';
import { MessageList } from './messages';
import { ChatInput } from './chat-input';
import { ComputerPanel, ProgressWidget } from './computer-panel';
import { AdminSheet, DocsSheet, AccountSheet, StatusSheet, LoginSheet, ScheduledSheet, LibrarySheet, PluginsSheet } from './sheets';
import { CommandPalette } from './command-palette';
import {
  Sheet, SheetContent, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SIDEBAR_ITEMS = [
  { icon: Plus, label: 'Nova tarefa', primary: true },
  { icon: Bot, label: 'Agente' },
  { icon: Puzzle, label: 'Plugins', sheet: 'plugins' as const },
  { icon: CalendarClock, label: 'Agendado', sheet: 'scheduled' as const },
  { icon: Library, label: 'Biblioteca', sheet: 'library' as const },
];

const PROJECTS = [
  { name: 'Landing SaaS', color: '#38bdf8' },
  { name: 'Relatório mercado', color: '#a855f7' },
  { name: 'Automação X', color: '#22c55e' },
];

const RECENT_TASKS = [
  { name: 'Criar site portfólio', time: 'há 2h' },
  { name: 'Pesquisar concorrentes', time: 'ontem' },
  { name: 'Script de scraping', time: '2 dias' },
];

export function Workspace() {
  const user = useOmni((s) => s.user);
  const demoMode = useOmni((s) => s.demoMode);
  const currentTask = useOmni((s) => s.currentTask);
  const setView = useOmni((s) => s.setView);
  const computerOpen = useOmni((s) => s.computerOpen);
  const computerFullscreen = useOmni((s) => s.computerFullscreen);
  const sidebarOpen = useOmni((s) => s.sidebarOpen);
  const setSidebarOpen = useOmni((s) => s.setSidebarOpen);
  const clearMessages = useOmni((s) => s.clearMessages);
  const setCurrentTask = useOmni((s) => s.setCurrentTask);
  const setComputerOpen = useOmni((s) => s.setComputerOpen);

  const [adminOpen, setAdminOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // load demo user + configured providers + credits on mount
  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => {
      if (d.user) useOmni.getState().setUser(d.user);
      if (d.providers) useOmni.getState().setConfiguredProviders(d.providers);
      useOmni.getState().setDemoMode(!!d.demoMode);
    }).catch(() => {});
  }, []);

  const newTask = () => {
    clearMessages();
    setCurrentTask(null);
    setComputerOpen(false);
  };

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // ⌘K opens the command palette (was: new task directly)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useKeyboardShortcuts({
    onNewTask: newTask,
    onToggleSidebar: () => setSidebarOpen((v) => !v),
    onOpenShortcuts: () => setShortcutsOpen(true),
  });

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-[200px] flex-shrink-0 flex-col border-r border-border bg-sidebar/60 md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <button onClick={() => setView('landing')} className="transition-opacity hover:opacity-80">
            <Wordmark />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto omni-scroll p-2">
          {SIDEBAR_ITEMS.map((it) =>
            it.primary ? (
              <button
                key={it.label}
                onClick={newTask}
                className="mb-1 flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
              >
                <it.icon className="h-4 w-4" /> {it.label}
              </button>
            ) : (
              <button
                key={it.label}
                onClick={() => {
                  if (it.sheet === 'scheduled') setSchedOpen(true);
                  else if (it.sheet === 'library') setLibOpen(true);
                  else if (it.sheet === 'plugins') setPluginsOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <it.icon className="h-4 w-4" /> {it.label}
                {it.sheet === 'scheduled' && (
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] text-muted-foreground">cron</Badge>
                )}
                {it.sheet === 'plugins' && (
                  <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] text-muted-foreground">3/12</Badge>
                )}
              </button>
            )
          )}

          <div className="mt-4 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Projetos
          </div>
          {PROJECTS.map((p) => (
            <button key={p.name} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          <div className="mt-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Tarefas recentes
          </div>
          {RECENT_TASKS.map((t) => (
            <button key={t.name} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="flex-1 truncate text-left">{t.name}</span>
              <span className="text-[10px] text-muted-foreground/60">{t.time}</span>
            </button>
          ))}

          {/* nav links */}
          <div className="mt-3 border-t border-border pt-2">
            {[
              { icon: FileText, label: 'Docs', action: () => setDocsOpen(true) },
              { icon: Activity, label: 'Status', action: () => setStatusOpen(true) },
              { icon: ShieldCheck, label: 'Integrações', action: () => setAdminOpen(true) },
              { icon: User, label: 'Conta', action: () => setAccountOpen(true) },
            ].map((it) => (
              <button
                key={it.label}
                onClick={it.action}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <it.icon className="h-3.5 w-3.5" /> {it.label}
              </button>
            ))}
          </div>

          {/* promo card */}
          <div className="mt-auto rounded-xl border border-brand/30 bg-gradient-to-br from-brand/10 to-purple-500/10 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Crown className="h-3.5 w-3.5 text-warning" /> Upgrade para Business
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">8.000 créditos/mês e tarefas ilimitadas.</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-[11px]" onClick={() => setAccountOpen(true)}>
              Fazer upgrade
            </Button>
          </div>

          {/* user */}
          <button
            onClick={() => setAccountOpen(true)}
            className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-500 text-[11px] font-bold text-brand-foreground">
              {(user?.name ?? 'O')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium">{user?.name ?? 'Omni Ninja'}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Crown className="h-2.5 w-2.5 text-warning" /> {user?.tier ?? 'Pro'}
              </div>
            </div>
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[260px] border-border bg-sidebar p-0">
          <MobileSidebar
            onNewTask={() => { newTask(); setSidebarOpen(false); }}
            onDocs={() => { setDocsOpen(true); setSidebarOpen(false); }}
            onAdmin={() => { setAdminOpen(true); setSidebarOpen(false); }}
            onAccount={() => { setAccountOpen(true); setSidebarOpen(false); }}
            onStatus={() => { setStatusOpen(true); setSidebarOpen(false); }}
            onScheduled={() => { setSchedOpen(true); setSidebarOpen(false); }}
            onLibrary={() => { setLibOpen(true); setSidebarOpen(false); }}
            onPlugins={() => { setPluginsOpen(true); setSidebarOpen(false); }}
            onHome={() => { setView('landing'); setSidebarOpen(false); }}
            user={user}
          />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:flex" onClick={() => setView('landing')}>
            <Home className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {currentTask?.goal.slice(0, 40) ?? 'Nova conversa'}
            </span>
            <Badge variant="outline" className="hidden gap-1 border-border/60 text-[10px] text-muted-foreground sm:flex">
              <Sparkles className="h-2.5 w-2.5" /> {currentTask?.mode ?? 'agent'}
            </Badge>
          </div>
          {/* Mobile: New chat blue button */}
          <Button size="sm" className="h-8 gap-1 bg-brand px-3 md:hidden" onClick={newTask}>
            <Plus className="h-3.5 w-3.5" /> New chat
          </Button>
          <ModelSelector />
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:flex" aria-label="Estatísticas" onClick={() => setAccountOpen(true)}>
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:flex" aria-label="Compartilhar">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:flex" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" className="hidden h-8 gap-1 border-border bg-card px-2 lg:flex" onClick={() => setPaletteOpen(true)} aria-label="Command palette">
            <Search className="h-3 w-3 text-muted-foreground" />
            <kbd className="font-mono text-[10px] text-muted-foreground">⌘K</kbd>
          </Button>
          <CreditsCounter />
        </header>

        {/* Ninja is working... status bar */}
        {currentTask && ['running', 'planning', 'queued'].includes(currentTask.status) && (
          <div className="flex items-center gap-2 border-b border-brand/20 bg-brand/5 px-3 py-1.5">
            <span className="omni-spin h-3.5 w-3.5 rounded-full border-2 border-brand/30 border-t-brand" />
            <span className="text-xs font-medium text-brand">Ninja is working...</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">{currentTask.stepsDone} steps completed</span>
          </div>
        )}

        {demoMode && (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/5 px-3 py-1.5 text-[11px] text-warning">
            <AlertCircle className="h-3 w-3" />
            <span>Modo demonstração — nenhuma chave de IA configurada. O agente simula a execução. Configure as chaves em <code className="rounded bg-warning/10 px-1">.env</code> para uso real.</span>
            <button onClick={() => setAdminOpen(true)} className="ml-auto underline hover:no-underline">Ver integrações</button>
          </div>
        )}

        {/* body: chat + computer panel */}
        <div className="flex min-h-0 flex-1">
          {/* chat area */}
          <div className={cn(
            'flex min-w-0 flex-1 flex-col',
            computerOpen && !computerFullscreen && 'hidden lg:flex'
          )}>
            <div className="min-h-0 flex-1">
              <MessageList />
            </div>
            <ChatInput />
          </div>

          {/* computer panel */}
          {computerOpen && (
            <div className={cn(
              'flex flex-col',
              computerFullscreen ? 'fixed inset-0 z-50' : 'w-full border-l border-border lg:w-[480px] xl:w-[560px]'
            )}>
              <ComputerPanel />
            </div>
          )}
        </div>
      </div>

      {/* floating progress widget when computer closed */}
      <ProgressWidget />

      {/* sheets */}
      <AdminSheet open={adminOpen} onOpenChange={setAdminOpen} />
      <DocsSheet open={docsOpen} onOpenChange={setDocsOpen} />
      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
      <StatusSheet open={statusOpen} onOpenChange={setStatusOpen} />
      <LoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
      <ScheduledSheet open={schedOpen} onOpenChange={setSchedOpen} />
      <LibrarySheet open={libOpen} onOpenChange={setLibOpen} />
      <PluginsSheet open={pluginsOpen} onOpenChange={setPluginsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        actions={{
          onNewTask: newTask,
          onHome: () => setView('landing'),
          onDocs: () => setDocsOpen(true),
          onAdmin: () => setAdminOpen(true),
          onAccount: () => setAccountOpen(true),
          onStatus: () => setStatusOpen(true),
          onScheduled: () => setSchedOpen(true),
          onLibrary: () => setLibOpen(true),
          onPlugins: () => setPluginsOpen(true),
          onShortcuts: () => setShortcutsOpen(true),
          onToggleTheme: toggleTheme,
        }}
      />
    </div>
  );
}

function CreditsCounter() {
  const user = useOmni((s) => s.user);
  const currentTask = useOmni((s) => s.currentTask);
  // re-render periodically to reflect elapsed
  const [, force] = useState(0);
  useEffect(() => {
    if (!currentTask) return;
    const id = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [currentTask]);

  const total = user ? user.credits + user.bonusCredits : 0;
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border bg-card">
      <Coins className="h-3.5 w-3.5 text-warning" />
      <span className="text-xs font-medium tabular-nums">{total.toLocaleString()}</span>
      <span className="text-[10px] text-muted-foreground">créditos</span>
    </Button>
  );
}

function MobileSidebar({
  onNewTask, onDocs, onAdmin, onAccount, onStatus, onScheduled, onLibrary, onPlugins, onHome, user,
}: {
  onNewTask: () => void; onDocs: () => void; onAdmin: () => void;
  onAccount: () => void; onStatus: () => void; onScheduled: () => void;
  onLibrary: () => void; onPlugins: () => void; onHome: () => void;
  user: { name: string; email: string; tier: string; credits: number; bonusCredits: number } | null;
}) {
  const totalCredits = user ? user.credits + user.bonusCredits : 0;
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header with logo + back */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Wordmark />
        <button onClick={onHome} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto omni-scroll">
        {/* New task */}
        <div className="p-2">
          <button onClick={onNewTask} className="flex w-full items-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-brand-foreground">
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        </div>

        {/* Apps store + Search */}
        <div className="px-2 space-y-0.5">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <Store className="h-4 w-4" /> Apps store
            <Badge variant="default" className="ml-auto h-4 px-1.5 text-[9px] bg-brand text-brand-foreground">New</Badge>
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <Search className="h-4 w-4" /> Buscar
          </button>
        </div>

        {/* Projects */}
        <div className="mt-3 px-4 pb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Projects</span>
          <button className="text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="px-2 space-y-0.5">
          {PROJECTS.map((p) => (
            <button key={p.name} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="truncate flex-1 text-left">{p.name}</span>
              <MoreVertical className="h-3.5 w-3.5 opacity-50" />
            </button>
          ))}
        </div>

        {/* All tasks */}
        <div className="mt-3 px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">All tasks</div>
        <div className="px-2 space-y-0.5">
          {RECENT_TASKS.map((t) => (
            <button key={t.name} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 truncate text-left">{t.name}</span>
              <span className="text-[10px] text-muted-foreground/60">{t.time}</span>
              <MoreVertical className="h-3.5 w-3.5 opacity-50" />
            </button>
          ))}
        </div>

        {/* Credits section */}
        <div className="mt-4 mx-2 space-y-2">
          <button
            onClick={onAccount}
            className="flex w-full items-center gap-3 rounded-xl border border-brand/30 bg-gradient-to-br from-brand/10 to-purple-500/10 p-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/20">
              <Gift className="h-4 w-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">Get Free Credits</div>
              <div className="text-[10px] text-muted-foreground">Earn 100 credits each</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={onAccount}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/20">
              <CreditCard className="h-4 w-4 text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">Buy more credits</div>
              <div className="text-[10px] text-muted-foreground">Get credits instantly</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Nav links */}
        <div className="mt-3 border-t border-border px-2 pt-2 space-y-0.5">
          {[
            { icon: Home, label: 'Início', action: onHome },
            { icon: FileText, label: 'Documentação', action: onDocs },
            { icon: Activity, label: 'Status', action: onStatus },
            { icon: ShieldCheck, label: 'Integrações', action: onAdmin },
            { icon: CalendarClock, label: 'Agendado', action: onScheduled },
            { icon: Library, label: 'Biblioteca', action: onLibrary },
            { icon: Puzzle, label: 'Plugins', action: onPlugins },
          ].map((it) => (
            <button key={it.label} onClick={it.action} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <it.icon className="h-4 w-4" /> {it.label}
            </button>
          ))}
        </div>
      </div>

      {/* User profile with email */}
      <div className="border-t border-border p-2">
        <button onClick={onAccount} className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-500 text-xs font-bold text-brand-foreground">
            {(user?.name ?? 'O')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{user?.name ?? 'Omni Ninja'}</div>
            <div className="truncate text-[10px] text-muted-foreground">{user?.email ?? 'user@omninja.ai'}</div>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-warning">
            <Crown className="h-2.5 w-2.5" /> {user?.tier ?? 'Pro'}
          </div>
        </button>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  { keys: ['⌘', 'K'], label: 'Command Palette', desc: 'Busca e executa qualquer comando' },
  { keys: ['⌘', 'N'], label: 'Nova conversa', desc: 'Limpa o chat e inicia uma nova tarefa' },
  { keys: ['⌘', 'B'], label: 'Alternar sidebar', desc: 'Mostra/esconde a barra lateral (mobile)' },
  { keys: ['⌘', '.'], label: 'Painel Computador', desc: 'Abre/fecha o painel quando há tarefa ativa' },
  { keys: ['⌘', '↵'], label: 'Focar input', desc: 'Foca o campo de mensagem' },
  { keys: ['1'], label: 'Modo Chat', desc: 'Resposta direta, sem sandbox' },
  { keys: ['2'], label: 'Modo Agent', desc: 'Orquestrador + 1 sub-agente' },
  { keys: ['3'], label: 'Modo Agent MAX', desc: 'Múltiplos sub-agentes em paralelo' },
  { keys: ['?'], label: 'Esta ajuda', desc: 'Mostra os atalhos de teclado' },
  { keys: ['Esc'], label: 'Fechar painel', desc: 'Fecha o Computador ou sheets' },
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" /> Atalhos de teclado
          </DialogTitle>
          <DialogDescription>Acelere seu fluxo com estes atalhos.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-background px-1.5 font-mono text-[11px] font-medium text-foreground shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">No Windows/Linux use Ctrl no lugar de ⌘</p>
      </DialogContent>
    </Dialog>
  );
}
