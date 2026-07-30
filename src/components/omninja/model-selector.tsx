'use client';

import { useState } from 'react';
import { Check, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useOmni, type ProviderId } from '@/lib/store';
import { PROVIDERS } from '@/lib/providers';
import { ProviderGlyph } from './brand';
import { cn } from '@/lib/utils';

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const model = useOmni((s) => s.model);
  const setModel = useOmni((s) => s.setModel);
  const configured = useOmni((s) => s.configuredProviders);

  const current = PROVIDERS[model];
  const available = (Object.values(PROVIDERS) as typeof PROVIDERS[ProviderId][]).filter((p) =>
    configured.includes(p.id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 border-border bg-card">
          <ProviderGlyph id={model} size={18} />
          <span className="text-xs font-medium">{current.shortLabel}</span>
          {current.badge && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">{current.badge}</Badge>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-border bg-popover p-1" align="start">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Modelos configurados ({available.length})
        </div>
        <div className="max-h-72 overflow-y-auto omni-scroll">
          {available.map((p) => (
            <button
              key={p.id}
              onClick={() => { setModel(p.id); setOpen(false); }}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                p.id === model && 'bg-accent/60'
              )}
            >
              <ProviderGlyph id={p.id} size={22} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{p.label}</span>
                  {p.badge && (
                    <Badge variant="outline" className="h-3.5 px-1 text-[9px]">{p.badge}</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.description}</p>
              </div>
              {p.id === model && <Check className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-brand" />}
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-border px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3 text-brand" />
            Apenas provedores com chave configurada aparecem aqui.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
