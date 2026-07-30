'use client';

import { create } from 'zustand';
import type { AgentEvent, PlanStep, Artifact } from '@/lib/orchestrator';

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
  currentScreenshot?: string; // base64 PNG from real browser
}

interface OmniState {
  // navigation
  view: View;
  setView: (v: View) => void;

  // user (mirrors server demo user)
  user: { name: string; email: string; tier: string; credits: number; bonusCredits: number } | null;
  setUser: (u: OmniState['user']) => void;

  // chat
  messages: ChatMessage[];
  pushMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  // model + mode
  model: ProviderId;
  setModel: (m: ProviderId) => void;
  mode: AgentMode;
  setMode: (m: AgentMode) => void;

  // configured providers (client mirror)
  configuredProviders: ProviderId[];
  setConfiguredProviders: (p: ProviderId[]) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;

  // task run
  currentTask: TaskRun | null;
  setCurrentTask: (t: TaskRun | null) => void;
  appendEvent: (e: AgentEvent) => void;
  updateTaskStatus: (s: TaskRun['status']) => void;
  incStepsDone: () => void;
  setScreenshot: (s: string | undefined) => void;

  // computer panel
  computerOpen: boolean;
  setComputerOpen: (v: boolean) => void;
  computerTab: ComputerTab;
  setComputerTab: (t: ComputerTab) => void;
  computerFullscreen: boolean;
  toggleComputerFullscreen: () => void;

  // replay
  replayIndex: number | null;
  setReplayIndex: (i: number | null) => void;
  live: boolean;
  setLive: (v: boolean) => void;

  // sidebar (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
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

  model: 'glm',
  setModel: (m) => set({ model: m }),
  mode: 'agent',
  setMode: (m) => set({ mode: m }),

  configuredProviders: ['glm', 'claude', 'chatgpt', 'gemini', 'kimi'],
  setConfiguredProviders: (p) => set({ configuredProviders: p }),
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: v }),

  currentTask: null,
  setCurrentTask: (t) => set({ currentTask: t }),
  appendEvent: (e) =>
    set((s) => {
      if (!s.currentTask) return s;
      const events = [...s.currentTask.events, e];
      let stepsDone = s.currentTask.stepsDone;
      if (e.type === 'STEP_COMPLETED') stepsDone += 1;
      let status = s.currentTask.status;
      let finishedAt = s.currentTask.finishedAt;
      let summary = s.currentTask.summary;
      let artifacts = s.currentTask.artifacts;
      if (e.type === 'TASK_COMPLETED') {
        status = 'completed';
        finishedAt = e.ts;
        summary = e.summary;
        artifacts = e.artifacts;
      } else if (e.type === 'TASK_FAILED') {
        status = 'failed';
        finishedAt = e.ts;
      } else if (e.type === 'STEP_STARTED' || e.type === 'PLAN_CREATED') {
        status = 'running';
      }
      return { currentTask: { ...s.currentTask, events, stepsDone, status, finishedAt, summary, artifacts } };
    }),
  updateTaskStatus: (st) =>
    set((s) => (s.currentTask ? { currentTask: { ...s.currentTask, status: st } } : s)),
  incStepsDone: () =>
    set((s) =>
      s.currentTask ? { currentTask: { ...s.currentTask, stepsDone: s.currentTask.stepsDone + 1 } } : s
    ),
  setScreenshot: (sc) =>
    set((s) =>
      s.currentTask ? { currentTask: { ...s.currentTask, currentScreenshot: sc } } : s
    ),

  computerOpen: false,
  setComputerOpen: (v) => set({ computerOpen: v }),
  computerTab: 'browser',
  setComputerTab: (t) => set({ computerTab: t }),
  computerFullscreen: false,
  toggleComputerFullscreen: () => set((s) => ({ computerFullscreen: !s.computerFullscreen })),

  replayIndex: null,
  setReplayIndex: (i) => set({ replayIndex: i }),
  live: true,
  setLive: (v) => set({ live: v }),

  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));
