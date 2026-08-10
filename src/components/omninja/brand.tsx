import { cn } from '@/lib/utils';

export function OmniNinjaLogo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="omni-cyan" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9BE8FF" />
          <stop offset="0.52" stopColor="#39BDF8" />
          <stop offset="1" stopColor="#197FC3" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="20" fill="#081018" stroke="url(#omni-cyan)" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="13.5" stroke="#38BDF8" strokeOpacity=".35" strokeWidth="1" />
      <path d="M15.5 22.5c2.8-4.8 14.2-4.8 17 0v7.2c-2.1 3.2-5.1 4.8-8.5 4.8s-6.4-1.6-8.5-4.8v-7.2Z" fill="url(#omni-cyan)" fillOpacity=".16" stroke="url(#omni-cyan)" strokeWidth="1.5" />
      <path d="M17.7 20.6 14 17.5m16.3 3.1 3.7-3.1" stroke="#72D9FF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20.2" cy="26.5" r="1.8" fill="#9BE8FF" />
      <circle cx="27.8" cy="26.5" r="1.8" fill="#9BE8FF" />
      <path d="M20.5 31c2.2 1.4 4.8 1.4 7 0" stroke="#72D9FF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 tracking-tight', className)}>
      <OmniNinjaLogo size={28} />
      <span className="flex items-baseline gap-1 text-[15px] font-semibold text-white/92">
        <span className="font-serif">omniNinja</span>
        <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-cyan-300/75">AI</span>
      </span>
    </span>
  );
}

export function ProviderGlyph({ id, size = 16, className }: { id: string; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] font-mono text-[9px] font-bold text-cyan-300', className)} style={{ width: size, height: size }}>
      {String(id || 'O').slice(0, 1).toUpperCase()}
    </span>
  );
}
