import { cn } from '@/lib/utils';

export function OmniNinjaLogo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="omni-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#818cf8" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#0d0d0f" stroke="url(#omni-grad)" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="9" stroke="url(#omni-grad)" strokeWidth="2.4" />
      <path
        d="M24 12.5l1.6 4.2 4.4-1.2-1.2 4.4 4.2 1.6-4.2 1.6 1.2 4.4-4.4-1.2-1.6 4.2-1.6-4.2-4.4 1.2 1.2-4.4-4.2-1.6 4.2-1.6-1.2-4.4 4.4 1.2 1.6-4.2z"
        fill="url(#omni-grad)"
        opacity="0.9"
      />
      <circle cx="24" cy="24" r="2.4" fill="#0d0d0f" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <OmniNinjaLogo size={26} />
      <span className="text-[15px]">
        Omni<span className="text-gradient-brand">Ninja</span>
      </span>
    </span>
  );
}

export function ProviderGlyph({ id, size = 16, className }: { id: string; size?: number; className?: string }) {
  const colors: Record<string, string> = {
    claude: '#d97757', chatgpt: '#10a37f', glm: '#38bdf8', deepseek: '#4d6bfe',
    kimi: '#7c3aed', gemini: '#4285f4', grok: '#9ca3af', nemotron: '#76b900',
    minimax: '#ff6b6b', qwen: '#615ced',
  };
  const label: Record<string, string> = {
    claude: 'C', chatgpt: 'G', glm: 'Z', deepseek: 'D', kimi: 'K',
    gemini: 'Ge', grok: 'X', nemotron: 'N', minimax: 'M', qwen: 'Q',
  };
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-md font-mono font-bold text-[10px] leading-none', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: `${colors[id] ?? '#38bdf8'}22`,
        color: colors[id] ?? '#38bdf8',
        border: `1px solid ${colors[id] ?? '#38bdf8'}55`,
      }}
    >
      {label[id] ?? '?'}
    </span>
  );
}
