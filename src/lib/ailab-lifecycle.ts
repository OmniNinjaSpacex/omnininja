// OmniNinja — AI Lab task-container lifecycle policy.
//
// By default, completed/failed task containers are stopped, not deleted. This
// releases CPU/memory while preserving the task filesystem for later artifact
// handling or debugging. Operators may choose `delete` or `keep` explicitly.

import {
  ailabConfigured,
  ailabContainerName,
  cleanupAilabContainer,
} from './ailab-sandbox';

export type AilabFinalizePolicy = 'stop' | 'delete' | 'keep';

export function getAilabFinalizePolicy(): AilabFinalizePolicy {
  const value = (process.env.OMNININJA_AILAB_FINALIZE || 'stop').trim().toLowerCase();
  if (value === 'delete') return 'delete';
  if (value === 'keep') return 'keep';
  return 'stop';
}

function baseUrl(): string {
  return (process.env.AILAB_BASE_URL || '').trim().replace(/\/$/, '');
}

function apiToken(): string {
  return (process.env.AILAB_API_TOKEN || '').trim();
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text);
    return payload?.detail || payload?.error || text;
  } catch {
    return text.slice(0, 1000);
  }
}

async function stopAilabContainer(taskId: string): Promise<void> {
  if (!ailabConfigured()) return;

  const response = await fetch(
    `${baseUrl()}/api/containers/${encodeURIComponent(ailabContainerName(taskId))}/stop`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    },
  );

  // A task that never used shell/files may not have created a container.
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`AI Lab stop: ${await readError(response)}`);
  }
}

export async function finalizeAilabTask(taskId: string): Promise<AilabFinalizePolicy> {
  const policy = getAilabFinalizePolicy();
  if (!ailabConfigured() || policy === 'keep') return policy;

  if (policy === 'delete') {
    await cleanupAilabContainer(taskId);
    return policy;
  }

  await stopAilabContainer(taskId);
  return policy;
}
