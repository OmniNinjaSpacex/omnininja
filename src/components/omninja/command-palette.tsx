'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Bot, CalendarClock, Library, FileText, ShieldCheck, User,
  Activity, Home, Sparkles, Zap, Sun, Moon, Code2, Globe, Terminal as TerminalIcon,
  CornerDownLeft, ArrowUp, Settings,
} from 'lucide-react';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useOmni } from '@/lib/store';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Plus;
  group: 'Actions' | 'Navigation' | 'Modes' | 'Settings';
  keywords?: string;
  shortcut?: string[];
  action: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actions: {
    onNewTask: () => void;
    onHome: () => void;
    onDocs: () => void;
    onAdmin: () => void;
    onAccount: () => void;
    onStatus: () => void;
    onScheduled: () => void;
    onLibrary: () => void;
    onPlugins: () => void;
    onShortcuts: () => void;
    onToggleTheme?: () => void;
  };
}

export function CommandPalette({ open, onOpenChange, actions }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mode = useOmni((s) => s.mode);
  const setMode = useOmni((s) => s.setMode);

  const items = useMemo<CommandItem[]>(() => [
    { id: 'new', label: 'Nova conversa', hint: 'Limpa o chat e inicia', icon: Plus, group: 'Actions', shortcut: ['⌘', 'K'], action: actions.onNewTask },
    { id: 'home', label: 'Ir para a landing', hint: 'Página pública', icon: Home, group: 'Navigation', action: actions.onHome },
    { id: 'docs', label: 'Documentação', icon: FileText, group: 'Navigation', action: actions.onDocs },
    { id: 'status', label: 'Status do sistema', icon: Activity, group: 'Navigation', action: actions.onStatus },
    { id: 'integrations', label: 'Integrações (admin)', icon: ShieldCheck, group: 'Navigation', action: actions.onAdmin },
    { id: 'account', label: 'Conta e créditos', icon: User, group: 'Navigation', action: actions.onAccount },
    { id: 'scheduled', label: 'Tarefas agendadas', icon: CalendarClock, group: 'Navigation', action: actions.onScheduled },
    { id: 'library', label: 'Biblioteca (histórico)', icon: Library, group: 'Navigation', action: actions.onLibrary },
    { id: 'plugins', label: 'Plugins', icon: Bot, group: 'Navigation', action: actions.onPlugins },
    { id: 'mode-chat', label: 'Modo Chat', hint: 'Resposta direta, sem sandbox', icon: Sparkles, group: 'Modes', shortcut: ['1'], keywords: 'chat simples pergunta', action: () => setMode('chat') },
    { id: 'mode-agent', label: 'Modo Agent', hint: 'Orquestrador + 1 sub-agente', icon: Bot, group: 'Modes', shortcut: ['2'], keywords: 'agent sandbox', action: () => setMode('agent') },
    { id: 'mode-max', label: 'Modo Agent MAX', hint: 'Múltiplos sub-agentes em paralelo', icon: Zap, group: 'Modes', shortcut: ['3'], keywords: 'max parallel wide research', action: () => setMode('agent_max') },
    { id: 'shortcuts', label: 'Ver atalhos de teclado', icon: Settings, group: 'Settings', shortcut: ['?'], action: actions.onShortcuts },
    ...(actions.onToggleTheme ? [{ id: 'theme', label: 'Alternar tema (claro/escuro)', icon: Sun, group: 'Settings' as const, keywords: 'theme dark light tema', action: actions.onToggleTheme }] : []),
  ], [actions, setMode]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) =>
      it.label.toLowerCase().includes(q) ||
      it.hint?.toLowerCase().includes(q) ||
      it.keywords?.toLowerCase().includes(q) ||
      it.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const exec = (it?: CommandItem) => {
    if (!it) return;
    onOpenChange(false);
    setTimeout(it.action, 50);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(filtered[active]); }
    else if (e.key === 'Escape') { onOpenChange(false); }
  };

  let flatIdx = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-border bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xl" showCloseButton={false}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar comandos, páginas, modos…"
            className="flex-1 bg-transparent py-4 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto omni-scroll p-2">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 h-6 w-6 opacity-30" />
              Nenhum comando para "{query}"
            </div>
          )}
          {grouped.map(([group, gItems]) => (
            <div key={group} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{group}</div>
              {gItems.map((it) => {
                flatIdx++;
                const idx = flatIdx;
                const isActive = idx === active;
                return (
                  <button
                    key={it.id}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => exec(it)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                      isActive ? 'bg-brand/10 text-foreground' : 'text-foreground/80 hover:bg-accent'
                    )}
                  >
                    <it.icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-brand' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.label}</div>
                      {it.hint && <div className="text-[11px] text-muted-foreground">{it.hint}</div>}
                    </div>
                    {it.shortcut && (
                      <div className="flex gap-1">
                        {it.shortcut.map((k) => (
                          <kbd key={k} className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    )}
                    {isActive && <CornerDownLeft className="h-3 w-3 text-brand" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /><ArrowUp className="h-3 w-3 -ml-2" /> navegar</span>
            <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> selecionar</span>
          </div>
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-brand" /> OmniNinja</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
