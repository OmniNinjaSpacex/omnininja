'use client';

import { useMemo, useState } from 'react';
import {
  Code2,
  Eye,
  Globe,
  Terminal as TerminalIcon,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  AlertCircle,
  Check,
  FileText,
  Folder,
  Radio,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useOmni, type ComputerTab, type AgentEvent } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function ComputerPanel() {
  const open = useOmni((state) => state.computerOpen);
  const task = useOmni((state) => state.currentTask);
  const fullscreen = useOmni((state) => state.computerFullscreen);

  if (!open || !task) return null;

  return (
    <div
      className={cn(
        'flex flex-col border-l border-border bg-card',
        fullscreen ? 'fixed inset-0 z-50' : 'h-full w-full',
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
  const tab = useOmni((state) => state.computerTab);
  const setTab = useOmni((state) => state.setComputerTab);
  const fullscreen = useOmni((state) => state.computerFullscreen);
  const toggleFullscreen = useOmni((state) => state.toggleComputerFullscreen);
  const setOpen = useOmni((state) => state.setComputerOpen);
  const task = useOmni((state) => state.currentTask);

  const tabs: { id: ComputerTab; label: string; icon: typeof Code2 }[] = [
    { id: 'code', label: 'Código', icon: Code2 },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'browser', label: 'Navegador', icon: Globe },
    { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background/70 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              tab === item.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Badge variant="outline" className="hidden text-[10px] text-muted-foreground sm:flex">
          {task?.events.length ?? 0} eventos reais
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={toggleFullscreen}
          aria-label="Tela cheia"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(false)}
          aria-label="Fechar Computer"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PanelContent() {
  const tab = useOmni((state) => state.computerTab);
  if (tab === 'browser') return <BrowserView />;
  if (tab === 'terminal') return <TerminalView />;
  if (tab === 'code') return <CodeView />;
  return <PreviewView />;
}

function BrowserView() {
  const task = useOmni((state) => state.currentTask);
  const screenshot = task?.currentScreenshot;
  const session = task?.browserSession;

  const browserEvents = useMemo(
    () =>
      (task?.events ?? []).filter(
        (event) => event.type === 'BROWSER_ACTION',
      ) as Extract<AgentEvent, { type: 'BROWSER_ACTION' }>[],
    [task?.events],
  );

  const lastUrl = [...browserEvents]
    .reverse()
    .find((event) => typeof event.url === 'string' && event.url)?.url;

  const expired = Boolean(session?.expiresAt && session.expiresAt <= Date.now());
  const liveURL = session && !expired ? session.liveURL : undefined;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            liveURL ? 'bg-success' : task?.status === 'running' ? 'bg-warning' : 'bg-muted-foreground/40',
          )}
        />
        <div className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          {lastUrl || (liveURL ? 'Sessão Browserless ativa' : 'Nenhuma página confirmada')}
        </div>
        {liveURL && (
          <a href={liveURL} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px]">
              <ExternalLink className="h-3 w-3" /> Abrir controle ao vivo
            </Button>
          </a>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-black/95">
          {liveURL ? (
            <iframe
              src={liveURL}
              title="OmniNinja Browserless Live Session"
              className="h-full w-full border-0 bg-white"
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          ) : screenshot ? (
            <div className="flex h-full items-center justify-center bg-black">
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt="Screenshot real do navegador"
                className="max-h-full max-w-full object-contain"
              />
              <Badge className="absolute bottom-3 left-3" variant="secondary">
                Screenshot real
              </Badge>
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title={expired ? 'Sessão do navegador expirada' : 'Nenhuma sessão de navegador ativa'}
              description={
                task?.status === 'running'
                  ? 'O painel ficará disponível quando o Agent abrir o Browserless.'
                  : 'Nenhum Browserless LiveURL ou screenshot foi confirmado para esta tarefa.'
              }
            />
          )}
        </div>

        <div className="hidden w-64 shrink-0 border-l border-border bg-card md:flex md:flex-col">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Ações confirmadas ({browserEvents.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {browserEvents.length === 0 ? (
              <p className="p-3 text-[11px] text-muted-foreground">Nenhuma ação de navegador registrada.</p>
            ) : (
              browserEvents.map((event, index) => (
                <div key={`${event.ts}-${index}`} className="border-b border-border/60 p-3 text-[11px]">
                  <div className="font-medium">{event.action.replace(/_/g, ' ')}</div>
                  {event.url && <div className="mt-1 truncate text-muted-foreground">{event.url}</div>}
                  {event.detail && <div className="mt-1 text-muted-foreground">{event.detail}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalView() {
  const task = useOmni((state) => state.currentTask);
  const outputs = useMemo(
    () =>
      (task?.events ?? []).filter(
        (event) => event.type === 'TERMINAL_OUTPUT',
      ) as Extract<AgentEvent, { type: 'TERMINAL_OUTPUT' }>[],
    [task?.events],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#09090b] p-3 font-mono text-xs">
      {outputs.length === 0 ? (
        <EmptyState
          icon={TerminalIcon}
          title="Nenhum comando executado"
          description="Comandos aparecerão aqui somente depois que o sandbox real retornar uma execução."
          dark
        />
      ) : (
        <div className="space-y-4">
          {outputs.map((output, index) => (
            <div key={`${output.ts}-${index}`} className="space-y-1">
              <div className="text-success">$ {output.cmd}</div>
              {output.stdout && <pre className="whitespace-pre-wrap text-zinc-300">{output.stdout}</pre>}
              {output.stderr && <pre className="whitespace-pre-wrap text-red-400">{output.stderr}</pre>}
              <div className={output.exitCode === 0 ? 'text-zinc-500' : 'text-red-400'}>
                exit {output.exitCode}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeView() {
  const task = useOmni((state) => state.currentTask);
  const [selected, setSelected] = useState(0);

  const fileEvents = useMemo(
    () =>
      (task?.events ?? []).filter(
        (event) => event.type === 'FILE_CHANGED',
      ) as Extract<AgentEvent, { type: 'FILE_CHANGED' }>[],
    [task?.events],
  );

  const plan = (task?.events ?? []).find(
    (event) => event.type === 'PLAN_CREATED',
  ) as Extract<AgentEvent, { type: 'PLAN_CREATED' }> | undefined;

  const currentFile = fileEvents[selected];

  return (
    <div className="flex h-full bg-[#09090b]">
      <div className="hidden w-56 shrink-0 border-r border-border bg-sidebar/50 sm:block">
        <div className="border-b border-border px-3 py-2 text-[10px] uppercase text-muted-foreground">
          Arquivos confirmados
        </div>
        <div className="p-2">
          {fileEvents.length === 0 ? (
            <p className="p-2 text-[11px] text-muted-foreground">Nenhum arquivo alterado ainda.</p>
          ) : (
            fileEvents.map((file, index) => (
              <button
                key={`${file.ts}-${index}`}
                onClick={() => setSelected(index)}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]',
                  selected === index ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <FileText className="h-3 w-3" />
                <span className="truncate">{file.path.split('/').pop()}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-3 font-mono text-xs">
        {plan && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3 font-sans">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Folder className="h-3.5 w-3.5 text-brand" /> Plano recebido do Agent
            </div>
            <div className="space-y-1.5">
              {plan.steps.map((step, index) => {
                const completed = (task?.events ?? []).some(
                  (event) => event.type === 'STEP_COMPLETED' && event.stepId === step.id,
                );
                return (
                  <div key={step.id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border">
                      {completed ? <Check className="h-2.5 w-2.5 text-success" /> : index + 1}
                    </span>
                    <span>{step.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentFile ? (
          <div>
            <div className="mb-2 text-[11px] text-muted-foreground">{currentFile.path}</div>
            {currentFile.diff ? (
              <pre className="whitespace-pre-wrap break-words text-zinc-300">{currentFile.diff}</pre>
            ) : (
              <p className="font-sans text-xs text-muted-foreground">
                O backend confirmou a alteração deste arquivo, mas não enviou um diff.
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Code2}
            title="Nenhuma alteração de código confirmada"
            description="Esta aba não cria arquivos fictícios. Alterações aparecerão quando o Agent emitir FILE_CHANGED."
            dark
          />
        )}
      </div>
    </div>
  );
}

function PreviewView() {
  const task = useOmni((state) => state.currentTask);
  const artifacts = task?.artifacts ?? [];
  const siteArtifact = artifacts.find(
    (artifact) => artifact.kind === 'site' && /^https?:\/\//i.test(artifact.path),
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {siteArtifact ? (
        <>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
            <Eye className="h-3.5 w-3.5" /> Preview confirmado
            <a
              href={siteArtifact.path}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-brand hover:underline"
            >
              Abrir <ExternalLink className="inline h-3 w-3" />
            </a>
          </div>
          <iframe src={siteArtifact.path} title="Preview real" className="min-h-0 flex-1 border-0 bg-white" />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyState
            icon={Eye}
            title="Nenhum preview publicado confirmado"
            description="O OmniNinja só mostra preview quando o backend retorna uma URL real de artefato do tipo site."
          />
          {artifacts.length > 0 && (
            <div className="border-t border-border p-3">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground">Artefatos confirmados</div>
              <div className="space-y-2">
                {artifacts.map((artifact) => (
                  <div key={`${artifact.name}-${artifact.path}`} className="rounded border border-border p-2 text-xs">
                    <div className="font-medium">{artifact.name}</div>
                    <div className="mt-1 break-all text-[10px] text-muted-foreground">{artifact.path}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReplayBar() {
  const task = useOmni((state) => state.currentTask);
  const live = useOmni((state) => state.live);
  const setLive = useOmni((state) => state.setLive);
  const replayIndex = useOmni((state) => state.replayIndex);
  const setReplayIndex = useOmni((state) => state.setReplayIndex);
  const events = task?.events ?? [];

  const total = Math.max(events.length - 1, 0);
  const index = replayIndex ?? total;

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background/70 px-3 py-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        disabled={index <= 0}
        onClick={() => {
          setLive(false);
          setReplayIndex(Math.max(0, index - 1));
        }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        disabled={index >= total}
        onClick={() => {
          setLive(false);
          setReplayIndex(Math.min(total, index + 1));
        }}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
      <div className="text-[10px] text-muted-foreground">
        {events.length === 0 ? 'Sem eventos' : `${index + 1}/${events.length}`}
      </div>
      <button
        onClick={() => {
          setLive(true);
          setReplayIndex(null);
        }}
        className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <Radio className={cn('h-3 w-3', live && 'text-success')} />
        {live ? 'Live' : 'Voltar ao live'}
      </button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  dark = false,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className={cn('flex h-full min-h-48 items-center justify-center p-6', dark && 'bg-[#09090b]')}>
      <div className="max-w-sm text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <div className="mt-3 text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ProgressWidget() {
  const task = useOmni((state) => state.currentTask);
  const computerOpen = useOmni((state) => state.computerOpen);
  const setComputerOpen = useOmni((state) => state.setComputerOpen);

  if (!task || computerOpen) return null;

  const plan = task.events.find(
    (event) => event.type === 'PLAN_CREATED',
  ) as Extract<AgentEvent, { type: 'PLAN_CREATED' }> | undefined;
  const totalSteps = plan?.steps.length ?? 0;
  const percent = totalSteps > 0
    ? Math.min(100, Math.round((task.stepsDone / totalSteps) * 100))
    : 0;

  return (
    <button
      onClick={() => setComputerOpen(true)}
      className="fixed bottom-24 right-4 z-40 w-72 rounded-xl border border-border bg-card p-3 text-left shadow-xl"
    >
      <div className="flex items-center gap-2">
        {task.status === 'running' ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
        ) : task.status === 'completed' ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-warning" />
        )}
        <span className="text-xs font-medium">
          {task.status === 'running'
            ? 'OmniNinja executando'
            : task.status === 'completed'
              ? 'Tarefa concluída'
              : `Tarefa: ${task.status}`}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {task.stepsDone}/{totalSteps || '—'}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent">
        <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 truncate text-[10px] text-muted-foreground">{task.goal}</p>
    </button>
  );
}
