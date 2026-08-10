'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Code2,
  Gauge,
  Globe,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from './brand';
import { useOmni } from '@/lib/store';

const CAPABILITIES = [
  {
    icon: MessageSquare,
    title: 'Uma conversa contínua',
    description: 'A interface é um único chat. Não existe troca entre Chat, Agent ou Agent MAX para o usuário.',
  },
  {
    icon: Sparkles,
    title: 'Modelo OMNINJA',
    description: 'O produto mostra um único modelo chamado OMNINJA. Provedores e serviços usados por trás ficam internos.',
  },
  {
    icon: Gauge,
    title: 'Esforço real',
    description: 'Baixo, Médio e Alto alteram o esforço de raciocínio enviado ao modelo e o orçamento interno de execução.',
  },
  {
    icon: Brain,
    title: 'Pensamento opcional',
    description: 'Pensamento pode ser ligado ou desligado. Desligado usa modo sem raciocínio; ligado respeita o esforço escolhido.',
  },
  {
    icon: Globe,
    title: 'Ferramentas internas',
    description: 'Web e navegador na nuvem podem ser usados automaticamente quando a pergunta realmente precisa deles.',
  },
  {
    icon: Code2,
    title: 'Código e arquivos',
    description: 'Terminal, sandbox e arquivos ficam disponíveis internamente sem transformar a experiência em uma tela de Agent.',
  },
  {
    icon: ShieldCheck,
    title: 'Execução verificável',
    description: 'O OmniNinja não deve afirmar que executou uma ação se uma ferramenta real não confirmou o resultado.',
  },
  {
    icon: Terminal,
    title: 'Sandbox protegido',
    description: 'Comandos só rodam quando o backend possui isolamento seguro; em produção, falhas são bloqueadas em vez de simuladas.',
  },
];

export function LandingPage() {
  const setView = useOmni((state) => state.setView);
  const openWorkspace = () => setView('workspace');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Wordmark />
          <nav className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button size="sm" onClick={openWorkspace} className="gap-1.5">
              Abrir OmniNinja <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-grid opacity-50" />
          <div className="absolute inset-0 bg-radial-glow" />
          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
            <div className="mx-auto max-w-4xl text-center">
              <Badge variant="outline" className="mb-6 gap-1.5 border-brand/40 bg-brand/5 text-brand">
                <Sparkles className="h-3 w-3" /> OMNINJA · Public Beta
              </Badge>

              <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                Uma IA para conversar,
                <br />
                <span className="text-gradient-brand">pensar e fazer.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Uma experiência simples como Claude ou ChatGPT: você conversa com um único modelo chamado OMNINJA.
                Quando necessário, ele usa pesquisa, navegador, código, terminal e arquivos internamente.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" onClick={openWorkspace} className="gap-2 glow-brand">
                  Conversar com OMNINJA <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login" className="gap-2">
                    <LockKeyhole className="h-4 w-4" /> Entrar ou criar conta
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-14 max-w-3xl rounded-[28px] border border-border bg-card p-4 shadow-2xl sm:p-6">
              <div className="rounded-2xl bg-accent/70 px-4 py-3 text-left text-sm">
                Compare as opções mais importantes, confira informações atuais e me explique qual faz mais sentido.
              </div>
              <div className="mt-5 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">OMNINJA</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Posso responder diretamente ou usar recursos internos para verificar informações antes de responder.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-1">Esforço: Médio</span>
                    <span className="rounded-full border border-brand/30 bg-brand/5 px-2 py-1 text-brand">Pensamento ativado</span>
                    <span className="rounded-full border border-border px-2 py-1">Tools automáticas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline">Por trás do chat</Badge>
              <h2 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
                Simples para o usuário. Forte internamente.
              </h2>
              <p className="mt-3 text-muted-foreground">
                O usuário escolhe apenas como quer que o OMNINJA pense. O resto é responsabilidade da plataforma.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-medium">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border bg-card p-6 text-center">
              <h3 className="font-serif text-2xl font-semibold">Entre na beta.</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Comece como visitante isolado ou crie sua conta. A interface principal continua sendo apenas a conversa.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={openWorkspace} className="gap-2">
                  Abrir OMNINJA <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/login">Criar conta</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:px-6 md:flex-row md:items-center lg:px-8">
          <Wordmark />
          <span className="md:ml-auto">OmniNinja Public Beta · um modelo, uma conversa, ferramentas internas.</span>
        </div>
      </footer>
    </div>
  );
}
