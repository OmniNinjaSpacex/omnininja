# Manus AI — Arquitetura Completa, VM Sandbox, Modelos de IA e Modelo de Negócio

> **Documento de pesquisa técnica e estratégica** — Tudo que descobrimos sobre o Manus AI para você construir sua empresa (OmniNinja) com a mesma arquitetura.

---

## 1. O Que É o Manus AI

O Manus AI é uma plataforma de agentes de IA autônomos lançada em março de 2025 pela Butterfly Effect (uma startup chinesa). Em apenas 8 meses, atingiu **$100 milhões em ARR (receita anual recorrente)**, processou **147 trilhões de tokens**, criou **mais de 80 milhões de computadores virtuais**, e emprega **105 pessoas**. A empresa levantou **$75 milhões** em rodada liderada pela Benchmark, alcançando valuation de centenas de milhões de dólares.

O Manus não é um modelo de IA próprio — é uma **camada de orquestração** por cima de modelos de terceiros. Ele usa o Claude 3.5/3.7 Sonnet da Anthropic e finetunes do Qwen da Alibaba como modelos de fundação, e construiu um sistema de agentes, sandboxes e ferramentas que transforma esses modelos em trabalhadores autônomos capazes de executar tarefas complexas de ponta a ponta.

A diferença entre o Manus e um chatbot comum (como o ChatGPT) é que o Manus **age**: ele abre um navegador, escreve código, executa comandos, cria arquivos, faz deploy de sites, e entrega resultados completos — tudo sozinho, numa máquina virtual isolada.

---

## 2. A Máquina Virtual (Sandbox) — Como Funciona

### 2.1 O Conceito

Cada tarefa no Manus roda numa **máquina virtual cloud totalmente isolada**. Isso é o coração da plataforma. Quando você pede "crie um site de receitas", o Manus não apenas escreve o código — ele cria uma VM Ubuntu completa, instala ferramentas, escreve os arquivos, serve o site numa porta, e te dá um link público.

A VM tem:
- **Sistema operacional completo** (Ubuntu 22.04)
- **Acesso à internet** (para baixar pacotes, chamar APIs, navegar)
- **Shell** (bash — pode instalar qualquer coisa com apt/pip/npm)
- **Navegador** (Chromium — para navegar na web, clicar, preencher formulários)
- **Filesystem** (cria, lê, edita arquivos)
- **Python, Node.js, e outras linguagens** pré-instaladas
- **Ciclo de vida sleep/awake** — a VM pode ser pausada e retomada

### 2.2 A Tecnologia: E2B + Firecracker

O Manus usa o **E2B** (e2b.dev) como infraestrutura de sandbox. O E2B por sua vez usa **Firecracker microVMs** — a mesma tecnologia que a AWS desenvolveu para o Lambda.

**Por que Firecracker e não Docker?**

O Manus testou Docker e rejeitou. Os motivos:

1. **Docker demora 10-20 segundos para iniciar** um container. Firecracker levanta uma microVM em **~150ms** — 100x mais rápido.
2. **Docker não é um OS completo.** Um container compartilha o kernel do host. Não dá para instalar pacotes de sistema, não dá para fazer `apt upgrade`, não dá para rodar serviços que precisam de init system. Firecracker é uma VM real com kernel próprio — **funcionalidade completa de OS**.
3. **Isolamento de segurança.** Firecracker usa KVM (hardware virtualization). Cada microVM é totalmente isolada do host e das outras microVMs. Docker compartilha o kernel — uma vulnerabilidade no kernel compromete todos os containers.

**E2B** é a camada que facilita tudo isso. Em vez de o Manus gerenciar Firecracker diretamente (complexo), eles usam o SDK do E2B que abstrai a criação de VMs, execução de código, filesystem, etc. O E2B também oferece **self-hosting** — você pode rodar o E2B na sua própria infraestrutura.

### 2.3 O Ciclo de Vida da VM

1. **Criação**: Quando uma tarefa começa, uma microVM é provisionada em ~150ms
2. **Execução**: O agente roda ferramentas (shell, browser, files) dentro da VM
3. **Sleep**: Se a tarefa precisa de input do usuário, a VM é pausada (sleep) — sem custo de compute
4. **Awake**: Quando o usuário responde, a VM é retomada (awake) — estado preservado
5. **Cleanup**: Quando a tarefa termina, a VM é destruída (ou arquivada se o usuário quiser revisitar)

### 2.4 Como o OmniNinja Replica Isso (no seu Ubuntu)

