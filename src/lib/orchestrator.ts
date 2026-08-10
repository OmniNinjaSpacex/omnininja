// OmniNinja — shared Agent event contracts.
// This module contains types and lightweight classification only. It does NOT
// generate scripted/simulated execution timelines. Real Agent events must come
// from the server-side OpenAI tool loop and its confirmed tool results.

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

/**
 * Lightweight client/server hint only. The selected UI mode still determines
 * whether a real Agent run happens; this function never executes tools.
 */
export function classifyMessage(text: string): 'chat' | 'task' {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return 'chat';

  const taskSignals = [
    'crie', 'create', 'build', 'faça', 'gere', 'generate', 'pesquise', 'research',
    'site', 'website', 'app', 'aplicativo', 'planilha', 'spreadsheet', 'relatório',
    'report', 'deploy', 'publique', 'scrape', 'baixe', 'analyze', 'analise',
    'automatize', 'automate', 'configure', 'instale',
  ];

  const wordCount = normalized.split(/\s+/).length;
  if (taskSignals.some((signal) => normalized.includes(signal))) return 'task';
  return wordCount > 14 ? 'task' : 'chat';
}

/**
 * Compatibility export for any legacy caller that still imports the old demo
 * timeline builder. Failing loudly is intentional: production must never
 * substitute scripted events for a failed/missing Agent backend.
 */
export function buildEventTimeline(): never {
  throw new Error('Simulated Agent timelines are disabled. Use /api/agent/run for real execution.');
}
