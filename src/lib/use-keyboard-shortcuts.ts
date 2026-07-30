'use client';

import { useEffect } from 'react';
import { useOmni } from '@/lib/store';
import { toast } from 'sonner';

/**
 * OmniNinja keyboard shortcuts (power-user + a11y).
 * - ⌘/Ctrl + K  → Nova tarefa (clears chat + closes computer)
 * - ⌘/Ctrl + B  → Toggle sidebar (mobile drawer)
 * - ⌘/Ctrl + .  → Toggle Computer panel (when a task exists)
 * - ⌘/Ctrl + Enter → Focus chat input
 * - 1/2/3       → Switch mode (Chat / Agent / Agent MAX) — only when not typing
 * - Escape      → Close computer panel or any open sheet
 * - ?           → Show shortcuts help (when not typing)
 */
export function useKeyboardShortcuts(opts: {
  onNewTask: () => void;
  onToggleSidebar: () => void;
  onOpenShortcuts?: () => void;
}) {
  const { onNewTask, onToggleSidebar, onOpenShortcuts } = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // ⌘/Ctrl + K is handled by the CommandPalette in workspace.tsx (opens palette)
      // ⌘/Ctrl + N — new task (alternative)
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewTask();
        toast.success('Nova conversa', { description: '⌘N' });
        return;
      }

      // ⌘/Ctrl + B — toggle sidebar
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onToggleSidebar();
        return;
      }

      // ⌘/Ctrl + . — toggle computer panel
      if (mod && e.key === '.') {
        e.preventDefault();
        const s = useOmni.getState();
        if (s.currentTask) {
          s.setComputerOpen(!s.computerOpen);
        }
        return;
      }

      // ⌘/Ctrl + Enter — focus chat input
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Pergunte"], textarea[placeholder*="Descreva"]');
        ta?.focus();
        return;
      }

      if (typing) return;

      // 1/2/3 — mode switch
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const modes = ['chat', 'agent', 'agent_max'] as const;
        const m = modes[+e.key - 1];
        useOmni.getState().setMode(m);
        toast.info(`Modo: ${m === 'agent_max' ? 'Agent MAX' : m.charAt(0).toUpperCase() + m.slice(1)}`, { duration: 1200 });
        return;
      }

      // ? — shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        if (onOpenShortcuts) onOpenShortcuts();
        else toast.info('Atalhos', { description: '⌘K nova · ⌘B sidebar · ⌘. computador · 1/2/3 modo · Esc fechar' });
        return;
      }

      // Escape — close computer panel
      if (e.key === 'Escape') {
        const s = useOmni.getState();
        if (s.computerOpen) {
          s.setComputerOpen(false);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewTask, onToggleSidebar, onOpenShortcuts]);
}
