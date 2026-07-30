'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight, Bot, Code2, Globe, MousePointerClick, Play, Repeat,
  Terminal as TerminalIcon, Sparkles, Check, Zap, ShieldCheck, Layers,
  CalendarClock, PanelRightOpen, Star, ChevronDown, Menu, X, Wand2,
  Cpu, FileSearch, Rocket, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wordmark, OmniNinjaLogo } from './brand';
import { useOmni } from '@/lib/store';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Recursos', href: '#features' },
  { label: 'Modos', href: '#modes' },
  { label: 'Preços', href: '#pricing' },
  { label: 'Demonstração', href: '#demo' },
  { label: 'FAQ', href: '#faq' },
];

const MODES = [
  {
    key: 'chat', name: 'Chat', icon: Sparkles, accent: '#38bdf8',
    desc: 'Resposta direta do modelo, sem abrir sandbox. Para perguntas rápidas e conversa.',
    bullets: ['Sem consumo de ferramentas', 'Resposta instantânea', 'Ideal para dúvidas factuais'],
  },
  {
    key: 'agent', name: 'Agent', icon: Bot, accent: '#818cf8',
    desc: 'Orquestrador + 1 sub-agente por vez. Executa tarefas reais com sandbox.',
    bullets: ['Planeja e executa passo a passo', 'Sandbox isolado por sessão', 'Transparência total'],
  },
  {
    key: 'agent_max', name: 'Agent MAX', icon: Layers, accent: '#a855f7',
    desc: 'Orquestrador delega a múltiplos sub-agentes em paralelo. Pesquisa profunda.',
    bullets: ['100+ agentes em paralelo', 'Pesquisa ampla e profunda', 'Sem poluição de contexto'],
  },
];

const FEATURES = [
  { icon: Globe, title: 'Navegador real', desc: 'Chromium com automação completa: navegar, clicar, digitar, scroll, screenshot. Mouse virtual humanizado.' },
  { icon: TerminalIcon, title: 'Terminal real', desc: 'bash, python, node, git, pip, pnpm — tudo rodando num sandbox isolado por sessão.' },
  { icon: Code2, title: 'Editor de código', desc: 'Monaco embutido com diffs visíveis. Você vê cada arquivo que o agente cria ou edita.' },
  { icon: Repeat, title: 'Multi-modelo', desc: 'Claude, GPT, GLM-5.2, Gemini, Kimi K3, DeepSeek, Nemotron, MiniMax, Qwen. Troque no seletor.' },
  { icon: Play, title: 'Replay de sessões', desc: 'Cada ação é gravada no Event Stream. Reviva qualquer tarefa com scrubber tipo player de vídeo.' },
  { icon: CalendarClock, title: 'Agendamento', desc: 'Programe tarefas recorrentes. Até 20 tarefas simultâneas no plano Business.' },
  { icon: ShieldCheck, title: 'Sandbox isolado', desc: 'Container efêmero por sessão/usuário. Nunca compartilhado. Destruído após o fim.' },
  { icon: MousePointerClick, title: 'Transparência total', desc: 'Nada de caixa-preta. Você vê cada pensamento, comando, clique e screenshot do agente.' },
  { icon: PanelRightOpen, title: 'Painel Computador', desc: 'Dentro do chat — nunca em aba separada. Minimizado ou tela cheia, sem perder a conversa.' },
];

