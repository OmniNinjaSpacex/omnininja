// OmniNinja — Integration status (Seção 4.5 / Seção 13)
// Reports ONLY configured/absent per service. Never the key value, never
// simulated data for an absent provider.

import { PROVIDER_LIST, type ProviderConfig } from './providers';

export type IntegrationCategory = 'llm' | 'browser' | 'search' | 'infra' | 'auth' | 'billing';

export interface IntegrationStatus {
  key: string;
  label: string;
  category: IntegrationCategory;
  configured: boolean;
}

const LLM_KEYS = PROVIDER_LIST.map((p: ProviderConfig) => ({
  key: p.apiKeyEnv,
  label: p.label,
  openrouterKey: p.openrouterKeyEnv,
}));

const EXTRA: { key: string; label: string; category: IntegrationCategory; env: string[] }[] = [
  { key: 'CHROMIUM', label: 'Chromium local (navegação real)', category: 'browser', env: ['PLAYWRIGHT_CHROMIUM_EXECUTABLE', 'PLAYWRIGHT_BROWSERS_PATH'] },
  { key: 'EXA', label: 'Exa AI (busca web)', category: 'search', env: ['EXA_API_KEY'] },
  { key: 'REDIS', label: 'Redis (cache / fila)', category: 'infra', env: ['REDIS_URL'] },
  { key: 'S3', label: 'S3 / R2 (artefatos)', category: 'infra', env: ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] },
  { key: 'DATABASE', label: 'PostgreSQL / SQLite', category: 'infra', env: ['DATABASE_URL'] },
  { key: 'GOOGLE_OAUTH', label: 'Google OAuth', category: 'auth', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { key: 'GITHUB_OAUTH', label: 'GitHub OAuth', category: 'auth', env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'] },
  { key: 'STRIPE', label: 'Stripe (billing)', category: 'billing', env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
];

export function getIntegrationStatuses(): IntegrationStatus[] {
  const out: IntegrationStatus[] = [];

  for (const p of LLM_KEYS) {
    const direct = !!process.env[p.key];
    const viaOpenRouter = p.openrouterKey ? !!process.env[p.openrouterKey] : false;
    out.push({
      key: p.key,
      label: p.label,
      category: 'llm',
      configured: direct || viaOpenRouter,
    });
  }

  for (const e of EXTRA) {
    out.push({
      key: e.key,
      label: e.label,
      category: e.category,
      configured: e.env.every((v) => !!process.env[v]),
    });
  }

  return out;
}

export function countConfigured(): { total: number; configured: number } {
  const list = getIntegrationStatuses();
  return {
    total: list.length,
    configured: list.filter((i) => i.configured).length,
  };
}