O seu Ubuntu AWS é uma **t3.small** (2 vCPUs, 2GB RAM). Isso **não suporta Firecracker/KVM** porque a AWS não permite nested virtualization em instâncias t3. Então precisamos de uma alternativa.

O OmniNinja usa **3 níveis de isolamento**, detectados automaticamente:

| Nível | Tecnologia | Isolamento | Disponibilidade |
|-------|-----------|------------|----------------|
| **2** | `unshare` + `proot` (namespace do kernel Linux) | PID, mount, net, user — máximo | Ubuntu 24.04 (kernel tem CONFIG_USER_NS) |
| **1** | `chroot` + `debootstrap` (Ubuntu base isolado) | Filesystem apenas | Qualquer Ubuntu com root |
| **0** | Diretório isolado por task | Workspace apenas | Sempre funciona (fallback) |

**Nível 2 (unshare + proot)** é o mais próximo do Firecracker sem precisar de KVM. O `unshare` cria namespaces do kernel Linux — o processo isolado não vê processos do host, não vê o filesystem do host, não vê a rede do host. O `proot` faz o chroot sem precisar de root real dentro do namespace (usando `ptrace` para traduzir syscalls de path).

**Nível 1 (chroot)** cria uma imagem Ubuntu mínima com `debootstrap` (~80MB) e cada task roda dentro dela via `chroot`. Isolamento de filesystem, mas não de PID/rede.

**Nível 0** é o fallback: cada task tem seu próprio diretório workspace, e os comandos rodam com `cwd` e `HOME` apontando para esse diretório. Sem isolamento forte, mas funcional.

O agente não sabe (nem precisa saber) qual nível está rodando — a interface é a mesma: `executeInSandbox(taskId, cmd)`.

---

## 3. O Agent Loop — Como o Manus Pensa e Age

### 3.1 O Loop Básico

O núcleo do Manus é um loop de iteração:

```
1. Analisar eventos (mensagens do usuário + ações anteriores + observações)
2. Selecionar UMA ferramenta para executar
3. Executar a ferramenta (shell, browser, file, etc.)
4. Observar o resultado
5. Iterar (voltar ao passo 1)
6. Quando terminar: submeter resultados
7. Entrar em standby (esperar mais input do usuário)
```

Cada iteração é uma chamada ao LLM (Claude/Qwen). O LLM recebe o histórico de eventos (contexto) e decide qual ferramenta chamar. A resposta é **uma única ação por iteração** — não várias.

### 3.2 CodeAct Paradigm

O Manus usa o **CodeAct** (Code Actions) — um paradigma do paper "Executable Code Actions Elicit Better LLM Agents" (ICML 2024). Em vez do LLM retornar chamadas de ferramenta em JSON (o formato tradicional), ele retorna **código Python executável** como a ação.

Vantagens do CodeAct:
- O LLM já sabe programar bem (foi treinado em muito código)
- Código é mais expressivo que JSON (loops, condicionais, variáveis)
- Permite composição de ferramentas numa única ação
- O feedback do interpretador Python é rico (tracebacks, valores de retorno)

No OmniNinja, usamos uma versão simplificada com JSON tool calls (mais fácil de parsear e mais robusto), mas o conceito é o mesmo: o LLM decide qual ferramenta usar a cada passo, executa, observa, e itera.

### 3.3 Os 29 Tools do Manus

O system prompt vazado do Manus define **29 ferramentas** organizadas em categorias:

**Comunicação:**
- `message_notify_user` — notifica o usuário de progresso
- `message_ask_user` — faz pergunta ao usuário (pausa a VM)

**Shell (execução na VM):**
- `shell_exec` — executa comando bash
- `shell_view` — vê saída do shell
- `shell_wait` — espera processo terminar
- `shell_write_to_process` — envia input para processo
- `shell_kill_process` — mata processo

**Files:**
- `file_read` — lê arquivo
- `file_write` — escreve arquivo
- `file_str_replace` — replace de string em arquivo
- `file_find_in_content` — busca em conteúdo
- `file_find_by_name` — busca por nome

**Browser:**
- `browser_view` — vê página atual
- `browser_navigate` — navega para URL
- `browser_restart` — reinicia browser
- `browser_click` — clica em elemento
- `browser_input` — preenche campo
- `browser_move_mouse` — move mouse
- `browser_press_key` — pressiona tecla
- `browser_select_option` — seleciona dropdown
- `browser_scroll_up` / `browser_scroll_down` — rola página
- `browser_console_exec` — executa JS no console
- `browser_console_view` — vê output do console