const PRICING = [
  {
    name: 'Free', price: 'US$ 0', period: '/sempre', accent: '#6b6b70',
    desc: 'Para experimentar e tarefas leves.',
    credits: '300 créditos/dia + 1.000 bônus', parallel: '1 tarefa simultânea',
    cta: 'Começar grátis', highlight: false,
    features: ['Modos Chat + Agent', '1 modelo padrão', 'Sandbox efêmero', 'Replay de sessões'],
  },
  {
    name: 'Pro', price: 'US$ 20', period: '/mês', accent: '#38bdf8',
    desc: 'Para profissionais e criadores.',
    credits: '4.000 créditos/mês', parallel: '4 tarefas simultâneas',
    cta: 'Assinar Pro', highlight: true,
    features: ['Todos os 10 modelos', 'Agent MAX (paralelo)', '300 créditos/dia de bônus', 'Agendamento de tarefas', 'Suporte por e-mail'],
  },
  {
    name: 'Business', price: 'US$ 50', period: '/mês', accent: '#a855f7',
    desc: 'Para equipes e uso intensivo.',
    credits: '8.000 créditos/mês', parallel: '20 tarefas simultâneas',
    cta: 'Assinar Business', highlight: false,
    features: ['Tudo do Pro', 'Tarefas simultâneas ilimitadas', 'Memória semântica', 'Prioridade na fila', 'Suporte prioritário'],
  },
];

const FAQ = [
  { q: 'O que é o "Computador do OmniNinja"?', a: 'É um painel dentro do chat que mostra o agente trabalhando em tempo real: navegador real, terminal, editor de código e preview. Ele só abre quando a tarefa realmente precisa de ferramentas — nunca para uma pergunta simples.' },
  { q: 'Onde ficam minhas chaves de API?', a: 'Nunca no chat. Você configura as chaves no painel de secrets da plataforma de deploy. O seletor de modelo mostra apenas os provedores com chave configurada — nunca simula um provedor ausente.' },
  { q: 'O que é 1 crédito?', a: '1 crédito é a unidade de consumo interna. Ações de terminal custam ~2 créditos, ações de navegador ~3, passos de agente ~5, pesquisa profunda ~12 por passo. Créditos mensais não acumulam para o mês seguinte.' },
  { q: 'O sandbox é realmente isolado?', a: 'Sim. Cada tarefa roda em um container efêmero isolado por sessão e usuário, nunca compartilhado. Após o fim (ou timeout), o container é destruído. Arquivos relevantes são salvos antes.' },
  { q: 'O navegador é real ou simulado?', a: 'Real. Usamos Chromium via Browserless (conexão CDP). O agente navega, clica, digita e tira screenshots de verdade — e você vê cada ação ao vivo na aba Navegador.' },
  { q: 'Posso trocar de modelo no meio da tarefa?', a: 'Sim. O seletor lista 10 provedores. Se o modelo escolhido falhar, há fallback automático para um provedor reserva, registrado no Event Stream.' },
  { q: 'O plano free tem limite de uso?', a: 'O Free oferece 300 créditos por dia + 1.000 bônus únicos e 1 tarefa simultânea. É suficiente para experimentar todos os modos.' },
];

const LOGOS = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Soylent'];

