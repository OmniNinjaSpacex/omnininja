'use client';

import { create } from 'zustand';
import type { AgentEvent, PlanStep, Artifact } from '@/lib/orchestrator';
export type { AgentEvent } from '@/lib/orchestrator';

export type View = 'landing' | 'workspace';
export type ReasoningEffort = 'low' | 'medium' | 'high';
export type WorkspaceMode = 'chat' | 'work' | 'codex';

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MessageMedia {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  url: string;
  mimeType?: string;
  name?: string;
  status?: string;
  progress?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  streaming?: boolean;
  attachments?: MessageAttachment[];
  media?: MessageMedia[];
  createdAt: number;
}

export interface TaskRun {
  id: string;
  goal: string;
  status: 'queued' | 'planning' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';
  steps: PlanStep[];
  stepsDone: number;
  events: AgentEvent[];
  artifacts: Artifact[];
  summary?: string;
  startedAt: number;
  finishedAt?: number;
}

interface OmniState {
  view: View;
  setView: (v: View) => void;

  user: { name: string; email: string; tier: string; credits: number; bonusCredits: number } | null;
  setUser: (u: OmniState['user']) => void;

  messages: ChatMessage[];
  pushMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  thinkingEnabled: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
  activeProjectId: string | null;
  setActiveProjectId: (projectId: string | null) => void;
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;

  currentTask: TaskRun | null;
  setCurrentTask: (t: TaskRun | null) => void;
  appendEvent: (e: AgentEvent) => void;
  updateTaskStatus: (s: TaskRun['status']) => void;
}

export const useOmni = create<OmniState>((set) => ({
  view: 'landing',
  setView: (view) => set({ view }),

  user: null,
  setUser: (user) => set({ user }),

  messages: [],
  pushMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)),
    })),
  clearMessages: () => set({ messages: [] }),

  reasoningEffort: 'medium',
  setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
  workspaceMode: 'chat',
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  thinkingEnabled: true,
  setThinkingEnabled: (thinkingEnabled) => set({ thinkingEnabled }),
  activeProjectId: null,
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  activeConversationId: null,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),

  currentTask: null,
  setCurrentTask: (currentTask) => set({ currentTask }),
  appendEvent: (event) =>
    set((state) => {
      if (!state.currentTask) return state;

      const events = [...state.currentTask.events, event];
      let stepsDone = state.currentTask.stepsDone;
      let status = state.currentTask.status;
      let finishedAt = state.currentTask.finishedAt;
      let summary = state.currentTask.summary;
      let artifacts = state.currentTask.artifacts;

      if (event.type === 'STEP_COMPLETED') stepsDone += 1;
      if (event.type === 'TASK_COMPLETED') {
        status = 'completed';
        finishedAt = event.ts;
        summary = event.summary;
        artifacts = event.artifacts;
      } else if (event.type === 'TASK_FAILED') {
        status = 'failed';
        finishedAt = event.ts;
      } else if (event.type === 'STEP_STARTED' || event.type === 'PLAN_CREATED') {
        status = 'running';
      }

      return {
        currentTask: {
          ...state.currentTask,
          events,
          stepsDone,
          status,
          finishedAt,
          summary,
          artifacts,
        },
      };
    }),
  updateTaskStatus: (status) =>
    set((state) =>
      state.currentTask ? { currentTask: { ...state.currentTask, status } } : state,
    ),
}));
