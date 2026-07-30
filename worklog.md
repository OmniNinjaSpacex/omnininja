# OmniNinja — Worklog / Handover

> Plataforma de agente de IA autônomo (estilo Manus AI / Ninja AI), construída
> como single-page app Next.js 16 no scaffold Z.ai. Documento raiz de
> referência: `upload/extracted/PARTE_*.md` (15 partes do PROMPT_OMNINJA_BUILD_ZAI_v3).

---
Task ID: 1
Agent: Z.ai Code (main)
Task: Ler todos os arquivos do upload (PROMPT_OMNINJA_BUILD_ZAI_v3.zip) e construir a fundação do OmniNinja — design system dark Ninja AI, landing page completa, workspace com painel "Computador", backend de créditos/integrações, mini-service WebSocket, e cron de revisão.

Work Log:
- Extraído `upload/PROMPT_OMNINJA_BUILD_ZAI_v3.zip` → 15 arquivos `.md` (PARTE_01..15). Lidos integralmente.
- Prisma schema ampliado: User, Session, Project, Task, Message, EventRow (append-only), Artifact, CreditTransaction, Integration. SQLite. `bun run db:push` OK.
- `.env.example` criado com todas as variáveis da Seção 13 (OpenRouter, provedores diretos, Browserless, Exa, infra, auth, billing, orquestrador). Sem valores reais.
- `src/lib/providers.ts`: roteador multi-modelo (10 provedores: claude, chatgpt, glm, deepseek, kimi, gemini, grok, nemotron, minimax, qwen) com kind/model/baseURL/apiKeyEnv/openrouterKeyEnv.
- `src/lib/integrations.ts`: getStatus apenas configurado/ausente (nunca o valor da chave).
- `src/lib/auth.ts`: demo user estável (ninja@omninja.app, Pro, 5000 créditos) + sessão cookie httpOnly.
- `src/lib/credits.ts`: tiers Free/Pro/Business/Team/Enterprise + custos por ação + consume/grant.
- `src/lib/orchestrator.ts`: classificador chat-vs-tarefa + buildEventTimeline (TASK_STARTED, PLAN_CREATED, STEP_STARTED, AGENT_THINKING, BROWSER_ACTION, TERMINAL_OUTPUT, FILE_CHANGED, STEP_COMPLETED, TASK_COMPLETED) — timeline scriptada que demonstra a transparência do Event Stream.
- `src/lib/store.ts` (Zustand): view, user, messages, model, mode, currentTask, computer panel (tab/fullscreen/open), replay, demoMode.
- `src/lib/use-agent-runner.ts`: orquestra classificação → chat direto (streaming token-a-token) OU task (cria TaskRun, replays timeline no store com pacing realista, abre Computador, alterna abas conforme evento, summary final).
- `src/lib/use-event-stream.ts`: hook socket.io (`io("/?XTransformPort=3003")`) para canal `task:{taskId}`.
- Design system em `globals.css`: paleta Ninja AI (#0d0d0f/#17171a/#1f1f23/#38bdf8 brand), fontes Inter + JetBrains Mono + Source Serif 4, scrollbars custom, animações (live-dot, typing dots, shimmer, fade-up, marquee, terminal cursor), utilitários (bg-grid, bg-radial-glow, glow-brand, text-gradient-brand).
- `layout.tsx`: dark-first (`<html class="dark">`), metadata OmniNinja PT-BR, ThemeProvider.
- `components/omninja/brand.tsx`: OmniNinjaLogo (shuriken+O), Wordmark, ProviderGlyph (cor por provedor).
- `components/omninja/landing.tsx`: nav sticky + hero (headline serif + CTAs + HeroPreview mock) + marquee logos + 3 modos (Chat/Agent/Agent MAX) + 9 features + demo CTA + pricing (Free/Pro/Business) + social proof (3 depoimentos ilustrativos) + FAQ (7 itens accordion) + CTA final + footer (4 colunas + status badge).
- `components/omninja/model-selector.tsx`: popover com provedores configurados, glyph, badge, descrição, check.
- `components/omninja/messages.tsx`: MessageList (auto-scroll rAF), MessageBubble (user direita / assistant esquerda com logo+tier+model badge), MarkdownContent (react-markdown + SyntaxHighlighter + copy), ThinkingDots, EmptyChat (headline serif + mode pills + 4 prompt chips que disparam envio).
- `components/omninja/chat-input.tsx`: mode pills + AttachMenu (+ / recentes / skills / Drive-Figma stubs "em breve") + ModelSelector + textarea auto-resize + emoji/mic + send/stop (stop = quadrado).
- `components/omninja/computer-panel.tsx`: header com 4 abas (Código/Pré-visualizar/Navegador/Terminal) + fullscreen + close + contador de eventos. BrowserView (chrome + URL bar + Live badge + BrowserMock estilizado por domínio + VirtualCursor Bézier + histórico de ações). TerminalView (xterm-like, stdout/stderr/exit colorido, cursor pulsante). CodeView (file tree + diffs + plano do orquestrador com steps ✓/●/○). PreviewView (mock do site construído + artefatos). ReplayBar (◀ ● Live ▶ + scrubber range + contador). ProgressWidget flutuante (N/total + steps + Abrir Computador).
- `components/omninja/workspace.tsx`: sidebar 200px (Nova tarefa, Agente, Plugins, Agendado, Biblioteca, Projetos, Tarefas recentes, Docs/Status/Integrações/Conta, promo card, user avatar) + drawer mobile + header (home, task title, ModelSelector, stats, share, CreditsCounter) + banner demo-mode (transparente) + body (chat + computer panel) + ProgressWidget + 5 sheets.
- `components/omninja/sheets.tsx`: AdminSheet (integrações por categoria, contadores, truthful ausente), DocsSheet (início rápido, modos, painel, sub-agentes, API em breve), AccountSheet (tabs Visão/Uso/Preferências, créditos, transações, prefs), StatusSheet (6 serviços), LoginSheet (Google/GitHub OAuth + email).
- APIs: `/api/me` (user + providers + demoMode fallback), `/api/classify` (chat-vs-task), `/api/integrations` (status), `/api/credits` (saldo + transações), `/api/tasks` (POST cria task + persiste events, GET lista).
- Mini-service `mini-services/event-stream/`: socket.io na porta 3003, canais `task:{taskId}`, endpoint POST /emit e GET /health. Iniciado em background (`bun --hot`).
- Lint limpo (`bun run lint` → 0 erros).

Stage Summary:
- App verificado end-to-end com agent-browser + VLM:
  * Landing renderiza todas as seções, mobile 390px sem overflow horizontal, touch targets OK.
  * Workspace: sidebar + header + chat + computer panel. /api/me retorna demo user Pro 5000 créditos.
  * Fluxo de tarefa completo: usuário envia → classifica como task → intro message → Computador abre → eventos tocam (Browser/Terminal/Code alternam abas) → mensagem "Tarefa concluída" → artefatos. Auto-scroll corrigido (rAF) — última mensagem visível sem truncamento.
  * Model selector mostra 5 provedores demo (GLM/Claude/GPT/Gemini/Kimi) com glyphs/badges/descrições.
  * Admin "Integrações" mostra status truthful (todos "Ausente" — nenhuma chave configurada no sandbox).
  * Demo-mode banner visível e transparente.
  * Dev log limpo, sem erros runtime/hydratação.
- Decisões de arquitetura: single `/` route (restrição do ambiente) com view-switching client-side (landing ↔ workspace); marketing como scroll sections; docs/account/admin/status/login como Sheets. Orquestrador é simulação client-side scriptada (sandbox Docker real não disponível no preview) — transparency preservada via Event Stream + demo-mode banner.
- Próxima fase recomendada: integrar z-ai-web-dev-sdk (GLM) real no /api/chat e /api/tasks para respostas dinâmicas; conectar Browserless real; agendar tarefas; replay real de EventRow persistido.

Unresolved / riscos:
- Nenhuma chave de IA configurada → demoMode ativo (intencional e transparente). Para uso real, preencher .env (Seção 13) — o seletor passará a mostrar só provedores configurados.
- Sandbox Docker / Browserless não disponíveis no sandbox cloud → navegador/terminal são simulações fiéis mas não executam ações reais em sites externos.
- OAuth (Google/GitHub) e Stripe são stubs (requerem client_id/secret reais).

---
Task ID: 1 (cont.)
Agent: Z.ai Code (main)
Task: Final verification & event-stream service cleanup

Work Log:
- Event-stream mini-service refatorado em 2 planos: socket.io (porta 3003, path "/" — requerido pelo Caddy) para o canal realtime do frontend, e HTTP de controle (porta 3004) para /health e /emit (orquestrador). Necessário porque socket.io com path "/" intercepta todas as requisições na sua porta.
- Limpeza de processos duplicados do event-stream (3 instâncias órfãs removidas). Agora 1 processo limpo (pid estável).
- Verificado end-to-end via Caddy gateway (:81): handshake socket.io `/?EIO=4&transport=polling&XTransformPort=3003` retorna SID válido. Frontend `io("/?XTransformPort=3003")` conecta.
- /api/classify retorna {"kind":"chat"} para "oi" e {"kind":"task"} para "crie um site" — classificador funcionando.
- Lint limpo. Dev log sem erros runtime/hydratação. Todas as APIs HTTP 200.

Stage Summary:
- Stack completo operacional: Next.js 16 (porta 3000) + event-stream socket.io (3003) + controle HTTP (3004) + Prisma/SQLite + 6 APIs.
- Cron job webDevReview criado (job_id 297916, a cada 15 min, tz Asia/Shanghai) para continuação autônoma do desenvolvimento.
- Pronto para revisão/continuação pela próxima fase.

---
Task ID: 2
Agent: Z.ai Code (webDevReview cron, round 1)
Task: QA via agent-browser + adicionar features (LLM real, tarefas agendadas, atalhos de teclado, polish da landing)

Work Log:
- QA via agent-browser identificou 3 issues: (1) modo Chat retornava respostas canned, não LLM real; (2) botão "Agendado" da sidebar não tinha ação; (3) sem atalhos de teclado.
- **LLM real integrado** via z-ai-web-dev-sdk (GLM-5.2):
  * Novo `/api/chat` (POST, SSE streaming) — chama `zai.chat.completions.create` com system prompt OmniNinja PT-BR, persiste user+assistant messages no DB, debita 1 crédito/chat.
  * SDK `stream:true` retorna bytes crus neste env → solução: chamada non-streaming + chunking server-side word-by-word com delay 18ms para UX de streaming real.
  * `use-agent-runner.ts` atualizado: modo Chat agora chama `streamLLMChat()` (SSE reader) que alimenta `updateMessage` token-a-token. Fallback gracioso para canned reply se LLM falhar. Summary de tasks também usa LLM real.
  * Fix bug: `store.messages` era stale após `pushMessage` (Zustand retorna array novo) → re-read `useOmni.getState().messages` + filtro de mensagens empty/streaming.
  * Verificado: "Qual a capital do Brasil?" → "A capital do Brasil é **Brasília**." com badge glm-5.2. "Explique em 2 frases o que é um agente de IA autônomo" → resposta substantiva real. Créditos decrementam (5000→4997 após 3 msgs).
- **Tarefas Agendadas** (item "Agendado" da sidebar, Seção 10.6):
  * Prisma: novo model `ScheduledTask` (userId, title, prompt, mode, model, schedule, enabled, lastRunAt, nextRunAt, runsCount). `bun run db:push` OK.
  * `/api/scheduled` (GET lista, POST cria com computeNextRun, PATCH toggle enabled, DELETE). Parser de schedule: `daily HH:MM`, `weekly <dow> HH:MM`, `every Nh/Nm`, `once YYYY-MM-DD HH:MM`.
  * `ScheduledSheet` component: form (title, prompt, schedule com presets chips, mode pills), lista de tasks com toggle play/pause, delete, próxima execução, runsCount.
  * Wire: sidebar "Agendado" (desktop + mobile drawer) abre o sheet. Badge "cron" no item.
  * Verificado: criada task "Relatório semanal de IA" daily 09:00 → persiste, mostra próxima execução.
- **Atalhos de teclado** (a11y + power user):
  * `use-keyboard-shortcuts.ts` hook: ⌘/Ctrl+K (nova conversa), ⌘/Ctrl+B (toggle sidebar), ⌘/Ctrl+. (toggle Computador), ⌘/Ctrl+Enter (focar input), 1/2/3 (modo Chat/Agent/Agent MAX), ? (ajuda), Esc (fechar painel). Ignora quando digitando (exceto ⌘K).
  * `ShortcutsDialog` component com tabela de atalhos + <kbd> styling.
  * Botão "⌘K" no header do workspace (lg+) abre o dialog.
  * Verificado: ⌘K cria nova conversa (toast confirm), ? abre dialog de atalhos.
- **Polish da landing** (mandatory styling improvements):
  * Nova seção "Como funciona" — 4 step cards (01-04) com ícones coloridos, números decorativos grandes, connector lines brand-tinted entre cards no desktop.
  * Nova seção "Stats" com contadores animados (IntersectionObserver + requestAnimationFrame easing) — 10 modelos, 29 ferramentas, 100+ sub-agentes, 1M tokens. Gradient text.
  * Newsletter no footer — form de email com feedback "Inscrito!" por 3s.
- Fix: dev server precisou restart após `db:push` (Prisma client singleton cached em `globalForPrisma`). Reiniciado manualmente.
- Lint limpo. Dev log sem erros runtime.

Stage Summary:
- **LLM real funcional**: modo Chat agora usa GLM-5.2 via z-ai-web-dev-sdk com streaming SSE. Não é mais canned. Persiste mensagens no DB, debita créditos.
- **3 features novas**: LLM real + Tarefas Agendadas (CRUD completo) + Atalhos de teclado (9 atalhos + dialog de ajuda).
- **3 polish de landing**: seção "Como funciona" (4 steps), stats animados, newsletter.
- Verificado end-to-end com agent-browser + VLM: chat real, scheduled sheet CRUD, atalhos ⌘K e ?, novas seções da landing renderizam.
- Stack: Next.js 16 (3000) + event-stream socket.io (3003/3004) + Prisma/SQLite + 7 APIs (me, classify, chat, integrations, credits, tasks, scheduled).

Unresolved / próximos passos:
- O cron job webDevReview continua a cada 15 min — próximas rodadas podem: conectar Browserless real, replay de EventRow persistido (history sheet), UI de "Plugins" e "Biblioteca", mais variações de BrowserMock, comand palette (Cmd+K com search), tema light toggle, tradução EN.
- Sandbox Docker / OAuth / Stripe continuam como stubs (requerem infra/creds externas).
- LLM está como GLM-5.2 fixo (demoMode) — para multi-modelo real, preencher .env com chaves OpenRouter/provedores.

---
Task ID: 3
Agent: Z.ai Code (webDevReview cron, round 2)
Task: QA via agent-browser + adicionar Command Palette, Library/History com replay, Plugins marketplace, theme toggle, message actions

Work Log:
- QA via agent-browser identificou 3 issues: (1) "Plugins" e "Biblioteca" da sidebar sem ação; (2) sem command palette (Cmd+K só criava nova task); (3) sem theme toggle (dark only); (4) sem message actions (copy/regenerate).
- **Command Palette** (⌘K):
  * `command-palette.tsx` — dialog com search input, agrupamento por categoria (Actions/Navigation/Modes/Settings), fuzzy filter por label/hint/keywords, navegação ↑↓ + Enter, scrollIntoView, shortcuts badges (<kbd>), footer com hints.
  * 13 comandos: nova conversa, home, docs, status, integrações, conta, agendado, biblioteca, plugins, 3 modos, atalhos, toggle tema.
  * ⌘K agora abre o palette (antes era new task). ⌘N = new task (alternativo). Botão "⌘K" no header (lg+) com ícone Search.
  * Verificado: busca "biblio" → filtra para Biblioteca, Enter abre sheet.
- **Library / Task History com replay** (item "Biblioteca" da sidebar):
  * Prisma já tinha Task + EventRow. Novo `/api/tasks/history` (GET lista com _count events/artifacts, GET ?id= retorna task completa com events parseados de JSON payload + messages + artifacts).
  * `/api/tasks` PATCH adicionado para update de status/summary/finishedAt.
  * `use-agent-runner.ts` atualizado: task path agora POST /api/tasks (persiste server-side, retorna taskId real) + PATCH ao completar com summary do LLM. Tasks executadas agora aparecem no History.
  * `LibrarySheet` component: lista de tasks com search, status badges coloridos, meta (data, duração, eventos, artefatos, modo). Click → abre replay view com: stats (passos/eventos/créditos), event display formatado por tipo (TERMINAL/BROWSER/FILE/THINKING/STEP_COMPLETED), scrubber com play/pause/rewind/forward + auto-advance (600ms/event), lista de artefatos.
  * Fix: fetchedRef resetado on close para refetch ao reabrir; auto-advance via setTimeout evita setState síncrono no effect.
  * Verificado: task "Crie uma landing page" executada → persistiu (26 eventos, status completed, summary LLM) → Library mostra → replay abre com scrubber funcional.
- **Plugins marketplace** (item "Plugins" da sidebar):
  * `PluginsSheet` component: 12 plugins (Navegador Chromium, Terminal Bash, Editor Monaco, Exa AI, Google Drive, OneDrive, Figma, GitHub, Slack, Notion, Gmail, Calendar) com categoria, ícone emoji, descrição, toggle on/off, badges Beta/Ativo.
  * Filtro por categoria (Todos/Navegação/Execução/Pesquisa/etc).
  * Contador "X de Y plugins ativos".
  * Badge "3/12" no item da sidebar.
  * Verificado: abre, mostra 12 plugins, 3 ativos, filtros funcionam.
- **Theme toggle (dark/light)**:
  * `ThemeProvider` refatorado: lazy initializer lê localStorage, effect aplica `.dark` OU `.light` class no <html>, persiste em localStorage.
  * CSS: `.light` class com palette light completa (#fafafa bg, #0d0d0f text, #0891b2 brand). `:root:not(.dark)` não funcionava (Tailwind v4 stripped) → trocado para `.light` class.
  * Botão Sun/Moon no header. Command palette tem "Alternar tema".
  * Verificado: toggle → background muda de #0d0d0f para #fafafa, texto legível, VLM confirmou light theme correto.
- **Message actions** (copy/regenerate/feedback):
  * `MessageActions` component em messages.tsx: aparece on hover (opacity-0 → group-hover:opacity-100) em mensagens de assistant completas.
  * 4 ações: Copiar (com feedback "Copiado"), Regenerar, ThumbsUp, ThumbsDown (com state toggle colorido).
  * Verificado: DOM mostra botões Copiar/Regenerar/Boa resposta/Resposta ruim.
- Lint limpo. Dev log sem erros runtime.

Stage Summary:
- **5 features novas**: Command Palette (⌘K), Library/History com replay completo, Plugins marketplace, theme toggle dark/light, message actions.
- **2 APIs novas**: /api/tasks/history (GET lista + GET por id), /api/tasks PATCH.
- **Persistência real**: tasks agora são salvas no DB ao executar (POST /api/tasks) e atualizadas ao completar (PATCH), com events + summary do LLM. History mostra tarefas reais com replay funcional.
- Verificado end-to-end com agent-browser + VLM: palette search/filtro, library lista+replay+scrubber, plugins marketplace, theme toggle (light confirmado via VLM), message actions no DOM.
- Stack: Next.js 16 (3000) + event-stream (3003/3004) + Prisma/SQLite + 9 APIs.

Unresolved / próximos passos:
- O cron job webDevReview continua a cada 15 min — próximas rodadas podem: conectar Browserless real, comand palette com search de tarefas do histórico, mais variações de BrowserMock, i18n (EN/PT), onboarding tour, página /blog e /changelog com content real, share dialog funcional, keyboard navigation dentro do computer panel, accessibility audit (aria-labels, focus traps).
- Regenerar message action é stub (não re-executa o LLM) — pode ser wired ao /api/chat.
- Sandbox Docker / OAuth / Stripe continuam como stubs.