export function LandingPage() {
  const setView = useOmni((s) => s.setView);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ---- Nav ---- */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" size="sm" onClick={() => setView('workspace')}>Entrar</Button>
            <Button size="sm" onClick={() => setView('workspace')} className="gap-1.5">
              Começar grátis <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-border bg-card">
              <div className="flex flex-col gap-2 pt-6">
                <Wordmark className="mb-4" />
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                    {n.label}
                  </a>
                ))}
                <Button className="mt-4 gap-1.5" onClick={() => { setMobileOpen(false); setView('workspace'); }}>
                  Começar grátis <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute inset-0 bg-radial-glow" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 gap-1.5 border-brand/40 bg-brand/5 text-brand">
              <Sparkles className="h-3 w-3" /> Multi-modelo · Sandbox · Navegador real
            </Badge>
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Sua própria <span className="text-gradient-brand">empresa de IA</span>,
              <br className="hidden sm:block" /> com o agente visível.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              OmniNinja é um agente de IA autônomo que decompõe tarefas, delega a sub-agentes
              especializados e mostra cada passo em tempo real — sandbox, terminal e navegador
              de verdade, dentro do chat.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2 glow-brand" onClick={() => setView('workspace')}>
                Começar Agora — Grátis <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#demo" className="gap-2">
                  <Play className="h-4 w-4" /> Ver demonstração
                </a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Sem cartão · 300 créditos/dia grátis · 10 modelos de IA
            </p>
          </div>

          {/* Hero preview mock */}
          <HeroPreview />
        </div>
      </section>

      {/* ---- Logos marquee ---- */}
      <section className="border-b border-border/60 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Confiado por equipes que constroem com IA
          </p>
          <div className="relative overflow-hidden">
            <div className="flex w-max animate-marquee items-center gap-12">
              {[...LOGOS, ...LOGOS].map((l, i) => (
                <span key={i} className="font-serif text-xl font-medium text-muted-foreground/60">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Modes ---- */}
      <section id="modes" className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="3 modos de execução"
            title="Do quick chat à pesquisa profunda em paralelo"
            subtitle="Escolha o modo conforme a complexidade. O Computador só abre quando a tarefa realmente precisa de ferramentas."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {MODES.map((m) => (
              <div key={m.key}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-brand/40 hover:bg-accent/40">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
                  style={{ background: m.accent }} />
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${m.accent}55`, backgroundColor: `${m.accent}18`, color: m.accent }}>
                    <m.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{m.name}</h3>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{m.desc}</p>
                <ul className="mt-4 space-y-2">
                  {m.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-success" /> <span className="text-foreground/80">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Como funciona"
            title="Da mensagem ao resultado em 4 passos"
            subtitle="Sem caixa-preta. Você vê cada decisão do Orquestrador e cada ação dos sub-agentes."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              { n: '01', icon: MessageSquare, title: 'Você descreve', desc: 'Digite a tarefa em linguagem natural. O classificador decide se é pergunta (Chat) ou tarefa (Agent).', accent: '#38bdf8' },
              { n: '02', icon: Wand2, title: 'Orquestrador planeja', desc: 'Decompõe o objetivo em passos e delega a sub-agentes especializados (Browser, Code, Research).', accent: '#818cf8' },
              { n: '03', icon: Cpu, title: 'Sub-agentes executam', desc: 'Sandbox isolado, terminal real, navegador Chromium. Cada ação aparece no painel Computador ao vivo.', accent: '#a855f7' },
              { n: '04', icon: Rocket, title: 'Entrega o resultado', desc: 'Site publicado, arquivo, relatório. Artefatos ficam disponíveis e a sessão é replayável.', accent: '#22c55e' },
            ].map((step, i) => (
              <div key={step.n} className="relative">
                {i < 3 && (
                  <div className="absolute left-full top-11 hidden h-px w-full -translate-x-3 bg-gradient-to-r from-brand/40 via-brand/15 to-transparent md:block" />
                )}
                <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-brand/40 hover:bg-accent/30">
                  <div className="absolute -right-4 -top-4 font-serif text-5xl font-bold text-muted-foreground/10 transition-colors group-hover:text-brand/10">
                    {step.n}
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${step.accent}55`, backgroundColor: `${step.accent}18`, color: step.accent }}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Stats ---- */}
      <StatsSection />

      {/* ---- Features ---- */}
      <section id="features" className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Recursos"
            title="Tudo que um agente autônomo de verdade precisa"
            subtitle="Inspirado na transparência do Manus AI e no dark mode nativo do Ninja AI."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="rounded-xl border border-border bg-card p-5 transition-all hover:border-brand/40 hover:bg-accent/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Demo CTA ---- */}
      <section id="demo" className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card to-background p-8 sm:p-12">
            <div className="absolute inset-0 bg-radial-glow opacity-70" />
            <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <Badge variant="outline" className="mb-4 gap-1.5 border-brand/40 bg-brand/5 text-brand">
                  <Zap className="h-3 w-3" /> Demonstração interativa
                </Badge>
                <h2 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                  Veja o agente trabalhando em tempo real
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Abra o workspace, digite uma tarefa e observe o Orquestrador decompor,
                  delegar a sub-agentes e mostrar cada ação no painel Computador.
                </p>
              </div>
              <Button size="lg" className="gap-2 glow-brand" onClick={() => setView('workspace')}>
                Abrir workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="pricing" className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Preços"
            title="Planos simples, cobrança por créditos"
            subtitle="Comece grátis. Faça upgrade quando precisar de mais paralelismo ou modelos avançados."
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PRICING.map((p) => (
              <div key={p.name}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-card p-6',
                  p.highlight ? 'border-brand/50 glow-brand' : 'border-border'
                )}>
                {p.highlight && (
                  <Badge className="absolute -top-3 left-6 gap-1 bg-brand text-brand-foreground">
                    <Star className="h-3 w-3" /> Mais popular
                  </Badge>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-serif text-4xl font-semibold" style={{ color: p.accent }}>{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <div className="mt-4 space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-brand" /> {p.credits}</div>
                  <div className="flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-brand" /> {p.parallel}</div>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" />
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full gap-1.5"
                  variant={p.highlight ? 'default' : 'outline'}
                  onClick={() => setView('workspace')}>
                  {p.cta}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Team: US$ 20/assento/mês (mín. 2) · Enterprise: sob consulta · Anual economiza 17%
          </p>
        </div>
      </section>

      {/* ---- Social proof ---- */}
      <section className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Quem usa" title="Feito para quem constrói com IA" />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { q: 'Finalmente um agente que não é caixa-preta. Vejo cada comando que ele roda.', a: 'Desenvolvedor indie', t: 'Pro' },
              { q: 'O modo Agent MAX me substituiu horas de pesquisa de mercado num café.', a: 'Fundadora de startup', t: 'Business' },
              { q: 'Dark mode lindo e sandbox isolado por sessão. Era o que faltava.', a: 'Engenheiro de dados', t: 'Pro' },
            ].map((c, i) => (
              <figure key={i} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-warning text-warning" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed text-foreground/90">“{c.q}”</blockquote>
                <figcaption className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{c.a}</span>
                  <Badge variant="outline" className="border-border text-muted-foreground">{c.t}</Badge>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
            Depoimentos ilustrativos para demonstração do produto — não atribuídos a pessoas reais.
          </p>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section id="faq" className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="FAQ" title="Perguntas frequentes" />
          <Accordion type="single" collapsible className="mt-10">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border">
                <AccordionTrigger className="text-left text-base hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <OmniNinjaLogo size={56} className="mx-auto" />
          <h2 className="mt-6 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Pronto para delegar?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Comece grátis hoje. 300 créditos por dia, 10 modelos de IA e um agente que mostra tudo o que faz.
          </p>
          <Button size="lg" className="mt-8 gap-2 glow-brand" onClick={() => setView('workspace')}>
            Lançar workspace <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-brand">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** Animated stats counter — counts up when scrolled into view. */
function StatsSection() {
  const stats = [
    { value: 10, suffix: '', label: 'Modelos de IA', desc: 'Claude, GPT, GLM, Gemini, Kimi…' },
    { value: 29, suffix: '', label: 'Ferramentas internas', desc: 'Browser, terminal, arquivos, deploy' },
    { value: 100, suffix: '+', label: 'Sub-agentes em paralelo', desc: 'Modo Agent MAX (Wide Research)' },
    { value: 1, suffix: 'M', label: 'Tokens de contexto', desc: 'GLM-5.2 e DeepSeek V4' },
  ];
  return (
    <section className="border-b border-border/60 bg-gradient-to-b from-background to-card/40 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <AnimatedStat key={s.label} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AnimatedStat({ value, suffix, label, desc }: { value: number; suffix: string; label: string; desc: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1200;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setCount(Math.round(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div className="font-serif text-4xl font-semibold tracking-tight text-gradient-brand sm:text-5xl">
        {count.toLocaleString('pt-BR')}{suffix}
      </div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{desc}</div>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="mx-auto mt-14 max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-brand/5">
        <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-danger/70" />
            <span className="h-3 w-3 rounded-full bg-warning/70" />
            <span className="h-3 w-3 rounded-full bg-success/70" />
          </div>
          <div className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" /> omninja.app/workspace
          </div>
          <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-live-dot" /> Live
          </Badge>
        </div>
        <div className="grid grid-cols-12 gap-0">
          {/* sidebar */}
          <div className="col-span-2 hidden border-r border-border bg-sidebar/40 p-3 md:block">
            <div className="space-y-2">
              {['Nova tarefa', 'Agente', 'Plugins', 'Agendado', 'Biblioteca'].map((s, i) => (
                <div key={s} className={cn('rounded-md px-2 py-1.5 text-[11px]', i === 0 ? 'bg-brand/10 text-brand' : 'text-muted-foreground')}>
                  {s}
                </div>
              ))}
            </div>
          </div>
          {/* chat */}
          <div className="col-span-12 p-5 md:col-span-6">
            <div className="space-y-3">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-accent px-3 py-2 text-xs">
                Crie uma landing page para meu SaaS de IA
              </div>
              <div className="max-w-[88%] text-xs text-muted-foreground">
                <span className="font-medium text-foreground">OmniNinja</span> · vou pesquisar referências, estruturar e construir. Abrindo o Computador…
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand animate-live-dot" /> Pensando…
              </div>
            </div>
          </div>
          {/* computer */}
          <div className="col-span-12 border-t border-border bg-background/40 p-4 md:col-span-4 md:border-l md:border-t-0">
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Badge variant="secondary" className="gap-1"><TerminalIcon className="h-2.5 w-2.5" /> Terminal</Badge>
              <span className="text-muted-foreground">Code Agent</span>
            </div>
            <div className="rounded-lg bg-[#0a0a0c] p-3 font-mono text-[10.5px] leading-relaxed">
              <div className="text-muted-foreground">$ <span className="text-success">pnpm create next-app</span></div>
              <div className="text-muted-foreground/70">✓ Ready in 648ms</div>
              <div className="text-success">$ pnpm dev</div>
              <div className="text-muted-foreground/70">- Local: http://localhost:3000</div>
              <div className="text-brand">$ <span className="terminal-cursor"></span></div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Passo 3/5</span>
              <span className="flex items-center gap-1"><Play className="h-2.5 w-2.5" /> Replay</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  const cols = [
    { title: 'Produto', links: ['Recursos', 'Preços', 'Demonstração', 'Modos', 'Modelos de IA', 'Status'] },
    { title: 'Empresa', links: ['Sobre', 'Blog', 'Changelog', 'Carreiras', 'Contato'] },
    { title: 'Recursos', links: ['Documentação', 'Guia de início', 'API (em breve)', 'Comunidade', 'Suporte'] },
    { title: 'Legal', links: ['Termos de Uso', 'Privacidade', 'Segurança', 'LGPD', 'Cookies'] },
  ];
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setTimeout(() => { setSubscribed(false); setEmail(''); }, 3000);
  };

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Newsletter */}
        <div className="mb-10 flex flex-col items-start gap-4 rounded-2xl border border-border bg-gradient-to-br from-card to-background p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-serif text-lg font-semibold">Receba novidades</h3>
            <p className="mt-1 text-sm text-muted-foreground">Novos modelos, recursos e changelog. Sem spam.</p>
          </div>
          <form onSubmit={subscribe} className="flex w-full max-w-md gap-2">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none"
            />
            <Button type="submit" className="gap-1.5" variant={subscribed ? 'outline' : 'default'}>
              {subscribed ? <><Check className="h-3.5 w-3.5" /> Inscrito!</> : 'Inscrever'}
            </Button>
          </form>
        </div>

        <div className="grid gap-8 md:grid-cols-6">
          <div className="md:col-span-2">
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Agente de IA autônomo com transparência total. Sandbox, terminal e navegador reais, dentro do chat.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-success/40 text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-live-dot" /> Todos os sistemas operacionais
              </Badge>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-medium">{c.title}</h4>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} OmniNinja. Todos os direitos reservados.</p>
          <p>Construído com Next.js 16 · GLM-5.2 · OpenRouter</p>
        </div>
      </div>
    </footer>
  );
}
