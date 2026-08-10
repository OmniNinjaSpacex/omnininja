'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Code2,
  Globe,
  MessageSquare,
  Monitor,
  ShieldCheck,
  Sparkles,
  Terminal,
  Check,
  LockKeyhole,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from './brand';
import { useOmni } from '@/lib/store';

const CAPABILITIES = [
  {
    icon: MessageSquare,
    title: 'Chat real',
    description: 'Conversa com o backend OpenAI configurado no servidor, com streaming e histórico de mensagens.',
  },
  {
    icon: Bot,
    title: 'Agent + Agent MAX',
    description: 'Loop de ferramentas estruturado: o modelo decide quando navegar, executar comandos e trabalhar com arquivos.',
  },
  {
    icon: Globe,
    title: 'Navegador na nuvem',
    description: 'Browserless real com screenshots, LiveURL interativo e sessões separadas por tarefa e usuário.',
  },
  {
    icon: Terminal,
    title: 'Sandbox seguro',
    description: 'Comandos só executam em produção quando o host oferece isolamento seguro. Sem fallback silencioso para o servidor.',
  },
  {
    icon: Code2,
    title: 'Arquivos e código',
    description: 'O Computer mostra apenas alterações e saídas realmente confirmadas pelo backend — sem arquivos ou previews inventados.',
  },
  {
    icon: ShieldCheck,
    title: 'Sessões isoladas',
    description: 'Visitantes recebem contas guest separadas; navegador, arquivos e tickets de takeover não são compartilhados entre usuários.',
  },
];

const NOW = [
  'Chat com OpenAI',
  'Agent e Agent MAX com function calling',
  'Browserless + takeover humano',
  'Terminal e filesystem com fail-closed',
  'Computer com eventos reais',
  'Contas guest isoladas + login por e-mail',
];

const NEXT = [
  'Projects e memória persistente',
  'Banco gerenciado para escala multiusuário',
  'Deep Research e Skills',
  'Conectores e MCP',
  'Website Builder + deploy verificável',
  'Billing, equipes e API pública',
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
                <Sparkles className="h-3 w-3" /> Public Beta · produto real, sem execução simulada
              </Badge>

              <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                Converse com uma IA.
                <br />
                <span className="text-gradient-brand">Quando precisar, ela trabalha.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                OmniNinja reúne Chat e Agent em uma única plataforma. Perguntas simples ficam no chat;
                tarefas reais podem usar navegador na nuvem, ferramentas, terminal e arquivos — e o Computer
                mostra somente o que realmente aconteceu.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" onClick={openWorkspace} className="gap-2 glow-brand">
                  Usar como visitante <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login" className="gap-2">
                    <LockKeyhole className="h-4 w-4" /> Entrar ou criar conta
                  </Link>
                </Button>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                O acesso guest recebe uma sessão própria. Recursos dependem das integrações realmente configuradas no servidor.
              </p>
            </div>

            <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                <span className="ml-3 text-xs text-muted-foreground">OmniNinja Computer</span>
              </div>
              <div className="grid min-h-64 md:grid-cols-[1fr_1.15fr]">
                <div className="border-b border-border p-6 md:border-b-0 md:border-r">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Conversa</div>
                  <div className="mt-4 rounded-xl bg-accent p-3 text-sm">
                    Pesquise este assunto, compare as fontes e gere um arquivo com o resultado.
                  </div>
                  <div className="mt-3 rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
                    Agent iniciado. As ações confirmadas aparecerão no Computer.
                  </div>
                </div>
                <div className="bg-[#09090b] p-6 text-sm">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Monitor className="h-4 w-4 text-brand" /> Computer
                  </div>
                  <div className="mt-5 space-y-3 text-xs text-zinc-400">
                    <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Browserless LiveURL quando realmente criado</div>
                    <div className="flex items-center gap-2"><Terminal className="h-3.5 w-3.5" /> saída real do sandbox</div>
                    <div className="flex items-center gap-2"><Code2 className="h-3.5 w-3.5" /> arquivos confirmados pelo Agent</div>
                  </div>
                  <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
                    Sem Browserless? Mostra indisponível. Sem sandbox seguro? O comando é bloqueado.
                    O frontend não substitui falhas por uma demonstração falsa.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge variant="outline">Base do produto</Badge>
              <h2 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
                Uma interface simples, ferramentas reais por trás.
              </h2>
              <p className="mt-3 text-muted-foreground">
                A prioridade da beta é confiabilidade: não afirmar que uma ação ocorreu sem confirmação da ferramenta.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        </section>

        <section className="border-b border-border/60 py-20">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-success">Disponível na base atual</div>
              <ul className="mt-5 space-y-3">
                {NOW.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Próximas camadas</div>
              <ul className="mt-5 space-y-3">
                {NEXT.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-serif text-3xl font-semibold">Entre na beta do OmniNinja.</h2>
            <p className="mt-3 text-muted-foreground">
              Você pode começar com uma sessão guest isolada ou criar sua conta para usar o produto com identidade própria.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={openWorkspace} className="gap-2">
                Abrir agora <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Criar conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:px-6 md:flex-row md:items-center lg:px-8">
          <Wordmark />
          <span className="md:ml-auto">OmniNinja Public Beta · recursos podem evoluir durante a beta.</span>
        </div>
      </footer>
    </div>
  );
}