**Info:**
- `info_search_web` — busca na web

**Deploy:**
- `deploy_expose_port` — expõe porta para acesso público
- `deploy_apply_deployment` — faz deploy de site

**Especiais:**
- `make_manus_page` — cria página de resultado estilo Manus
- `idle` — entra em standby

O OmniNinja implementa as ferramentas essenciais: `shell_exec`, `file_write`, `file_read`, `info_search_web`, `browser_navigate`, `browser_click`, `browser_type`, `browser_scroll_down/up`, `browser_screenshot`, `browser_get_text`, `browser_execute_js`, `browser_press_key`, `deploy_expose_port`, e `finish`.

---

## 4. Como o Manus Usa os Modelos de IA

### 4.1 Modelos de Fundação

O Manus **não treina modelos do zero**. Ele usa:

1. **Claude 3.5 / 3.7 Sonnet** (Anthropic) — modelo principal para raciocínio e planejamento. É o "cérebro" que decide qual ferramenta usar.
2. **Qwen** (Alibaba) — usado em finetunes específicos. O Manus treina versões fine-tuned do Qwen para tarefas específicas (provavelmente tool use, code generation, e ajuste de comportamento).
3. **Multi-model dynamic invocation** — o Manus pode invocar diferentes modelos para diferentes partes de uma tarefa. Por exemplo, usar Claude para planejamento e Qwen para execução de código.

### 4.2 Por Que Não Treinar do Zero

Treinar um modelo de IA do zero custa **dezenas a centenas de milhões de dólares** em GPUs, e months de trabalho de pesquisadores. O Manus percebeu que o valor não está no modelo — está na **orquestração**. Claude e Qwen já são excelentes. O diferencial é o sistema de agentes, sandboxes, e ferramentas que os envolve.

Isso é uma lição importante para sua empresa: **não tente treinar um modelo. Use os melhores modelos disponíveis via API (OpenRouter, Google AI Studio) e concentre-se na orquestração.**

### 4.3 Como o OmniNinja Usa os Modelos

O OmniNinja usa **5 modelos via 2 provedores**:

| Modelo | Provedor | Uso |
|--------|---------|-----|
| Claude Sonnet 4 | OpenRouter | Modelo principal (raciocínio, planejamento) |
| GPT-4o | OpenRouter | Fallback 1 |
| Kimi K2 | OpenRouter | Fallback 2 |
| Grok 4.3 | OpenRouter | Fallback 3 |
| Gemini 2.5 Pro | Google AI Studio (nativo) | Fallback 4 |

O sistema tem **fallback automático**: se o modelo primário (Claude) falhar (rate limit, erro 402, timeout), tenta o próximo automaticamente. O usuário não percebe a falha.

---

## 5. Context Engineering — O Segredo Técnico

O Manus publicou um blog post sobre "Context Engineering" — a engenharia de como alimentar o contexto no LLM. Isso é o que diferencia um agente que funciona de um que não funciona.

### 5.1 KV-Cache é a Métrica #1

O Manus processa **147 trilhões de tokens**. Com uma ratio de 100:1 (input:output), o custo de input domina. A otimização #1 é **manter o KV-cache hit rate alto**.

KV-cache é o cache interno do LLM dos tokens já processados. Se o prompt prefix não muda entre chamadas, o LLM não precisa reprocessar — é 10x mais barato e rápido.

Regras do Manus:
- **Mantenha o prefixo do prompt estável** — system prompt, tool definitions, não mudam entre iterações
- **Context é append-only** — só adiciona eventos novos, nunca reescreve o histórico
- **Serialização determinística** — mesma ordem de eventos sempre
- **Cache breakpoints explícitos** — marca onde o cache pode ser reusado

A diferença entre um cache hit e miss é **10x no custo**. Manter o cache hit alto é o que torna o negócio lucrativo.

### 5.2 Logit Masking em Vez de Remover Tools

Se você remove ferramentas dinamicamente do prompt (ex: esconde browser tools quando não precisa), você quebra o KV-cache (o prompt mudou). O Manus usa **logit masking**: as tools continuam no prompt, mas durante o decoding, os logits dos tokens das tools não-aplicáveis são mascarados (setados para -inf), impedindo o LLM de selecioná-las.

### 5.3 File System como Contexto Ilimitado

