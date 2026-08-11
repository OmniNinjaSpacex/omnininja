// Shared OMNININJA event contracts.
// Detailed events are server-side implementation data; the public chat receives
// only sanitized progress states from /api/omnininja/respond.

export type AgentEvent =
  | { type: 'TASK_STARTED'; taskId: string; goal: string; ts: number }
  | { type: 'PLAN_CREATED'; taskId: string; steps: PlanStep[]; ts: number }
  | { type: 'STEP_STARTED'; taskId: string; stepId: string; agent: string; instruction: string; ts: number }
  | { type: 'AGENT_THINKING'; taskId: string; agent: string; text: string; ts: number }
  | { type: 'BROWSER_ACTION'; taskId: string; action: string; url?: string; detail?: string; screenshotBase64?: string; ts: number }
  | { type: 'TERMINAL_OUTPUT'; taskId: string; cmd: string; stdout: string; stderr: string; exitCode: number; ts: number }
  | { type: 'FILE_CHANGED'; taskId: string; path: string; diff?: string; ts: number }
  | { type: 'STEP_COMPLETED'; taskId: string; stepId: string; success: boolean; result: string; ts: number }
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
