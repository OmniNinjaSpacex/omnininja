// OmniNinja — Orchestrator + Event Stream (Seção 3 / Seção 9)
// In production this delegates to real sub-agents running in isolated Docker
// sandboxes (Browser/Code/Research/Memory/Chat). In the preview environment
// we generate a believable, scripted event timeline so the "Computer" panel
// demonstrates total transparency (Seção 9.6 / Seção 16) end-to-end.

export type AgentEvent =
  | { type: 'TASK_STARTED'; taskId: string; goal: string; ts: number }
  | { type: 'PLAN_CREATED'; taskId: string; steps: PlanStep[]; ts: number }
  | { type: 'STEP_STARTED'; taskId: string; stepId: string; agent: string; instruction: string; ts: number }
  | { type: 'AGENT_THINKING'; taskId: string; agent: string; text: string; ts: number }
  | { type: 'BROWSER_ACTION'; taskId: string; action: string; url?: string; detail?: string; screenshotBase64?: string; ts: number }
  | { type: 'TERMINAL_OUTPUT'; taskId: string; cmd: string; stdout: string; stderr: string; exitCode: number; ts: number }
  | { type: 'FILE_CHANGED'; taskId: string; path: string; diff?: string; ts: number }
  | { type: 'STEP_COMPLETED'; taskId: string; stepId: string; success: boolean; result: string; ts: number }
  | { type: 'MODEL_FALLBACK'; taskId: string; from: string; to: string; reason: string; ts: number }
  | { type: 'TASK_COMPLETED'; taskId: string; summary: string; artifacts: Artifact[]; ts: number }
  | { type: 'TASK_FAILED'; taskId: string; error: string; ts: number };

export interface PlanStep {
  id: string;
  title: string;
  agent: 'Browser' | 'Code' | 'Research' | 'Memory' | 'Chat';
  instruction: string;
}

export interface Artifact {
  name: string;
  kind: 'file' | 'site' | 'image' | 'report' | 'archive';
  path: string;
  sizeBytes: number;
}

const AGENTS = ['Browser', 'Code', 'Research', 'Memory', 'Chat'] as const;

// Classify a user message: simple question vs real task (Seção 11.5 / Seção 16).
export function classifyMessage(text: string): 'chat' | 'task' {
  const t = text.trim().toLowerCase();
  if (!t) return 'chat';
  const taskSignals = [
    'crie', 'create', 'build', 'faça', 'gere', 'generate', 'pesquise', 'research',
    'site', 'website', 'app', 'aplicativo', 'planilha', 'spreadsheet', 'relatório',
    'report', 'deploy', 'publique', 'scrape', 'baixe', 'analyze', 'analise',
    'automatize', 'automate', 'configure', 'instale',
  ];
  const wordCount = t.split(/\s+/).length;
  if (wordCount <= 6 && !taskSignals.some((s) => t.includes(s))) return 'chat';
  if (taskSignals.some((s) => t.includes(s))) return 'task';
  return wordCount > 14 ? 'task' : 'chat';
}

function planFor(goal: string): PlanStep[] {
  const g = goal.toLowerCase();
  if (g.includes('site') || g.includes('website') || g.includes('landing') || g.includes('página')) {
    return [
      { id: 's1', title: 'Pesquisar referências de design', agent: 'Research', instruction: 'Buscar landing pages SaaS modernas e extrair padrões.' },
      { id: 's2', title: 'Definir estrutura do site', agent: 'Code', instruction: 'Scaffold Next.js + Tailwind com seções hero/features/preços.' },
      { id: 's3', title: 'Implementar hero e seções', agent: 'Code', instruction: 'Escrever componentes React responsivos com dark mode.' },
      { id: 's4', title: 'Validar layout no navegador', agent: 'Browser', instruction: 'Abrir preview, screenshot, checar responsividade.' },
      { id: 's5', title: 'Salvar artefatos e resumir', agent: 'Memory', instruction: 'Empacotar projeto e gerar resumo final.' },
    ];
  }
  if (g.includes('pesquis') || g.includes('research') || g.includes('mercado') || g.includes('compar')) {
    return [
      { id: 's1', title: 'Decompor objetivo de pesquisa', agent: 'Research', instruction: 'Listar sub-perguntas e fontes relevantes.' },
      { id: 's2', title: 'Buscar fontes na web', agent: 'Browser', instruction: 'Navegar em fontes权威, coletar dados.' },
      { id: 's3', title: 'Extrair e cruzar dados', agent: 'Code', instruction: 'Parsear páginas, normalizar números.' },
      { id: 's4', title: 'Sintetizar relatório', agent: 'Chat', instruction: 'Redigir relatório estruturado com citações.' },
      { id: 's5', title: 'Salvar relatório final', agent: 'Memory', instruction: 'Exportar Markdown + JSON.' },
    ];
  }
  // generic plan
  return [
    { id: 's1', title: 'Entender o pedido', agent: 'Chat', instruction: 'Reformular objetivo e confirmar escopo.' },
    { id: 's2', title: 'Planejar execução', agent: 'Code', instruction: 'Decompor em passos executáveis.' },
    { id: 's3', title: 'Executar passos principais', agent: 'Code', instruction: 'Rodar comandos e produzir artefatos.' },
    { id: 's4', title: 'Validar resultado', agent: 'Browser', instruction: 'Verificar output no navegador.' },
    { id: 's5', title: 'Entregar e resumir', agent: 'Memory', instruction: 'Salvar artefatos e resumir.' },
  ];
}

