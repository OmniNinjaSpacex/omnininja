import { ArrowRight, ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import type { CorporatePageData } from '@/lib/corporate-pages';
import { primaryCorporateNav } from '@/lib/corporate-pages';
import { Wordmark } from './brand';

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function CorporatePage({ page }: { page: CorporatePageData }) {
  const external = isExternal(page.ctaHref);

  return (
    <main className="min-h-screen overflow-hidden bg-[#06090d] text-white selection:bg-cyan-300/20">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_10%,rgba(22,126,182,.18),transparent_32%),radial-gradient(circle_at_14%_30%,rgba(8,61,96,.13),transparent_28%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="relative z-20 border-b border-white/[0.07] bg-[#06090d]/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-[1420px] items-center px-5 lg:px-10">
          <a href="/" aria-label="Página inicial do OMNININJA" className="mr-auto">
            <Wordmark />
          </a>
          <nav className="hidden items-center gap-6 text-[11px] text-white/48 lg:flex">
            {primaryCorporateNav.map((item) => (
              <a key={item.href} href={item.href} className={`transition-colors hover:text-white ${page.slug === item.href.slice(1) ? 'text-cyan-200' : ''}`}>
                {item.label}
              </a>
            ))}
          </nav>
          <a href="/?workspace=1" className="ml-5 inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-[11px] font-medium text-white/85 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]">
            Abrir OMNININJA
          </a>
          <details className="group relative ml-2 lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 text-white/60 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              <span className="sr-only">Abrir navegação</span>
            </summary>
            <nav className="absolute right-0 top-12 w-56 rounded-2xl border border-white/10 bg-[#0b1015] p-2 shadow-2xl">
              {primaryCorporateNav.map((item) => (
                <a key={item.href} href={item.href} className="block rounded-xl px-3 py-2.5 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white">
                  {item.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[670px] w-full max-w-[1420px] flex-col justify-end px-5 pb-20 pt-28 sm:pb-28 lg:px-10">
        <div className="max-w-5xl">
          <div className="mb-7 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300/75">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" />
            {page.eyebrow}
          </div>
          <h1 className="max-w-[1050px] text-[48px] font-medium leading-[.98] tracking-[-.055em] sm:text-[68px] lg:text-[88px]">
            {page.title}
          </h1>
          <p className="mt-9 max-w-3xl text-[14px] leading-7 text-white/46 sm:text-[16px] sm:leading-8">
            {page.lead}
          </p>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1420px] border-t border-white/[0.07] px-5 py-20 lg:px-10">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-2 lg:grid-cols-3">
          {page.highlights.map((item) => (
            <article key={`${item.label}-${item.title}`} className="min-h-64 bg-[#080c11] p-7 sm:p-8">
              <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-cyan-300/55">{item.label}</div>
              <h2 className="mt-16 text-xl font-medium tracking-[-.02em] text-white/90">{item.title}</h2>
              <p className="mt-4 max-w-sm text-[12px] leading-6 text-white/38">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {page.sections.map((section, index) => (
        <section key={section.title} className="relative z-10 mx-auto grid w-full max-w-[1420px] gap-12 border-t border-white/[0.07] px-5 py-24 lg:grid-cols-[.95fr_1.05fr] lg:px-10 lg:py-32">
          <div className={index % 2 ? 'lg:order-2' : ''}>
            <div className="text-[10px] uppercase tracking-[.22em] text-cyan-300/60">{section.eyebrow}</div>
            <h2 className="mt-5 max-w-xl font-serif text-4xl leading-[1.08] tracking-[-.035em] sm:text-5xl">{section.title}</h2>
            <p className="mt-7 max-w-xl text-[13px] leading-7 text-white/42">{section.body}</p>
          </div>
          <div className={`grid content-start gap-3 ${index % 2 ? 'lg:order-1' : ''}`}>
            {section.items.map((item) => (
              <div key={item} className="flex min-h-16 items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 py-4 text-[12px] text-white/62">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/[0.08] text-cyan-200"><Check className="h-3.5 w-3.5" /></span>
                {item}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="relative z-10 mx-auto w-full max-w-[1420px] border-t border-white/[0.07] px-5 py-24 lg:px-10 lg:py-32">
        <div className="overflow-hidden rounded-[30px] border border-cyan-200/10 bg-[radial-gradient(circle_at_85%_10%,rgba(39,180,255,.13),transparent_38%),#0a0f14] p-8 sm:p-12 lg:p-16">
          <div className="max-w-3xl">
            <h2 className="font-serif text-4xl tracking-[-.035em] sm:text-5xl">{page.ctaTitle}</h2>
            <p className="mt-6 max-w-2xl text-[13px] leading-7 text-white/42">{page.ctaBody}</p>
            <a href={page.ctaHref} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="mt-9 inline-flex h-12 items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-200 to-[#22a8ff] px-6 text-[12px] font-semibold text-[#02131e] shadow-[0_10px_40px_rgba(34,168,255,.18)] transition hover:-translate-y-0.5">
              {page.ctaLabel} {external ? <ArrowUpRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07]">
        <div className="mx-auto grid w-full max-w-[1420px] gap-12 px-5 py-16 md:grid-cols-[1.3fr_1fr_1fr] lg:px-10">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-sm text-[11px] leading-6 text-white/30">Uma inteligência para conversar, criar e realizar com ferramentas avançadas nos bastidores.</p>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[.2em] text-white/25">Plataforma</div>
            <div className="mt-5 grid gap-3 text-[11px] text-white/45">
              <a href="/products" className="hover:text-white">Produtos</a>
              <a href="/research" className="hover:text-white">Pesquisa</a>
              <a href="/developers" className="hover:text-white">Desenvolvedores</a>
              <a href="/academy" className="hover:text-white">Academia</a>
              <a href="/news" className="hover:text-white">Notícias</a>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[.2em] text-white/25">Empresa</div>
            <div className="mt-5 grid gap-3 text-[11px] text-white/45">
              <a href="/company" className="hover:text-white">Sobre</a>
              <a href="/business" className="hover:text-white">Empresas</a>
              <a href="/safety" className="hover:text-white">Segurança</a>
              <a href="/security" className="hover:text-white">Privacidade e proteção</a>
              <a href="/contact" className="hover:text-white">Contato</a>
              <a href="/terms" className="hover:text-white">Termos</a>
              <a href="/privacy" className="hover:text-white">Política de privacidade</a>
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-3 border-t border-white/[0.05] px-5 py-6 text-[10px] text-white/22 sm:flex-row sm:items-center lg:px-10">
          <span>OMNININJA © 2026</span>
          <span className="sm:ml-auto">Produto independente construído com identidade própria.</span>
        </div>
      </footer>
    </main>
  );
}