A janela de contexto do LLM é finita (200K tokens no Claude). Mas o filesystem é ilimitado. O Manus usa o filesystem como **memória externa**:
- Resultados intermediários são salvos em arquivos
- O agente pode ler arquivos quando precisa (em vez de manter tudo no contexto)
- O `todo.md` serve como checklist persistente

### 5.4 todo.md — Recitação para Atenção

O Manus constantemente reescreve o `todo.md` — marcando tarefas completas, adicionando novas. Isso não é só organização — é **manipulação de atenção**. Ao reescrever os objetivos no topo do contexto, o modelo evita o problema "lost-in-the-middle" (esquecer o objetivo original no meio de uma tarefa longa).

### 5.5 Mantenha Erros no Contexto

Quando o agente erra, **não apague o erro do contexto**. O modelo aprende com a evidência do erro e ajusta seu comportamento. Apagar erros faz o modelo repetir os mesmos erros.

### 5.6 Evite Few-Shot Traps

Se o agente vê o mesmo padrão de ação/observação repetidamente, ele entra num "rut" — repete o mesmo padrão mesmo quando não é apropriado. O Manus introduz **variação estruturada** nas ações e observações para quebrar o pattern matching.

---

## 6. Módulos do Sistema

### 6.1 Planner Module

O Planner quebra a tarefa em **passos numerados em pseudocódigo**, com status e reflexão. Cada passo é injetado como um evento "Plan" no stream de eventos. Isso dá ao agente um roadmap claro e estruturado.

### 6.2 Knowledge Module

RAG-based: recupera **best practices específicas do domínio** e injeta como eventos. Por exemplo, se a tarefa é criar um site, injeta best practices de web development. Se é análise de dados, injeta best practices de pandas/SQL.

### 6.3 Datasource Module

APIs de dados **pré-aprovadas** acessadas via código Python. O Manus prioriza datasource APIs em vez de web scraping (mais confiável, mais rápido). Exemplos: APIs de finance, weather, news, etc.

---

## 7. Modelo de Negócio e Pricing

### 7.1 Revenue

- **$100M ARR** em 8 meses (março a novembro de 2025)
- **147 trilhões** de tokens processados
- **80+ milhões** de VMs criadas
- **105** funcionários
- **$75M** levantados (Benchmark liderou)
- Revenue per employee: ~$950K (extremamente alto)

### 7.2 Pricing

| Plano | Preço | Créditos/dia | Features |
|-------|-------|-------------|----------|
| **Free** | $0 | 300 | Acesso básico, VM compartilhada |
| **Standard** | $20/mo | 4.000 (cumulativos) | VM dedicada, mais ferramentas |
| **Customizable** | $40/mo | 8.000 | Mais créditos, mais VMs |
| **Extended** | $200/mo | 40.000 | Uso intensivo, prioridade |
| **Team** | $40/user/mo | Por usuário | Colaboração, gestão |

**Como funcionam os créditos**: Cada ação do agente (chamada ao LLM, execução de comando, navegação) consome créditos. O usuário compra créditos e eles são consumidos conforme usa. Modelo de uso pré-pago.

### 7.3 Lições para Sua Empresa

1. **O valor está na orquestração, não no modelo** — Manus não treina modelos. Usa APIs. Foque na experiência do agente.
2. **Sandbox VM é o produto** — a capacidade de "fazer" em vez de "falar" é o diferencial. ChatGPT conversa, Manus age.
3. **Credit-based pricing** — alinha custo (tokens/VM) com receita. Usuário paga proporcional ao uso.
4. **Freemium funciona** — 300 créditos grátis deixa pessoas testarem. Convertendo para $20/mo é o funnel.
5. **Multi-model com fallback** — não dependa de um único provedor. Se a Anthropic cair, usa OpenAI. Resiliência.
6. **Context engineering > model size** — um modelo menor com bom context engineering vence um modelo maior sem. Otimize o prompt, o cache, a seleção de tools.
7. **Velocidade importa** — Firecracker levanta VM em 150ms. Docker demora 20s. A velocidade do sandbox afeta a experiência do usuário diretamente.

---

## 8. Arquitetura Técnica do OmniNinja (Sua Empresa)

O OmniNinja replica a arquitetura do Manus no seu Ubuntu:

