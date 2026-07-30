# OmniNinja — Tutorial completo de deploy no Ubuntu (AWS)

> Plataforma de agente de IA autônomo **igual ao Manus AI**, rodando no seu
> próprio Ubuntu na AWS, servindo **várias pessoas** ao mesmo tempo, sem
> depender do serviço Browserless — o navegador (Chromium) roda **local** no
> próprio servidor. A camada de inteligência usa **suas chaves OpenRouter**
> (Claude, GPT, Kimi, Grok, Gemini) com fallback automático entre modelos.

Este tutorial assume uma instância **Ubuntu 22.04 ou 24.04 LTS** na AWS
(EC2, t3.medium ou maior recomendado — 2 vCPU / 4 GB RAM no mínimo) com
acesso SSH e um usuário com `sudo`. Funciona igual em qualquer VPS Ubuntu.

---

## Sumário

1. [O que você vai ter no final](#1-o-que-você-vai-ter-no-final)
2. [Arquitetura (como fica igual ao Manus)](#2-arquitetura-como-fica-igual-ao-manus)
3. [Pré-requisitos na AWS](#3-pré-requisitos-na-aws)
4. [Instalação rápida (um comando)](#4-instalação-rápida-um-comando)
5. [Instalação manual passo a passo](#5-instalação-manual-passo-a-passo)
6. [Configurar o .env (chaves e domínio)](#6-configurar-o-env-chaves-e-domínio)
7. [Rodar em produção (systemd)](#7-rodar-em-produção-systemd)
8. [HTTPS com Caddy (domínio real)](#8-https-com-caddy-domínio-real)
9. [Servir várias pessoas ao mesmo tempo](#9-servir-várias-pessoas-ao-mesmo-tempo)
10. [Segurança e isolamento multiusuário](#10-segurança-e-isolamento-multiusuário)
11. [Operação do dia a dia](#11-operação-do-dia-a-dia)
12. [Troubleshooting](#12-troubleshooting)
13. [Mapeamento Manus ↔ OmniNinja](#13-mapeamento-manus--omnininja)

---

## 1. O que você vai ter no final

Um site/app web (estilo `manus.im`) que:

- Tem **landing page** com hero, modos (Chat / Agent / Agent MAX), pricing, FAQ.
- Tem **workspace** com chat à esquerda e um painel **"Computador"** à direita
  que mostra, em tempo real, o que o agente está fazendo: abas **Código**,
  **Pré-visualizar**, **Navegador** (com screenshots reais do Chromium) e
  **Terminal** (com saída real de comandos).
- Roda um **agent loop real** (analisar → escolher ferramenta → executar →
  iterar), igual ao Manus, decidindo sozinho qual ferramenta usar a cada passo.
- Executa **comandos de shell de verdade** num sandbox isolado por tarefa.
- Abre um **Chromium real** no servidor e navega, clica, digita, tira screenshot.
- Busca na web, cria arquivos, expõe portas.
- Usa **seus créditos OpenRouter** (você mandou 5 chaves) com fallback entre
  Claude/GPT/Kimi/Grok/Gemini automaticamente se um modelo falhar.
- Persiste usuários, tarefas, mensagens e um **event stream** (replay) em SQLite.
- Servindo para **múltiplos usuários** simultâneos, cada um com workspace isolado.

---

## 2. Arquitetura (como fica igual ao Manus)

O Manus original é, no fundo, três peças (descritas no dossiê técnico que você
forneceu): (a) uma **camada de orquestração** sobre modelos de terceiros
(principalmente Claude), (b) uma **máquina virtual Linux isolada por tarefa**,
e (c) um **loop de agente** com ~29 ferramentas. O OmniNinja replica exatamente
essas três peças, só que em vez de micro-VMs na AWS, usa **workspaces de
diretório isolados por tarefa** dentro do seu Ubuntu — o que é mais simples de
operar e consome menos memória por tarefa.

```
                   ┌─────────────────────────────────────────────┐
   Usuários ──────►│  Caddy (HTTPS, :443)                         │
   (navegador)     │  proxy reverso → Next.js :3000              │
                   └───────────────┬─────────────────────────────┘
                                   │
                   ┌───────────────▼─────────────────────────────┐
                   │  Next.js 16 (app OmniNinja)                 │
                   │  - Landing + Workspace + painel Computador  │
                   │  - /api/chat       → OpenRouter (streaming) │
                   │  - /api/agent/run  → Agent Loop (SSE)       │
                   │  - /api/tasks, /api/credits, /api/me ...    │
                   │  - Prisma + SQLite (usuários, tarefas)      │
                   └───┬───────────────┬───────────────┬─────────┘
                       │               │               │
            ┌──────────▼──┐   ┌────────▼─────┐  ┌─────▼──────────────┐
            │ OpenRouter  │   │ Shell Agent  │  │ Browser Agent      │
            │ (5 modelos, │   │ (bash/python │  │ (Chromium LOCAL    │
            │  fallback)  │   │  /node real) │  │  via Playwright)   │
            └─────────────┘   └──────────────┘  └────────────────────┘
                                    │                    │
                            ┌───────▼────────┐   ┌───────▼──────────┐
                            │ /opt/omnininja │   │ context isolado  │
                            │ /workspaces/   │   │ por tarefa       │
                            │   <taskId>/    │   │ (cookies/storage)│
                            └────────────────┘   └──────────────────┘

            ┌──────────────────────────────┐
            │ Event Stream (Socket.io)     │  porta 3003
            │ canal task:<id> em tempo real│  (replay do que o agente fez)
            └──────────────────────────────┘
```

O **agent loop** (arquivo `src/lib/agent-loop.ts`) é o coração: a cada iteração
ele manda o histórico + a observação da última ação para o LLM (via OpenRouter),
o LLM devolve **um JSON descrevendo a próxima ferramenta**, o loop executa essa
ferramenta (shell, browser, arquivo, busca, deploy), emite um evento para o
painel, e repete — exatamente o padrão "thought → tool call → observation" do
Manus, descrito na Seção 5 do dossiê.

---

## 3. Pré-requisitos na AWS

1. **Instância EC2** Ubuntu 22.04 ou 24.04 LTS. Recomendação:
   - **t3.medium** (2 vCPU, 4 GB) — roda bem para ~5–10 usuários simultâneos
     leves. Cada tarefa de agente abre um Chromium, que é a parte que mais
     consome RAM (~150–300 MB por contexto de browser).
   - **t3.large / t3.xlarge** (8–16 GB) — para dezenas de usuários simultâneos.
2. **Grupo de segurança** (Security Group) liberando:
   - **22** (SSH) — só para você.
   - **80** e **443** (HTTP/HTTPS) — para os usuários.
   - (A porta 3000 fica interna, só o Caddy expõe 80/443.)
3. **Elastic IP** (recomendado) para o IP não mudar a cada reboot.
4. **Domínio** (opcional mas recomendado) apontando um registro A para o IP,
   para HTTPS funcionar. Ex.: `omnininja.seudominio.com`.
5. **Disco**: 30 GB é suficiente para começar (Chromium + dependências +
   workspaces crescem conforme o uso; limpe workspaces antigos periodicamente).

### Conectar

```bash
ssh -i sua-chave.pem ubuntu@SEU-IP
```

> Os comandos abaixo assumem que você está logado e tem `sudo`. Tudo é
> instalado sob `/opt/omnininja` com um usuário de serviço `omnininja`.

---

## 4. Instalação rápida (um comando)

Suba os arquivos do projeto para o servidor (via `scp`, `rsync` ou `git clone`
do seu GitHub) e rode o instalador:

```bash
# 1) Transfira o projeto para o servidor (na sua máquina local):
scp -i sua-chave.pem -r omnininja ubuntu@SEU-IP:~/

# 2) No servidor, rode o instalador:
ssh -i sua-chave.pem ubuntu@SEU-IP
cd ~/omnininja
sudo bash install.sh
```

O `install.sh` faz **tudo**: instala Bun, Node 20, dependências de sistema,
Chromium, copia o código para `/opt/omnininja/app`, configura o `.env`, instala
as dependências Node, gera o Prisma, faz o build e cria os serviços systemd.
Ao final ele te diz exatamente o que editar e como iniciar.

Se preferir entender cada passo, siga a seção manual abaixo.

---

## 5. Instalação manual passo a passo

### 5.1 — Pacotes de sistema

```bash
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  curl wget git unzip ca-certificates gnupg build-essential python3 python3-pip \
  jq sqlite3 rsync \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 fonts-liberation xdg-utils
```

As bibliotecas `libnss3`, `libgbm1` etc. são **necessárias para o Chromium
rodar** em modo headless no Ubuntu. Sem elas o Playwright lança o browser mas
ele quebra na primeira navegação.

### 5.2 — Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # deve mostrar v20.x
```

### 5.3 — Bun (runtime JavaScript rápido, usado pelo projeto)

```bash
curl -fsSL https://bun.sh/install | bash
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
bun --version   # ex.: 1.3.x
```

### 5.4 — Usuário de serviço e diretórios

```bash
sudo useradd --system --create-home --shell /bin/bash omnininja
sudo mkdir -p /opt/omnininja/{data,workspaces,logs,.cache/ms-playwright}
sudo chown -R omnininja:omnininja /opt/omnininja
```

Por que um usuário dedicado? O Next.js e o Chromium **não rodam como root**
(o Chromium recusa `--no-sandbox` só sob root sem flags extras, e rodar
serviços web como root é péssima prática de segurança). O usuário `omnininja`
fica isolado do resto do sistema.

### 5.5 — Copiar o código e instalar dependências

```bash
# Transfira a pasta omnininja/ para o servidor (via scp/git) e então:
sudo rsync -a --exclude node_modules --exclude .next --exclude .git \
  /home/ubuntu/omnininja/ /opt/omnininja/app/
sudo chown -R omnininja:omnininja /opt/omnininja/app
cd /opt/omnininja/app

# Instala como o usuário do serviço
sudo -u omnininja bash -lc '
  export HOME=/opt/omnininja
  export PLAYWRIGHT_BROWSERS_PATH=/opt/omnininja/.cache/ms-playwright
  cd /opt/omnininja/app
  bun install
  bun run db:generate
  bun run db:push
  bunx playwright install chromium
  bun run build
'
```

`bunx playwright install chromium` baixa o Chromium (~130 MB) para
`/opt/omnininja/.cache/ms-playwright`. Ele é **compartilhado entre todos os
usuários/tasks** — não é baixado de novo a cada tarefa, o que é crucial para
rodar para várias pessoas sem desperdiçar disco.

### 5.6 — Build de produção

O `bun run build` (já incluído acima) gera a versão standalone em
`.next/standalone`. O comando `bun run start` sobe o server de produção a
partir dela. O build usa `output: "standalone"` no `next.config.ts`, então o
servidor final é um único `server.js` + assets, sem precisar de `node_modules`
inteiro em runtime.

---

## 6. Configurar o .env (chaves e domínio)

O arquivo `/opt/omnininja/app/.env` é o coração da configuração. Edite-o:

```bash
sudo -u omnininja nano /opt/omnininja/app/.env
```

Conteúdo (já vem pré-preenchido com suas chaves OpenRouter do arquivo `apis`):

```dotenv
# Banco SQLite (caminho absoluto no Ubuntu)
DATABASE_URL=file:/opt/omnininja/data/custom.db

# ---- 4 chaves OpenRouter + 1 chave Google AI Studio ----
# Claude, GPT, Kimi e Grok usam OpenRouter (formato sk-or-v1-...).
OPENROUTER_CLAUDE_API_KEY=sk-or-v1-YOUR_CLAUDE_KEY_HERE
OPENROUTER_CHATGPT_API_KEY=sk-or-v1-YOUR_CHATGPT_KEY_HERE
OPENROUTER_KIMI_API_KEY=sk-or-v1-YOUR_KIMI_KEY_HERE
OPENROUTER_GROK_API_KEY=sk-or-v1-YOUR_GROK_KEY_HERE
# Gemini usa a API NATIVA do Google AI Studio (chave começa com "AIza" ou "AQ.").
# NÃO é uma chave OpenRouter — o código detecta o prefixo e roteaia direto para
# generativelanguage.googleapis.com sem passar pelo OpenRouter.
OPENROUTER_GEMINI_API_KEY=AQ.SUA_CHAVE_GOOGLE_AI_STUDIO_AQUI

# Provedor padrão do orquestrador e do chat
OMNININJA_DEFAULT_MODEL=claude

# ---- Navegador (Chromium LOCAL, sem Browserless) ----
PLAYWRIGHT_CHROMIUM_EXECUTABLE=
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=/opt/omnininja/.cache/ms-playwright

# ---- Workspaces dos agentes ----
OMNININJA_WORKSPACE_ROOT=/opt/omnininja/workspaces
OMNININJA_PUBLIC_BASE=https://omnininja.seudominio.com

# ---- App (URLs públicas) ----
NEXT_PUBLIC_APP_URL=https://omnininja.seudominio.com
NEXT_PUBLIC_API_URL=https://omnininja.seudomininja.com
NEXT_PUBLIC_WS_URL=wss://omnininja.seudomininja.com

# ---- Auth ----
AUTH_SECRET=<string-aleatoria-longa-gerada-com-openssl-rand-hex-32>
```

**Pontos importantes do .env:**

- **OpenRouter (4 modelos) + Google AI Studio (Gemini)**: cada uma das 4
  primeiras chaves (`sk-or-v1-...`) dá acesso a um provedor via OpenRouter
  (Claude, GPT, Kimi, Grok). A chave do Gemini é diferente: ela começa com
  `AQ.` (ou `AIza`), que é o formato **nativo do Google AI Studio**, **não**
  do OpenRouter. O código em `src/lib/openrouter.ts` detecta esse prefixo com
  a função `isGoogleKey()` e roteia o Gemini **direto** para a API nativa do
  Google (`generativelanguage.googleapis.com/v1beta/`), usando o modelo
  `gemini-flash-latest`. Por isso a variável se chama `OPENROUTER_GEMINI_API_KEY`
  (por compatibilidade com o nome), mas o tráfego do Gemini nunca passa pelo
  OpenRouter. Se o Claude falhar (rate limit, 5xx, 402), o `agent-loop` e o
  `/api/chat` tentam automaticamente o GPT, depois Kimi, Grok, Gemini — na
  ordem das chaves presentes. Esse fallback é o que dá robustez para servir
  várias pessoas sem travar quando um modelo cai.
- **Modelos usados** (validados e funcionando com suas chaves):
  - Claude → `anthropic/claude-sonnet-4` (OpenRouter)
  - ChatGPT → `openai/gpt-4o` (OpenRouter)
  - Kimi → `moonshotai/kimi-k2` (OpenRouter)
  - Grok → `x-ai/grok-4.3` (OpenRouter)
  - Gemini → `gemini-flash-latest` (Google AI Studio nativo)
- **Limite de tokens (free tier)**: suas chaves são do plano gratuito do
  OpenRouter, que limita `max_tokens` a **256** para Claude/Grok e **800**
  para Kimi/GPT. O código já usa `maxTokens: 256` por padrão e tem resiliência
  anti-402: se um provedor retornar 402 (créditos insuficientes para o
  tamanho pedido), ele re-tenta automaticamente com `max_tokens` menor
  (800 → 256) antes de fazer fallback para o próximo provedor.
- **PLAYWRIGHT_CHROMIUM_EXECUTABLE**: deixe vazio para usar o Chromium que o
  `playwright install` baixou. Se preferir o Chromium do apt
  (`apt install chromium-browser`), aponte para `/usr/bin/chromium`.
- **PLAYWRIGHT_HEADLESS=true**: em servidor, sempre headless. (Em `false` ele
  tentaria abrir uma janela gráfica, que não existe num servidor sem X.)
- **AUTH_SECRET**: gere um com `openssl rand -hex 32` e cole. O `install.sh`
  já faz isso automaticamente se você usar ele.

---

## 7. Rodar em produção (systemd)

O `install.sh` já cria dois serviços systemd. Se instalou manualmente, crie-os:

### 7.1 — Serviço do app (Next.js, porta 3000)

Crie `/etc/systemd/system/omnininja.service`:

```ini
[Unit]
Description=OmniNinja — Agente de IA autônomo (estilo Manus)
After=network.target

[Service]
Type=simple
User=omnininja
Group=omnininja
WorkingDirectory=/opt/omnininja/app
EnvironmentFile=/opt/omnininja/app/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=HOME=/opt/omnininja
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/omnininja/.cache/ms-playwright
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/omnininja/logs/omnininja.log
StandardError=append:/opt/omnininja/logs/omnininja.err

[Install]
WantedBy=multi-user.target
```

### 7.2 — Serviço do event-stream (Socket.io, porta 3003)

Crie `/etc/systemd/system/omnininja-event-stream.service`:

```ini
[Unit]
Description=OmniNinja — Event Stream (Socket.io gateway)
After=network.target omnininja.service

[Service]
Type=simple
User=omnininja
Group=omnininja
WorkingDirectory=/opt/omnininja/app/mini-services/event-stream
Environment=HOME=/opt/omnininja
ExecStart=/usr/local/bin/bun run dev
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/omnininja/logs/event-stream.log
StandardError=append:/opt/omnininja/logs/event-stream.err

[Install]
WantedBy=multi-user.target
```

### 7.3 — Ativar e iniciar

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now omnininja omnininja-event-stream
sudo systemctl status omnininja
```

Teste rápido:

```bash
curl -s http://localhost:3000 | head -20        # página HTML do app
curl -s http://localhost:3000/api/me            # usuário demo + provedores
curl -s http://localhost:3003/                   # handshake socket.io
```

Se o `/api/me` responder um JSON com `user` e `providers`, está tudo certo.
Acesse pelo navegador em `http://SEU-IP:3000` (ou pelo domínio após o passo 8).

---

## 8. HTTPS com Caddy (domínio real)

Para servir várias pessoas de forma séria, você quer HTTPS e um domínio. O
**Caddy** é o caminho mais simples — ele pede e renova certificados Let's
Encrypt automaticamente.

### 8.1 — Instalar Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 8.2 — Configurar o Caddyfile

Edite `/etc/caddy/Caddyfile` (substitua pelo seu domínio):

```caddy
omnininja.seudominio.com {
    # WebSocket do event-stream (porta 3003) — roteia pela query XTransformPort
    @ws_event query XTransformPort=*
    handle @ws_event {
        reverse_proxy localhost:{query.XTransformPort}
    }

    # Tudo else -> app Next.js (porta 3000)
    reverse_proxy localhost:3000
}
```

> O projeto usa o padrão `io("/?XTransformPort=3003")` no frontend para
> conectar o Socket.io através do mesmo domínio do app. O Caddyfile acima
> honra esse roteamento: qualquer requisição com `?XTransformPort=3003` vai
> para o gateway de eventos, o resto vai para o Next.js. Assim você precisa
> de **um único domínio e uma única porta (443)** para tudo.

### 8.3 — Reiniciar e validar

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

Aponte o DNS do seu domínio (registro A) para o IP da instância, espere
propagar, e acesse `https://omnininja.seudominio.com`. O Caddy emite o
certificado automaticamente no primeiro acesso. Atualize o `.env` para usar
`https://omnininja.seudominio.com` nas variáveis `NEXT_PUBLIC_*` e
`OMNININJA_PUBLIC_BASE`, depois `sudo systemctl restart omnininja`.

**Sem domínio?** Você pode rodar só com IP + porta 80 editando o Caddyfile
para `:80 { reverse_proxy localhost:3000 }` (sem HTTPS). Funciona, mas o
WebSocket pode precisar de `ws://` em vez de `wss://` no `.env`.

---

## 9. Servir várias pessoas ao mesmo tempo

O OmniNinja já nasce multiusuário. Aqui estão os mecanismos que fazem isso
funcionar sem um usuário atrapalhar o outro:

### 9.1 — Por usuário

- **Autenticação**: o `/api/auth/*` (login, registro, logout, me) cria sessões
  com cookie `httpOnly`. Cada usuário tem seu próprio `id`, `tier` (Free/Pro/
  Business), `credits` e `defaultModel`. O `getCurrentUser()` em `src/lib/auth.ts`
  resolve o usuário a partir do cookie em toda rota protegida.
- **Banco**: o schema Prisma (`User`, `Task`, `Message`, `EventRow`,
  `CreditTransaction`) é todo relacional por `userId`. Nenhuma rota expõe dados
  de outro usuário — o `getCurrentUser()` filtra tudo.

### 9.2 — Por tarefa (sandbox do agente)

Quando um usuário dispara uma tarefa (modo Agent), o `/api/agent/run` cria uma
`Task` no banco com um `id` único e o agent loop trabalha **num diretório
próprio**:

```
/opt/omnininja/workspaces/<taskId>/
    package.json
    ... (arquivos que o agente cria)
```

Cada comando `shell_exec` roda com `cwd` nesse diretório e `HOME` apontado para
ele, então `npm install` de um usuário não polui o cache de outro. O
`file_write`/`file_read` bloqueia path traversal (só caminhos relativos dentro
do workspace da task), então um agente não consegue ler `/etc/passwd` ou o
workspace de outra task.

### 9.3 — Por navegador (contexto isolado)

O `browser-agent.ts` cria **um `BrowserContext` novo por tarefa** (não por
usuário, porque uma task pode precisar de vários tabs). Cada context tem seus
próprios cookies, localStorage e cache — então se o usuário A faz login num
site dentro do agente, o usuário B não herda essa sessão. O browser singleton
(`chromium.launch`) é **reutilizado** entre tasks (lançar Chromium é caro),
mas os contexts são descartados ao fim de cada tarefa.

### 9.4 — Concorrência

- O Next.js em modo standalone (`bun run start`) é single-process mas
  **assíncrono** — múltiplas requisições são tratadas em paralelo pela event
  loop. Vários usuários podem chatar simultaneamente sem problema.
- As tarefas de agente rodam como **SSE de longa duração** (`/api/agent/run`,
  `maxDuration = 300s`). Cada uma mantém seu próprio loop. Em servidores
  pequenos, limite tarefas simultâneas via o sistema de créditos (cada tarefa
  consome créditos) e/ou via um semáforo simples no `agent-loop` se precisar.
- Para escalar muito (centenas de usuários), coloque **PM2** ou múltiplas
  instâncias atrás de um load balancer, e troque o SQLite por PostgreSQL
  (`DATABASE_URL=postgresql://...` — o Prisma suporta nativamente, só mudar o
  `provider` no `schema.prisma`).

### 9.5 — Limitar o número de tarefas simultâneas (opcional)

Para evitar que o Chromium consuma toda a RAM num servidor pequeno, você pode
limitar tarefas de agente concorrentes. A forma mais simples é um semáforo no
processo. Um jeito rápido sem mexer no código: limitar via systemd o número
de processos filhos:

```ini
# em /etc/systemd/system/omnininja.service, na seção [Service]:
LimitNPROC=200
```

Isso limita o total de processos (cada Chromium lança vários). Ajuste conforme
a RAM disponível.

---

## 10. Segurança e isolamento multiusuário

Rodar um agente que executa shell arbitrário para várias pessoas no mesmo
servidor exige cuidado. O modelo do OmniNinja (diretório por task + bloqueio
de path traversal + context de browser isolado) é seguro para **uso confiável**
(usuários que você conhece, ou com autenticação). Para uso totalmente
desconfiado (público anônimo), adicione as camadas abaixo.

### 10.1 — Isolamento de UID por task (recomendado)

Rode cada `shell_exec` dentro de um **user namespace** Linux, mapeando para um
UID não-privilegiado único, via `unshare`:

```bash
# dentro do agent loop, em vez de exec direto:
unshare --user --map-root-user --pid --fork --mount-proc \
  chroot /opt/omnininja/workspaces/<taskId> /bin/bash -c "<comando>"
```

Isso dá a cada task um PID namespace e filesystem isolado, parecido com um
container leve, sem precisar do Docker. Para habilitar isso no
`shell-agent.ts`, troque o `execAsync(cmd, { cwd })` por um wrapper que prefixa
o comando com `unshare`. (O código atual usa diretório-isolado, que já bloqueia
acesso cruzado via path traversal; o `unshare` é a camada extra para desconfiado.)

### 10.2 — Docker por task (isolamento máximo)

Se quiser replicar exatamente o modelo do Manus (VM/container por tarefa),
gere uma imagem Docker base e lance um container por task:

```bash
# no shell-agent, em vez de exec direto no host:
docker run --rm -v /opt/omnininja/workspaces/<taskId>:/workspace \
  -w /workspace omnininja-sandbox bash -c "<comando>"
```

Isso dá isolamento total de processo, rede e filesystem. Exige Docker instalado
e o usuário `omnininja` no grupo `docker`. É mais pesado por task (~50–100 MB
de overhead) mas é o padrão de segurança mais forte.

### 10.3 — Outras boas práticas

- **Rate limiting**: use o Caddy com `rate_limit` ou um middleware no Next.js
  para limitar requisições por IP/usuário (evita abuso do orçamento OpenRouter).
- **Firewall de saída**: o agente pode navegar em qualquer site. Se quiser
  restringir, use `iptables`/`ufw` ou um proxy de saída com allowlist.
- **Segredos**: o `.env` tem permissão `600` (só o usuário `omnininja` lê).
  Nunca faça commit dele. O `.gitignore` já o exclui.
- **Backups do SQLite**: `sqlite3 /opt/omnininja/data/custom.db .backup
  /backup/omnininja-$(date +%F).db` num cron diário.
- **Atualizações**: `sudo apt update && sudo apt upgrade -y` regularmente,
  especialmente o Chromium (vulnerabilidades de browser são críticas).

---

## 11. Operação do dia a dia

```bash
# Status dos serviços
sudo systemctl status omnininja omnininja-event-stream

# Logs em tempo real
sudo journalctl -u omnininja -f
sudo journalctl -u omnininja-event-stream -f
# ou os arquivos:
sudo tail -f /opt/omnininja/logs/omnininja.log

# Reiniciar após mudar .env
sudo systemctl restart omnininja omnininja-event-stream

# Atualizar o código (após git pull / nova versão)
cd /opt/omnininja/app
sudo -u omnininja bash -lc 'cd /opt/omnininja/app && git pull && bun install && bun run build'
sudo systemctl restart omnininja

# Limpar workspaces antigos (libera disco) — remove tasks com > 7 dias
sudo find /opt/omnininja/workspaces -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

# Backup do banco
sudo sqlite3 /opt/omnininja/data/custom.db ".backup '/opt/omnininja/data/backup-$(date +%F).db'"

# Ver quantas tasks/workspaces existem
sudo ls /opt/omnininja/workspaces | wc -l
sudo sqlite3 /opt/omnininja/data/custom.db "SELECT status, COUNT(*) FROM Task GROUP BY status;"

# Ver uso de RAM do Chromium (monitorar para dimensionar a instância)
ps aux | grep -i chrom | awk '{sum+=$6} END {print "Chromium RSS total: " sum/1024 " MB"}'
```

---

## 12. Troubleshooting

**O Chromium não abre / erro "Host system is missing dependencies"**
Rode `sudo bunx playwright install-deps chromium` (ou instale as libs da seção
5.1 manualmente). Verifique `PLAYWRIGHT_BROWSERS_PATH` no .env aponta para onde
o browser foi baixado.

**Erro "Executable doesn't exist at .../chromium-XXXX/chrome"**
O `PLAYWRIGHT_CHROMIUM_EXECUTABLE` no .env pode estar apontando para um caminho
errado. Deixe vazio para o Playwright resolver automaticamente, ou aponte para
o `chrome` dentro de `.cache/ms-playwright/chromium-XXXX/`.

**`/api/chat` devolve "Sem chave configurada para claude"**
O `.env` não tem `OPENROUTER_CLAUDE_API_KEY` (ou a que está lá está inválida).
Verifique com `sudo -u omnininja grep OPENROUTER /opt/omnininja/app/.env`. O
seletor de modelo só mostra provedores com chave; o fallback só funciona entre
provedores que têm chave.

**Erro 402 "insufficient credits" do OpenRouter**
Suas chaves são do plano gratuito, que limita `max_tokens`. Se aparecer 402,
o código já faz re-tenta com `max_tokens` menor (800 → 256) antes do fallback.
Se mesmo assim persistir, um provedor pode estar sem créditos livres — o
fallback pula para o próximo automaticamente. Para evitar de cara, o
`maxTokens` padrão já é 256 (chat e agent-loop).

**Gemini retorna "model is no longer available to new users"**
Modelos `gemini-2.5-flash` e `gemini-2.5-flash-lite` foram descontinuados para
novos usuários. O código usa `gemini-flash-latest`, que aponta sempre para a
versão Flash mais recente disponível. Se o Google desativar esse alias no
futuro, troque por outro modelo válido em `src/lib/openrouter.ts` (constante
`GOOGLE_MODEL`).

**Grok retorna 404 "deprecated"**
O modelo `x-ai/grok-4` foi descontinuado (xAI recomenda `grok-4.3`). O código
já usa `x-ai/grok-4.3` (com ponto, não hífen — `grok-4-3` dá erro 400 de "ID
inválido"). Se xAI desativar o 4.3, troque em `src/lib/openrouter.ts`
(`OPENROUTER_MODELS.grok.openrouterModel`).

**"A chave do Gemini não funciona no OpenRouter"**
Isso é esperado: a chave `AQ.YOUR_GEMINI...` **não é** uma chave OpenRouter, é uma
chave nativa do Google AI Studio. O código detecta o prefixo `AQ.`/`AIza` e
chama a API do Google diretamente. Não tente usá-la no site do OpenRouter.

**WebSocket não conecta (painel Computador não atualiza em tempo real)**
- Se usa Caddy: confirme que o `Caddyfile` tem o bloco `@ws_event` da seção 8.2.
- Se acessa por IP sem HTTPS: mude `NEXT_PUBLIC_WS_URL` para `ws://SEU-IP:3000`
  (não `wss://`).
- Confirme que o serviço `omnininja-event-stream` está rodando
  (`sudo systemctl status omnininja-event-stream`).

**Tarefa de agente fica travada / não termina**
Veja o log: `sudo journalctl -u omnininja -f` enquanto executa. O loop tem
limite de 20 iterações (`MAX_ITERATIONS` em `agent-loop.ts`) — se o modelo
ficar em loop sem usar `finish`, ele para sozinho com um resumo. Aumente o
limite se precisar de tarefas mais longas.

**RAM acabando com vários usuários**
Cada context de Chromium usa ~150–300 MB. Para t3.medium (4 GB), limite a ~8
tasks de navegador simultâneas. Opções: subir para t3.large, adicionar swap
(`sudo fallocate -l 4G /swapfile && sudo mkswap /swapfile && sudo swapon
/swapfile`), ou limitar com `LimitNPROC` no systemd (seção 9.5).

**Build quebra com erro de TypeScript**
O `next.config.ts` tem `typescript.ignoreBuildErrors: true`, então erros de
tipo não deveriam parar o build. Se mesmo assim parar, rode `bun run lint` para
ver os avisos. Para builds limpos em CI, remova o `ignore` temporariamente.

---

## 13. Mapeamento Manus ↔ OmniNinja

Para você ver exatamente onde cada peça do Manus está no OmniNinja:

| Manus (dossiê) | OmniNinja (este projeto) | Arquivo |
|---|---|---|
| Camada de orquestração sobre Claude | OpenRouter (Claude/GPT/Kimi/Grok/Gemini) com fallback | `src/lib/openrouter.ts` |
| Agent Loop (thought → tool → observation) | Loop idêntico, JSON de tool call por iteração | `src/lib/agent-loop.ts` |
| VM Ubuntu isolada por tarefa | Diretório isolado por task + (opcional) unshare/Docker | `src/lib/shell-agent.ts` |
| Chromium real dentro da VM (não headless) | Chromium real via Playwright (headless no servidor) | `src/lib/browser-agent.ts` |
| 29 ferramentas (shell, browser, file, search, deploy) | 15 ferramentas implementadas (mesma categoria) | `agent-loop.ts` switch |
| `info_search_web` | `searchWeb()` via DuckDuckGo HTML | `agent-loop.ts` |
| `deploy_expose_port` | `exposePort()` | `shell-agent.ts` |
| Event Stream / replay | Socket.io gateway + EventRow append-only | `mini-services/event-stream/`, `prisma/schema.prisma` |
| System prompt vazado (regras de comportamento) | SYSTEM_PROMPT no agent-loop (regras espelhadas) | `agent-loop.ts` |
| Créditos por ação (Free/Pro/Business) | Mesmo sistema de créditos | `src/lib/credits.ts` |
| Painel "Computador" (Código/Preview/Browser/Terminal) | Painel idêntico com abas e screenshots reais | `src/components/omninja/computer-panel.tsx` |
| Landing page (modos, pricing, FAQ) | Landing page completa em PT-BR | `src/components/omninja/landing.tsx` |
| Infra AWS (micro-VM, ~5 MiB, boot 125ms) | Ubuntu EC2 + workspaces por diretório (mais simples) | este tutorial |

As peças que o Manus tem e o OmniNinja **não** replica por padrão: micro-VMs
com boot de 125ms (precisaria de Firecracker/Kata Containers — veja seção 10
para isolamento equivalente), Wide Research (100+ subagentes em paralelo —
passível de adicionar spawnando múltiplos `runAgentLoop` em paralelo), e os
connectors (Gmail/Slack/Notion — stubs no `sheets.tsx`). Tudo o resto do
produto (orquestração, sandbox, browser, loop, painel, créditos, landing) está
presente e funcional.

---

*Última atualização: julho de 2026. Baseado no dossiê técnico do Manus
(`manus-ai-dossie-completo.md`) e no código-fonte do OmniNinja extraído do
workspace fornecido.*
