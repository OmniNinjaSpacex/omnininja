// OmniNinja — Multi-model router (Seção 4)
// Model-agnostic: orchestrates frontier models via OpenRouter (proxy universal)
// + direct provider APIs. Only providers with a configured key appear in the
// selector. Never expose key values to the client.

export type ProviderId =
  | 'claude' | 'chatgpt' | 'kimi' | 'grok' | 'gemini'
  | 'deepseek' | 'glm' | 'nemotron' | 'minimax' | 'qwen';

export type ProviderKind = 'anthropic' | 'openai-compatible' | 'openrouter';

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  shortLabel: string;
  kind: ProviderKind;
  model: string;
  openrouterModel?: string;
  baseURL?: string;
  apiKeyEnv: string;
  openrouterKeyEnv?: string;
  description: string;
  badge?: string;
  accent: string; // tailwind-ish hex for UI chips
}

// 8 providers from Seção 4 + OpenRouter proxies (Seção 13.2).
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  claude: {
    id: 'claude',
    label: 'Claude (Anthropic)',
    shortLabel: 'Claude',
    kind: 'anthropic',
    model: 'claude-sonnet-5',
    openrouterModel: 'anthropic/claude-sonnet-4',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_CLAUDE_API_KEY',
    description: 'Raciocínio profundo, codificação e loops longos.',
    badge: 'Raciocínio',
    accent: '#d97757',
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT (OpenAI)',
    shortLabel: 'GPT',
    kind: 'openai-compatible',
    model: 'gpt-5.3-instant',
    openrouterModel: 'openai/gpt-4o',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_CHATGPT_API_KEY',
    description: 'Velocidade e saídas estruturadas em JSON.',
    badge: 'Velocidade',
    accent: '#10a37f',
  },
  glm: {
    id: 'glm',
    label: 'GLM-5.2 (Zhipu/Z.ai)',
    shortLabel: 'GLM',
    kind: 'openai-compatible',
    model: 'glm-5.2',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'ZHIPU_API_KEY',
    description: 'Modelo nativo MIT, contexto de 1M tokens.',
    badge: '1M ctx',
    accent: '#38bdf8',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek V4',
    shortLabel: 'DeepSeek',
    kind: 'openai-compatible',
    model: 'deepseek-v4-pro',
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    description: '1M de contexto, ótimo custo-benefício.',
    badge: '1M ctx',
    accent: '#4d6bfe',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi K3 (Moonshot)',
    shortLabel: 'Kimi',
    kind: 'openai-compatible',
    model: 'kimi-k3',
    openrouterModel: 'moonshotai/kimi-k2',
    baseURL: 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_KIMI_API_KEY',
    description: '2.8T parâmetros, substitui a série K2.',
    badge: 'Novo',
    accent: '#7c3aed',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini (Google)',
    shortLabel: 'Gemini',
    kind: 'openai-compatible',
    model: 'gemini-3-pro',
    openrouterModel: 'google/gemini-2.5-pro',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GOOGLE_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_GEMINI_API_KEY',
    description: 'Multimodal, visão computacional.',
    badge: 'Multimodal',
    accent: '#4285f4',
  },
  grok: {
    id: 'grok',
    label: 'Grok (xAI)',
    shortLabel: 'Grok',
    kind: 'openai-compatible',
    model: 'grok-2',
    openrouterModel: 'x-ai/grok-2',
    baseURL: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_GROK_API_KEY',
    description: 'Acesso a informações em tempo real.',
    badge: 'Real-time',
    accent: '#6b7280',
  },
  nemotron: {
    id: 'nemotron',
    label: 'Nemotron 550B (NVIDIA)',
    shortLabel: 'Nemotron',
    kind: 'openai-compatible',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NIM_API_KEY',
    description: 'Compatível OpenAI SDK via NIM.',
    badge: '550B',
    accent: '#76b900',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax M3',
    shortLabel: 'MiniMax',
    kind: 'openai-compatible',
    model: 'MiniMax-M3',
    baseURL: 'https://api.minimax.io/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    description: '428B MoE, multimodal, 1M de contexto.',
    badge: 'MoE',
    accent: '#ff6b6b',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen Max (Alibaba)',
    shortLabel: 'Qwen',
    kind: 'openai-compatible',
    model: 'qwen3.7-max',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    description: 'API-only, alta performance.',
    badge: 'Max',
    accent: '#615ced',
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

// Server-only: which providers have a key configured (direct OR openrouter proxy).
export function getConfiguredProviders(): ProviderConfig[] {
  return PROVIDER_LIST.filter((p) => {
    const direct = !!process.env[p.apiKeyEnv];
    const viaOpenRouter = p.openrouterKeyEnv ? !!process.env[p.openrouterKeyEnv] : false;
    return direct || viaOpenRouter;
  });
}

export const ORCHESTRATOR_PROVIDER: ProviderId =
  (process.env.ORCHESTRATOR_PROVIDER as ProviderId) || 'glm';
export const FALLBACK_PROVIDER: ProviderId =
  (process.env.FALLBACK_PROVIDER as ProviderId) || 'glm';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
