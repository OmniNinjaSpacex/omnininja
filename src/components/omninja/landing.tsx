'use client';

import { ArrowRight, Bot, Braces, Globe2, Layers3, LockKeyhole, Sparkles } from 'lucide-react';
import { Wordmark } from './brand';
import { useOmni } from '@/lib/store';

const cards = [
  { icon: Sparkles, title: 'Pesquise que eu resolvo', body: 'O OMNINJA pesquisa, organiza contexto e transforma o pedido em uma entrega útil.' },
  { icon: Braces, title: 'Software sem alternar aba', body: 'Código, arquivos e execução ficam ligados à mesma tarefa e ao mesmo workspace.' },
  { icon: Globe2, title: 'Navegue quando precisar', body: 'Browserless e pesquisa web entram como ferramentas internas, sem mudar a experiência.' },
];

export function LandingPage() {
  const setView = useOmni((state) => state.setView);
  const openWorkspace = () => setView('workspace');

  return (
    <main className="min-h-screen overflow-hidden bg-[#06090d] text-white selection:bg-cyan-300/20">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(20,119,173,.20),transparent_30%),radial-gradient(circle_at_18%_28%,rgba(12,72,112,.15),transparent_26%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1420px] items-center border-b border-white/[0.06] px-6 lg:px-10">
        <Wordmark className="mr-auto" />
        <nav className="hidden items-center gap-8 text-[12px] text-white/50 md:flex">
          <a href="#capacidades" className="transition-colors hover:text-white">Capacidades</a>
          <a href="#sistema" className="transition-colors hover:text-white">Sistema</a>
          <a href="#seguranca" className="transition-colors hover:text-white">Segurança</a>
        </nav>
        <button onClick={openWorkspace} className="ml-8 inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-[12px] font-medium text-white/85 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]">
          Abrir workspace
        </button>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[720px] w-full max-w-[1420px] items-center gap-12 px-6 py-20 lg:grid-cols-[.82fr_1.18fr] lg:px-10">
        <div className="max-w-[600px]">
          <div className="mb-7 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" />
            Agentes que pensam, criam e agem
          </div>
          <h1 className="text-[56px] font-medium leading-[.98] tracking-[-.06em] sm:text-[72px] lg:text-[86px]">
            Uma<br />inteligência.<br />Infinitas<br /><span className="bg-gradient-to-r from-white via-cyan-200 to-[#20a8ff] bg-clip-text text-transparent">habilidades.</span>
          </h1>
          <p className="mt-8 max-w-[540px] text-[14px] leading-7 text-white/48">
            Converse, pesquise, construa produtos e delegue trabalho completo. O OMNINJA combina raciocínio, navegador, arquivos e execução isolada em uma única experiência.
          </p>
          <button onClick={openWorkspace} className="mt-9 inline-flex h-12 items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-200 to-[#22a8ff] px-6 text-[12px] font-semibold text-[#02131e] shadow-[0_10px_40px_rgba(34,168,255,.22)] transition hover:-translate-y-0.5">
            Entrar no OMNINJA <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-4 text-[10px] text-white/25">Workspace privado · dados isolados · você controla cada ação sensível</div>
        </div>

        <div className="relative mx-auto w-full max-w-[760px]">
          <div className="absolute -inset-20 rounded-full bg-cyan-400/[0.04] blur-3xl" />
          <div className="relative overflow-hidden rounded-[24px] border border-cyan-200/10 bg-[#0b1015]/95 shadow-[0_40px_100px_rgba(0,0,0,.55)]">
            <div className="flex h-12 items-center border-b border-white/[0.06] px-4">
              <Wordmark className="origin-left scale-90" />
              <div className="ml-auto rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[9px] text-white/40">OMNINJA</div>
            </div>
            <div className="grid h-[390px] grid-cols-[145px_1fr_210px]">
              <aside className="border-r border-white/[0.05] p-3">
                <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300 text-[#061018]"><Bot className="h-4 w-4" /></div>
                {['Nova tarefa', 'Agente', 'Buscar', 'Biblioteca'].map((item, index) => (
                  <div key={item} className={`mb-1 rounded-lg px-2 py-2 text-[9px] ${index === 0 ? 'bg-white/[0.055] text-white/80' : 'text-white/28'}`}>{item}</div>
                ))}
              </aside>
              <div className="flex flex-col justify-center px-8">
                <div className="text-[9px] font-medium uppercase tracking-[.2em] text-cyan-300/60">Agente ativo</div>
                <div className="mt-4 font-serif text-[28px] text-white/88">O que posso fazer por você?</div>
                <div className="mt-5 rounded-2xl border border-cyan-200/15 bg-white/[0.025] p-4">
                  <div className="text-[10px] text-white/27">Crie, pesquise ou execute uma tarefa...</div>
                  <div className="mt-10 flex items-center gap-2">
                    <span className="h-5 rounded-full border border-white/[0.06] px-2 text-[8px] leading-5 text-white/35">+ arquivo</span>
                    <span className="h-5 rounded-full border border-white/[0.06] px-2 text-[8px] leading-5 text-white/35">pensar</span>
                    <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-300 text-[#061018]">↑</span>
                  </div>
                </div>
                <div className="mt-5 flex gap-2 text-[8px] text-white/30">
                  <span className="rounded-full border border-white/[0.07] px-3 py-1.5">Pesquisa ampla</span>
                  <span className="rounded-full border border-white/[0.07] px-3 py-1.5">Criar site</span>
                </div>
              </div>
              <div className="border-l border-white/[0.05] p-3">
                <div className="text-[8px] uppercase tracking-[.16em] text-white/20">Workspace</div>
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 font-mono text-[9px] leading-6 text-white/35">
                  <span className="text-cyan-300/70">const</span> future = <span className="text-white/60">await agent.run()</span>;<br /><br />return experience;
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -right-4 top-10 rounded-xl border border-cyan-200/10 bg-[#10161c]/95 px-4 py-3 text-[10px] shadow-2xl">
            <div className="flex items-center gap-2 text-white/70"><Layers3 className="h-3.5 w-3.5 text-cyan-300" /> ferramentas conectadas</div>
          </div>
          <div className="absolute -bottom-5 left-8 rounded-xl border border-cyan-200/10 bg-[#10161c]/95 px-4 py-3 text-[10px] shadow-2xl">
            <div className="flex items-center gap-2 text-white/70"><Globe2 className="h-3.5 w-3.5 text-cyan-300" /> navegador real</div>
          </div>
        </div>
      </section>

      <section id="capacidades" className="relative z-10 mx-auto w-full max-w-[1420px] border-t border-white/[0.06] px-6 py-28 lg:px-10">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[.2em] text-cyan-300/60">Capacidades</div>
          <h2 className="mt-5 font-serif text-4xl tracking-[-.03em] sm:text-5xl">Do pedido ao resultado,<br />sem trocar de ferramenta.</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {cards.map(({ icon: Icon, title, body }) => (
            <article key={title} className="min-h-64 rounded-2xl border border-white/[0.07] bg-white/[0.018] p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.05] text-cyan-300"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-16 text-[14px] font-medium text-white/85">{title}</h3>
              <p className="mt-3 text-[12px] leading-6 text-white/35">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="sistema" className="relative z-10 mx-auto grid w-full max-w-[1420px] gap-8 border-t border-white/[0.06] px-6 py-24 lg:grid-cols-2 lg:px-10">
        <div>
          <div className="text-[10px] uppercase tracking-[.2em] text-cyan-300/60">Sistema</div>
          <h2 className="mt-4 max-w-xl font-serif text-4xl">Um único agente na frente. Ferramentas especializadas por trás.</h2>
        </div>
        <div id="seguranca" className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5"><Bot className="h-5 w-5 text-cyan-300" /><div className="mt-7 text-sm">OMNINJA</div><div className="mt-2 text-xs leading-6 text-white/35">Uma identidade pública para chat, tarefas e execução.</div></div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5"><LockKeyhole className="h-5 w-5 text-cyan-300" /><div className="mt-7 text-sm">Execução isolada</div><div className="mt-2 text-xs leading-6 text-white/35">AI Lab e sandbox permanecem separados do servidor principal.</div></div>
        </div>
      </section>
    </main>
  );
}
