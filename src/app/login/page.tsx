'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, LockKeyhole, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/omninja/brand';
import { useOmni } from '@/lib/store';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const setView = useOmni((state) => state.setView);
  const setUser = useOmni((state) => state.setUser);
  const setConfiguredProviders = useOmni((state) => state.setConfiguredProviders);

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const enterWorkspace = () => {
    setView('workspace');
    router.push('/');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Digite um e-mail válido.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          ...(mode === 'register' && name.trim() ? { name: name.trim() } : {}),
        }),
      });

      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        throw new Error(payload?.error || `Falha de autenticação (HTTP ${response.status})`);
      }

      // Refresh the canonical server-side account/capability snapshot after the
      // session cookie is created by login/register.
      const meResponse = await fetch('/api/me', { cache: 'no-store' });
      const me = await meResponse.json().catch(() => ({} as any));
      if (!meResponse.ok || !me?.user) {
        throw new Error(me?.error || 'Conta autenticada, mas não foi possível carregar a sessão.');
      }

      setUser(me.user);
      setConfiguredProviders(Array.isArray(me.providers) ? me.providers : []);
      setView('workspace');
      router.push('/');
    } catch (authError: any) {
      setError(authError?.message || 'Não foi possível autenticar sua conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <button onClick={() => router.push('/')} aria-label="Voltar para a página inicial">
            <Wordmark />
          </button>
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => router.push('/')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <div className="hidden lg:block">
          <div className="max-w-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h1 className="mt-6 font-serif text-4xl font-semibold">
              Sua conta, seus chats e suas tarefas.
            </h1>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              O OmniNinja está em Public Beta. A autenticação por e-mail usa sessão HTTP-only no servidor.
              O acesso sem conta continua disponível com um usuário guest isolado.
            </p>
            <div className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              O OmniNinja nunca precisa colocar sua chave da OpenAI ou do Browserless no navegador do usuário.
              As credenciais da plataforma ficam no ambiente do servidor.
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7">
          <div className="grid grid-cols-2 rounded-lg bg-accent p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'login' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'register' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Criar conta
            </button>
          </div>

          <div className="mt-6">
            <h2 className="text-xl font-semibold">
              {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta OmniNinja'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Entre com o e-mail e a senha cadastrados.'
                : 'Cadastre-se para usar sua própria sessão.'}
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Nome</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="voce@exemplo.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Senha</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Mínimo de 8 caracteres"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
              />
            </label>

            {error && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <LockKeyhole className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {loading ? 'Carregando…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={enterWorkspace}>
            Continuar como visitante
          </Button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            Visitantes usam uma conta guest separada. Não anunciamos OAuth até a integração estar realmente ativa.
          </p>
        </div>
      </section>
    </main>
  );
}