const THINKS = [
  'Analisando o objetivo e decompondo em subtarefas…',
  'Selecionando a ferramenta mais eficiente para este passo…',
  'Aguardando o resultado da execução no sandbox…',
  'Verificando se a ação produziu o efeito esperado…',
  'Compactando contexto para caber no orçamento de tokens…',
  'Decidindo o próximo passo com base no resultado…',
];

const CMDS = [
  { cmd: 'ls -la /workspace', stdout: 'total 48\ndrwxr-xr-x  5 sandboxuser sandboxuser 4096 .\n-rw-r--r--  1 sandboxuser sandboxuser  220 package.json\ndrwxr-xr-x  3 sandboxuser sandboxuser 4096 src', stderr: '', exitCode: 0 },
  { cmd: 'pnpm install', stdout: 'Lockfile is up to date, resolution step is skipped\nPackages: +342\n++++++++++++++++++++++++++++++++++++++++++++++++++\nDone in 4.21s', stderr: '', exitCode: 0 },
  { cmd: 'pnpm dev', stdout: '  ▲ Next.js 16.1.1\n  - Local:   http://localhost:3000\n  ✓ Ready in 648ms', stderr: '', exitCode: 0 },
  { cmd: 'python3 -c "import pandas; print(pandas.__version__)"', stdout: '2.2.2', stderr: '', exitCode: 0 },
  { cmd: 'git init && git add -A && git commit -m "init"', stdout: 'Initialized empty Git repository\n[main (root-commit) abc1234] init\n 18 files changed, 1204 insertions(+)', stderr: '', exitCode: 0 },
];

const URLS = [
  'https://news.ycombinator.com',
  'https://github.com/trending',
  'https://manus.im',
  'https://ninja.ai',
  'https://tailwindcss.com/docs',
];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

// Build a deterministic-but-varied event timeline for a goal.
export function buildEventTimeline(taskId: string, goal: string): AgentEvent[] {
  const steps = planFor(goal);
  const events: AgentEvent[] = [];
  let t = Date.now();

  events.push({ type: 'TASK_STARTED', taskId, goal, ts: t });
  t += 600;
  events.push({ type: 'PLAN_CREATED', taskId, steps, ts: t });
  t += 800;

  steps.forEach((step, idx) => {
    events.push({ type: 'STEP_STARTED', taskId, stepId: step.id, agent: step.agent, instruction: step.instruction, ts: t });
    t += 500;
    events.push({ type: 'AGENT_THINKING', taskId, agent: step.agent, text: pick(THINKS, idx), ts: t });
    t += 700;

    if (step.agent === 'Browser') {
      const url = pick(URLS, idx);
      events.push({ type: 'BROWSER_ACTION', taskId, action: 'navigate', url, detail: `Navegando para ${url}`, ts: t });
      t += 900;
      events.push({ type: 'BROWSER_ACTION', taskId, action: 'screenshot', detail: 'Screenshot capturado (1920×1080)', ts: t });
      t += 600;
      events.push({ type: 'BROWSER_ACTION', taskId, action: 'scroll_down', detail: 'Rolando página para inspecionar conteúdo', ts: t });
      t += 500;
    } else if (step.agent === 'Code') {
      const c = pick(CMDS, idx);
      events.push({ type: 'TERMINAL_OUTPUT', taskId, cmd: c.cmd, stdout: c.stdout, stderr: c.stderr, exitCode: c.exitCode, ts: t });
      t += 700;
      const filePath = `/workspace/src/components/Section${idx + 1}.tsx`;
      events.push({
        type: 'FILE_CHANGED',
        taskId,
        path: filePath,
        diff: `@@\n+export function Section${idx + 1}() {\n+  return <section className="py-20">…</section>;\n+}`,
        ts: t,
      });
      t += 500;
    } else if (step.agent === 'Research') {
      events.push({ type: 'BROWSER_ACTION', taskId, action: 'navigate', url: pick(URLS, idx + 2), detail: 'Coletando fontes', ts: t });
      t += 800;
    }

    events.push({
      type: 'STEP_COMPLETED',
      taskId,
      stepId: step.id,
      success: true,
      result: `${step.title} concluído com sucesso.`,
      ts: t,
    });
    t += 600;
  });

  const artifacts: Artifact[] = [
    { name: 'project.zip', kind: 'archive', path: '/workspace/project.zip', sizeBytes: 184320 },
    { name: 'README.md', kind: 'file', path: '/workspace/README.md', sizeBytes: 4096 },
    { name: 'preview.png', kind: 'image', path: '/workspace/preview.png', sizeBytes: 81920 },
  ];

  events.push({
    type: 'TASK_COMPLETED',
    taskId,
    summary: `Tarefa concluída: ${goal}. ${steps.length} passos executados por ${AGENTS.length} sub-agentes. 3 artefatos gerados.`,
    artifacts,
    ts: t,
  });

  return events;
}
