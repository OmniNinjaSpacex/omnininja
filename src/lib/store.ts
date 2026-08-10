'use client';

import { create } from 'zustand';
import type { AgentEvent, PlanStep, Artifact } from '@/lib/orchestrator';
export type { AgentEvent } from '@/lib/orchestrator';

export type View = 'landing' | 'workspace';
export type AgentMode = 'chat' | 'agent' | 'agent_max';
export type ComputerTab = 'code' | 'preview' | 'browser' | 'terminal';
export type ProviderId =
  | 'claude' | 'chatgpt' | 'kimi' | 'grok' | 'gemini'
  | 'deepseek' | 'glm' | 'nemotron' | 'minimax' | 'qwen';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  streaming?: boolean;
  createdAt: number;
}

export interface BrowserSessionState {
  liveURL: string;
  browserSessionTicket?: string;
  expiresAt?: number;
}

export interface TaskRun {
  id: string;
  goal: string;
  mode: AgentMode;
  model: ProviderId;
  status: 'queued' | 'planning' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';
  steps: PlanStep[];
  stepsDone: number;
  events: AgentEvent[];
  artifacts: Artifact[];
  summary?: string;
  startedAt: number;
  finishedAt?: number;
  currentScreenshot?: string;
  browserSession?: BrowserSessionState;
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

  model: ProviderId;
  setModel: (m: ProviderId) => void;
  mode: AgentMode;
  setMode: (m: AgentMode) => void;

  configuredProviders: ProviderId[];
  setConfiguredProviders: (p: ProviderId[]) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;

  currentTask: TaskRun | null;
  setCurrentTask: (t: TaskRun | null) => void;
  appendEvent: (e: AgentEvent) => void;
  updateTaskStatus: (s: TaskRun['status']) => void;
  incStepsDone: () => void;
  setScreenshot: (s: string | undefined) => void;
  setBrowserSession: (session: BrowserSessionState | undefined) => void;

  computerOpen: boolean;
  setComputerOpen: (v: boolean) => void;
  computerTab: ComputerTab;
  setComputerTab: (t: ComputerTab) => void;
  computerFullscreen: boolean;
  toggleComputerFullscreen: () => void;

  replayIndex: number | null;
  setReplayIndex: (i: number | null) => void;
  live: boolean;
  setLive: (v: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const useOmni = create<OmniState>((set) => ({
  view: 'landing',
  setView: (v) => set({ view: v }),

  user: null,
  setUser: (u) => set({ user: u }),

  messages: [],
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  clearMessages: () => set({ messages: [] }),

  // OpenAI is the current real backend. Additional providers can be added when
  // their real server integrations are implemented and configured.
  model: 'chatgpt',
  setModel: (m) => set({ model: m }),
  mode: 'agent',
  setMode: (m) => set({ mode: m }),

  configuredProviders: [],
  setConfiguredProviders: (p) => set({ configuredProviders: p }),
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: v }),

  currentTask: null,
  setCurrentTask: (t) => set({ currentTask: t }),
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
      state.currentTask
        ? { currentTask: { ...state.currentTask, status } }
        : state,
    ),
  incStepsDone: () =>
    set((state) =>
      state.currentTask
        ? { currentTask: { ...state.currentTask, stepsDone: state.currentTask.stepsDone + 1 } }
        : state,
    ),
  setScreenshot: (currentScreenshot) =>
    set((state) =>
      state.currentTask
        ? { currentTask: { ...state.currentTask, currentScreenshot } }
        : state,
    ),
  setBrowserSession: (browserSession) =>
    set((state) =>
      state.currentTask
        ? { currentTask: { ...state.currentTask, browserSession } }
        : state,
    ),

  computerOpen: false,
  setComputerOpen: (computerOpen) => set({ computerOpen }),
  computerTab: 'browser',
  setComputerTab: (computerTab) => set({ computerTab }),
  computerFullscreen: false,
  toggleComputerFullscreen: () =>
    set((state) => ({ computerFullscreen: !state.computerFullscreen })),

  replayIndex: null,
  setReplayIndex: (replayIndex) => set({ replayIndex }),
  live: true,
  setLive: (live) => set({ live }),

  sidebarOpen: false,
  setSidebarOpen: (value) =>
    set((state) => ({
      sidebarOpen: typeof value === 'function' ? value(state.sidebarOpen) : value,
    })),
}));