```
┌──────────────────────────────────────────────────────────┐
│                    Usuário (Browser)                      │
│              http://3.141.8.126:3000                      │
└──────────────────────┬───────────────────────────────────┘
                       │
                ┌──────▼──────┐
                │  Next.js 16 │  (React 19, SSR, SSE streaming)
                │  Porta 3000 │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
    │ Agent Loop│ │  Chat   │ │  Sandbox  │
    │ (orquestr)│ │ Stream  │ │  Health   │
    └─────┬─────┘ └────┬────┘ └───────────┘
          │            │
          │     ┌──────▼──────┐
          │     │ OpenRouter  │  (Claude, GPT, Kimi, Grok)
          │     │ + Google AI │  (Gemini nativo)
          │     └─────────────┘
          │
    ┌─────▼──────────────────────────┐
    │        VM SANDBOX               │
    │  (sandbox.ts — 3 níveis)        │
    │                                 │
    │  Nível 2: unshare + proot       │
    │  Nível 1: chroot debootstrap    │
    │  Nível 0: diretório isolado     │
    │                                 │
    │  ┌──────────┐  ┌─────────────┐  │
    │  │  Shell   │  │  Browser    │  │
    │  │ (bash,   │  │ (Chromium   │  │
    │  │  python, │  │  Playwright)│  │
    │  │  node)   │  │             │  │
    │  └──────────┘  └─────────────┘  │
    └─────────────────────────────────┘
```

### Stack Tecnológica:
- **Frontend**: Next.js 16 + React 19 + Tailwind + Framer Motion
- **Backend**: Next.js API Routes (Node.js runtime)
- **Database**: Prisma + SQLite (Users, Tasks, Events, Artifacts)
- **LLM**: OpenRouter (4 modelos) + Google AI Studio (Gemini nativo)
- **Browser**: Playwright-core + Chromium local (sem Browserless)
- **Sandbox**: unshare/proot (Nível 2) ou chroot (Nível 1) ou diretório (Nível 0)
- **Auth**: Email/senha com session cookies (crypto.scryptSync)
- **Streaming**: SSE (Server-Sent Events) para eventos do agente em tempo real

---

## 9. Roadmap para Sua Empresa

### Fase 1 (Atual) — MVP Funcional ✅
- [x] Plataforma web rodando no Ubuntu AWS
- [x] 5 modelos de IA com fallback automático
- [x] Agent loop real (planejar → executar → observar → iterar)
- [x] Sandbox VM com isolamento por task
- [x] Browser Chromium real (Playwright)
- [x] Shell real (bash/python/node)
- [x] File system real (criar/ler/escrever arquivos)
- [x] UI com painéis (chat, computador, arquivos)
- [x] Auth com usuários
- [x] Deploy com 1 comando

### Fase 2 — Escalar
- [ ] Migrar sandbox para E2B real (quando tiver instância com KVM)
- [ ] Migrar DB de SQLite para PostgreSQL
- [ ] Adicionar billing real (Stripe)
- [ ] Sistema de créditos com consumo real
- [ ] Multi-tenant (cada empresa tem seu workspace)
- [ ] API pública (para desenvolvedores integrarem)
- [ ] Webhooks (notificar quando tarefa completa)

### Fase 3 — Produto
- [ ] Knowledge module (RAG com best practices)
- [ ] Datasource module (APIs pré-aprovadas)
- [ ] Planner module avançado (pseudocódigo estruturado)
- [ ] Templates de tarefas (criar site, analisar dados, pesquisar)
- [ ] Colaboração em tempo real (multi-usuário numa task)
- [ ] Marketplace de agentes customizados
- [ ] Mobile app

### Fase 4 — Empresa
- [ ] Branding e domínio próprio
- [ ] Landing page e marketing
- [ ] Pricing tiers (Free/Standard/Pro/Enterprise)
- [ ] Suporte ao cliente
- [ ] Compliance (LGPD/GDPR)
- [ ] SOC2 / ISO 27001 (para clientes enterprise)
- [ ] Equipe (engenharia, produto, vendas)

---

## 10. Fontes

- Manus leaked system prompt: github.com/jujumilk3/leaked-system-prompts
- Manus technical deep dive: dev.to
- Manus $100M ARR: manuscript.im/blog
- Manus Context Engineering: manus.im/blog
- Manus sandbox architecture: manus.im/blog/manus-sandbox
- E2B blog (how Manus uses E2B): e2b.dev/blog
- Manus pricing: getaiperks.com
- CodeAct paper: ICML 2024 "Executable Code Actions Elicit Better LLM Agents"
- Firecracker: firecracker-microvm.github.io

---

*Documento gerado pelo OmniNinja em $(date). Este é o conhecimento técnico e estratégico necessário para construir uma empresa de agentes de IA autônomos.*
