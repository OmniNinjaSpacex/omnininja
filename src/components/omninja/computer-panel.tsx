'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2, Eye, Globe, Terminal as TerminalIcon, Maximize2, Minimize2, X,
  Play, Pause, ChevronLeft, ChevronRight, Radio, Folder, File as FileIcon,
  MousePointer2, Check, AlertCircle, Brain, FileCode, GitBranch, ZoomIn,
} from 'lucide-react';
import { useOmni, type ComputerTab, type AgentEvent } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function ComputerPanel() {
  const open = useOmni((s) => s.computerOpen);
  const task = useOmni((s) => s.currentTask);
  const fullscreen = useOmni((s) => s.computerFullscreen);
  const setOpen = useOmni((s) => s.setComputerOpen);

  if (!open || !task) return null;

  return (
    <div
      className={cn(
        'flex flex-col border-l border-border bg-card',
        fullscreen ? 'fixed inset-0 z-50' : 'h-full w-full'
      )}
    >
      <PanelHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelContent />
      </div>
      <ReplayBar />
    </div>
  );
}

function PanelHeader() {
  const tab = useOmni((s) => s.computerTab);
  const setTab = useOmni((s) => s.setComputerTab);
  const fullscreen = useOmni((s) => s.computerFullscreen);
  const toggleFs = useOmni((s) => s.toggleComputerFullscreen);
  const setOpen = useOmni((s) => s.setComputerOpen);
  const task = useOmni((s) => s.currentTask);
  const replayIndex = useOmni((s) => s.replayIndex);
  const setReplayIndex = useOmni((s) => s.setReplayIndex);
  const live = useOmni((s) => s.live);
  const setLive = useOmni((s) => s.setLive);

  const tabs: { id: ComputerTab; label: string; icon: typeof Code2 }[] = [
    { id: 'code', label: 'Código', icon: Code2 },
    { id: 'preview', label: 'Pré-visualizar', icon: Eye },
    { id: 'browser', label: 'Navegador', icon: Globe },
    { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  ];

  const activeEvents = task?.events.length ?? 0;
  const events = task?.events ?? [];
  const idx = replayIndex ?? events.length - 1;
  const total = Math.max(events.length - 1, 0);

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background/60 px-2 py-1.5">
      <div className="flex items-center gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {/* Mobile: page navigation X/Y with arrows */}
        <div className="flex items-center gap-0.5 lg:hidden">
          <button
            className="h-6 w-6 rounded text-muted-foreground hover:bg-accent"
            onClick={() => { setLive(false); setReplayIndex(Math.max(0, idx - 1)); }}
            disabled={idx <= 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
            {idx + 1}/{total + 1}
          </span>
          <button
            className="h-6 w-6 rounded text-muted-foreground hover:bg-accent"
            onClick={() => { setLive(false); setReplayIndex(Math.min(total, idx + 1)); }}
            disabled={idx >= total}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Zoom indicator (mobile) */}
        <Badge variant="outline" className="hidden gap-1 border-border/60 text-[10px] text-muted-foreground md:flex">
          <ZoomIn className="h-2.5 w-2.5" /> 100%
        </Badge>
        <Badge variant="outline" className="hidden gap-1 border-border/60 text-[10px] text-muted-foreground md:flex">
          <GitBranch className="h-2.5 w-2.5" /> {activeEvents} eventos
        </Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFs} aria-label="Tela cheia">
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Fechar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PanelContent() {
  const tab = useOmni((s) => s.computerTab);
  if (tab === 'browser') return <BrowserView />;
  if (tab === 'terminal') return <TerminalView />;
  if (tab === 'code') return <CodeView />;
  return <PreviewView />;
}

/* ---------------- Terminal ---------------- */
function TerminalView() {
  const task = useOmni((s) => s.currentTask);
  const live = useOmni((s) => s.live);
  const endRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const out: { kind: 'cmd' | 'out' | 'err' | 'meta'; text: string }[] = [];
    out.push({ kind: 'meta', text: 'OmniNinja sandbox · Ubuntu 22.04 · /workspace' });
    for (const ev of task?.events ?? []) {
      if (ev.type === 'TERMINAL_OUTPUT') {
        out.push({ kind: 'cmd', text: ev.cmd });
        if (ev.stdout) ev.stdout.split('\n').forEach((l) => l && out.push({ kind: 'out', text: l }));
        if (ev.stderr) ev.stderr.split('\n').forEach((l) => l && out.push({ kind: 'err', text: l }));
        if (ev.exitCode !== 0) out.push({ kind: 'err', text: `exit ${ev.exitCode}` });
      }
    }
    return out;
  }, [task?.events]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="h-full bg-[#0a0a0c] p-3 font-mono text-[12px] leading-relaxed omni-scroll overflow-y-auto">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap break-words',
            l.kind === 'cmd' && 'text-success',
            l.kind === 'out' && 'text-muted-foreground',
            l.kind === 'err' && 'text-danger',
            l.kind === 'meta' && 'text-muted-foreground/60 italic'
          )}
        >
          {l.kind === 'cmd' ? <><span className="text-brand">sandbox@omninja</span>:<span className="text-purple-400">~/workspace</span>$ {l.text.slice(5)}</> : l.text}
        </div>
      ))}
      {live && task?.status === 'running' && (
        <div className="text-brand">$ <span className="terminal-cursor" /></div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/* ---------------- Browser ---------------- */
function BrowserView() {
  const task = useOmni((s) => s.currentTask);
  const live = useOmni((s) => s.live);
  const screenshot = useOmni((s) => s.currentTask?.currentScreenshot);

  const browserEvents = useMemo(
    () => (task?.events ?? []).filter((e) => e.type === 'BROWSER_ACTION') as Extract<AgentEvent, { type: 'BROWSER_ACTION' }>[],
    [task?.events]
  );

  const lastNav = [...browserEvents].reverse().find((e) => e.action === 'navigate');
  const url = lastNav?.url ?? 'about:blank';
  const actions = browserEvents;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex gap-1">
          <button className="h-6 w-6 rounded text-muted-foreground hover:bg-accent"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button className="h-6 w-6 rounded text-muted-foreground hover:bg-accent"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-success animate-live-dot' : 'bg-muted-foreground/40')} />
          <span className="truncate">{url}</span>
          {live && <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-[9px] text-success"><Radio className="h-2.5 w-2.5" /> Live</Badge>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* viewport — shows REAL screenshot when available, falls back to mock */}
        <div className="relative flex-1 overflow-hidden bg-white">
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Browser screenshot"
              className="h-full w-full object-contain"
            />
          ) : (
            <BrowserMock url={url} />
          )}
          {/* virtual cursor */}
          <VirtualCursor active={live && task?.status === 'running'} />
          {actions.length === 0 && !screenshot && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center text-muted-foreground">
                <Globe className="mx-auto h-8 w-8 opacity-40" />
                <p className="mt-2 text-xs">Aguardando o Browser Agent…</p>
              </div>
            </div>
          )}
          {screenshot && (
            <div className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-[9px] text-success backdrop-blur">
              ● Screenshot REAL (Browserless)
            </div>
          )}
        </div>

        {/* action history */}
        <div className="hidden w-56 flex-shrink-0 border-l border-border bg-card md:flex md:flex-col">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Histórico de ações ({actions.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto omni-scroll">
            {actions.map((a, i) => (
              <div key={i} className="border-b border-border/50 px-3 py-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-medium text-foreground/90">
                  <MousePointer2 className="h-3 w-3 text-brand" />
                  <span className="capitalize">{a.action.replace(/_/g, ' ')}</span>
                </div>
                {a.url && <div className="mt-0.5 truncate text-muted-foreground">{a.url}</div>}
                {a.detail && <div className="mt-0.5 text-muted-foreground/80">{a.detail}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrowserMock({ url }: { url: string }) {
  // lightweight stylized render of the visited page based on domain
  const domain = (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } })();
  const isHn = domain.includes('ycombinator');
  const isGh = domain.includes('github');
  const isTw = domain.includes('tailwindcss');
  const isManus = domain.includes('manus');
  const isNinja = domain.includes('ninja');

  return (
    <div className="h-full w-full overflow-hidden bg-white text-[#1a1a1a]">
      <div className="border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-gradient-to-br from-cyan-400 to-purple-500" />
          <span className="text-[11px] font-semibold">{domain}</span>
          <div className="ml-auto flex gap-3 text-[10px] text-gray-500">
            <span>Sobre</span><span>Recursos</span><span>Preços</span>
          </div>
        </div>
      </div>
      <div className="p-4">
        {isHn && (
          <div className="space-y-1.5">
            {['Show HN: OmniNinja — agente autônomo open', 'Manus vs Ninja: comparação 2026', 'GLM-5.2 liberado sob MIT', 'Wide research com 100 agentes'].map((t, i) => (
              <div key={i} className="flex gap-2 text-[11px]">
                <span className="text-orange-500">{i + 1}.</span>
                <span className="text-gray-700">{t}</span>
                <span className="ml-auto text-[9px] text-gray-400">{(i + 1) * 23} pts</span>
              </div>
            ))}
          </div>
        )}
        {isGh && (
          <div className="space-y-2">
            <div className="text-[13px] font-semibold">Trending repositories</div>
            {['omninja/core', 'anthropics/claude-sonnet-5', 'zai/glm-5.2', 'ninja/agent-max'].map((r) => (
              <div key={r} className="rounded border border-gray-200 p-2">
                <div className="text-[11px] font-medium text-blue-600">{r}</div>
                <div className="text-[10px] text-gray-500">Autonomous AI agent platform</div>
                <div className="mt-1 flex gap-2 text-[9px] text-gray-400"><span>★ 12.4k</span><span>TypeScript</span></div>
              </div>
            ))}
          </div>
        )}
        {isTw && (
          <div className="space-y-2">
            <div className="text-[14px] font-bold">Rapidly build modern websites</div>
            <div className="grid grid-cols-3 gap-2">
              {['Installation', 'Core concepts', 'Theme', 'Layouts', 'Typography', 'Components'].map((t) => (
                <div key={t} className="rounded border border-gray-200 p-1.5 text-[10px] text-gray-700">{t}</div>
              ))}
            </div>
          </div>
        )}
        {(isManus || isNinja || (!isHn && !isGh && !isTw)) && (
          <div className="space-y-2">
            <div className="text-[15px] font-bold">Agente de IA autônomo</div>
            <div className="text-[11px] text-gray-600">Decompõe tarefas e mostra cada passo em tempo real.</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {['Sandbox', 'Terminal', 'Navegador', 'Multi-modelo'].map((f) => (
                <div key={f} className="rounded bg-gray-100 p-1.5 text-[10px] text-gray-700">{f}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VirtualCursor({ active }: { active: boolean }) {
  const [pos, setPos] = useState({ x: 60, y: 80 });
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setPos({
        x: 40 + Math.random() * 60,
        y: 40 + Math.random() * 50,
      });
    }, 1800);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 transition-all duration-700 ease-out"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <MousePointer2 className="h-4 w-4 fill-white text-black drop-shadow" />
    </div>
  );
}

/* ---------------- Code ---------------- */
function CodeView() {
  const task = useOmni((s) => s.currentTask);
  const fileEvents = (task?.events ?? []).filter((e) => e.type === 'FILE_CHANGED') as Extract<AgentEvent, { type: 'FILE_CHANGED' }>[];
  const plan = (task?.events ?? []).find((e) => e.type === 'PLAN_CREATED') as Extract<AgentEvent, { type: 'PLAN_CREATED' }> | undefined;

  const [selected, setSelected] = useState(0);
  const files = fileEvents.length
    ? fileEvents.map((f) => ({ path: f.path, diff: f.diff }))
    : [{ path: '/workspace/README.md', diff: '+# OmniNinja Workspace\n+Tarefa em execução…' }];

  return (
    <div className="flex h-full">
      {/* file tree */}
      <div className="hidden w-52 flex-shrink-0 flex-col border-r border-border bg-sidebar/40 sm:flex">
        <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Explorer</div>
        <div className="min-h-0 flex-1 overflow-y-auto omni-scroll p-1.5">
          <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-muted-foreground">
            <Folder className="h-3 w-3" /> workspace
          </div>
          <div className="ml-3 border-l border-border pl-2">
            {files.map((f, i) => {
              const name = f.path.split('/').pop();
              return (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors',
                    selected === i ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FileCode className="h-3 w-3" /> {name}
                </button>
              );
            })}
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-muted-foreground/60">
              <FileIcon className="h-3 w-3" /> package.json
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-muted-foreground/60">
              <FileIcon className="h-3 w-3" /> tsconfig.json
            </div>
          </div>
        </div>
      </div>

      {/* editor */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#0a0a0c]">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <FileCode className="h-3 w-3" />
          <span className="truncate">{files[selected]?.path}</span>
          <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] text-success">+{files[selected]?.diff?.split('\n').length ?? 0}</Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-auto omni-scroll p-3 font-mono text-[12px] leading-relaxed">
          {plan && selected === 0 && (
            <div className="mb-3 rounded border border-border/60 bg-card p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
                <Brain className="h-3 w-3 text-brand" /> Plano do Orquestrador
              </div>
              <ol className="space-y-1">
                {plan.steps.map((s, i) => {
                  const done = (task?.events ?? []).some((e) => e.type === 'STEP_COMPLETED' && e.stepId === s.id);
                  const started = (task?.events ?? []).some((e) => e.type === 'STEP_STARTED' && e.stepId === s.id);
                  return (
                    <li key={s.id} className="flex items-start gap-2 text-[11px]">
                      <span className={cn(
                        'mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full text-[8px]',
                        done ? 'bg-success/20 text-success' : started ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground'
                      )}>
                        {done ? <Check className="h-2 w-2" /> : i + 1}
                      </span>
                      <span className={done ? 'text-muted-foreground line-through' : 'text-foreground/80'}>
                        [{s.agent}] {s.title}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <pre className="whitespace-pre-wrap break-words">
            {files[selected]?.diff?.split('\n').map((line, i) => (
              <div key={i} className={cn(line.startsWith('+') ? 'bg-success/10 text-success' : line.startsWith('-') ? 'bg-danger/10 text-danger' : 'text-muted-foreground')}>
                <span className="mr-3 inline-block w-4 select-none text-right text-muted-foreground/50">{i + 1}</span>
                {line}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Preview ---------------- */
function PreviewView() {
  const task = useOmni((s) => s.currentTask);
  const completed = task?.status === 'completed';
  const artifacts = task?.artifacts ?? [];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <Eye className="h-3 w-3" /> Pré-visualização do artefato
        <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">localhost:3000</Badge>
      </div>
      <div className="flex-1 overflow-auto omni-scroll bg-white p-0">
        {completed ? (
          <div className="h-full">
            {/* a mock built site preview */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-12 text-center text-white">
              <div className="mx-auto h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500" />
              <h1 className="mt-4 font-serif text-2xl font-bold">Seu SaaS está pronto 🎉</h1>
              <p className="mt-2 text-sm text-slate-300">Construído pelo OmniNinja em segundos.</p>
              <div className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-xs font-medium">Começar agora</div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-6">
              {['Rápido', 'Seguro', 'Escalável'].map((f) => (
                <div key={f} className="rounded-lg border border-gray-200 p-3 text-center">
                  <div className="mx-auto h-6 w-6 rounded bg-cyan-100" />
                  <div className="mt-2 text-xs font-medium text-gray-800">{f}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="omni-shimmer mx-auto h-32 w-64 rounded-lg" />
              <p className="mt-3 text-xs">Construindo pré-visualização…</p>
            </div>
          </div>
        )}
      </div>
      {completed && artifacts.length > 0 && (
        <div className="border-t border-border bg-card p-2">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Artefatos gerados</div>
          <div className="flex flex-wrap gap-1.5">
            {artifacts.map((a) => (
              <Badge key={a.name} variant="outline" className="gap-1 border-border text-[10px]">
                <FileIcon className="h-2.5 w-2.5" /> {a.name}
                <span className="text-muted-foreground">{(a.sizeBytes / 1024).toFixed(0)}KB</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Replay bar ---------------- */
function ReplayBar() {
  const task = useOmni((s) => s.currentTask);
  const live = useOmni((s) => s.live);
  const setLive = useOmni((s) => s.setLive);
  const replayIndex = useOmni((s) => s.replayIndex);
  const setReplayIndex = useOmni((s) => s.setReplayIndex);
  const events = task?.events ?? [];

  const idx = replayIndex ?? events.length - 1;
  const total = Math.max(events.length - 1, 0);

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background/60 px-3 py-1.5">
      <Button
        variant="ghost" size="icon" className="h-6 w-6"
        onClick={() => { setLive(false); setReplayIndex(Math.max(0, idx - 1)); }}
        disabled={idx === 0}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-6 w-6"
        onClick={() => { if (live) setLive(false); else { setLive(true); setReplayIndex(null); } }}
      >
        {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost" size="icon" className="h-6 w-6"
        onClick={() => { setLive(false); setReplayIndex(Math.min(total, idx + 1)); }}
        disabled={idx >= total}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>

      {/* scrubber */}
      <div className="group relative h-1.5 flex-1 rounded-full bg-accent">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-brand transition-all"
          style={{ width: `${total ? (idx / total) * 100 : 0}%` }}
        />
        <input
          type="range" min={0} max={total} value={idx}
          onChange={(e) => { setLive(false); setReplayIndex(Number(e.target.value)); }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>

      <Badge variant="outline" className="gap-1 border-border/60 text-[10px]">
        {live ? (
          <><span className="h-1.5 w-1.5 rounded-full bg-success animate-live-dot" /> Live</>
        ) : (
          <>{idx + 1}/{total + 1}</>
        )}
      </Badge>
    </div>
  );
}

/* ---------------- Floating progress widget ---------------- */
export function ProgressWidget() {
  const task = useOmni((s) => s.currentTask);
  const setOpen = useOmni((s) => s.setComputerOpen);
  const open = useOmni((s) => s.computerOpen);
  const [expanded, setExpanded] = useState(true);

  if (!task || open) return null;
  const plan = (task.events.find((e) => e.type === 'PLAN_CREATED') as Extract<AgentEvent, { type: 'PLAN_CREATED' }> | undefined);
  const steps = plan?.steps ?? [];
  const pct = steps.length ? Math.round((task.stepsDone / steps.length) * 100) : 0;
  const elapsed = task.finishedAt ? task.finishedAt - task.startedAt : Date.now() - task.startedAt;

  return (
    <div className="fixed bottom-24 right-4 z-40 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-brand/10 animate-fade-up">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className={cn('h-2 w-2 rounded-full', task.status === 'running' ? 'bg-brand animate-live-dot' : task.status === 'completed' ? 'bg-success' : 'bg-warning')} />
        <span className="text-xs font-medium">
          {task.status === 'running' ? 'Executando…' : task.status === 'completed' ? 'Concluído' : task.status}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{task.stepsDone}/{steps.length} · {Math.round(elapsed / 1000)}s</span>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-accent">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto omni-scroll">
            {steps.map((s, i) => {
              const done = task.events.some((e) => e.type === 'STEP_COMPLETED' && e.stepId === s.id);
              const started = task.events.some((e) => e.type === 'STEP_STARTED' && e.stepId === s.id);
              return (
                <div key={s.id} className="flex items-center gap-2 text-[11px]">
                  <span className={cn(
                    'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full',
                    done ? 'bg-success/20 text-success' : started ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground'
                  )}>
                    {done ? <Check className="h-2 w-2" /> : started ? <span className="h-1 w-1 rounded-full bg-brand animate-live-dot" /> : i + 1}
                  </span>
                  <span className={cn('truncate', done ? 'text-muted-foreground' : 'text-foreground/80')}>{s.title}</span>
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="outline" className="mt-2 w-full text-[11px]" onClick={() => setOpen(true)}>
            Abrir Computador
          </Button>
        </div>
      )}
    </div>
  );
}

export { AlertCircle };
