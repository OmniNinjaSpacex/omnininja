# OmniNinja — Manus Parity Research 2026

Atualizado em 2026-08-10.

## Objetivo

Construir o OmniNinja como uma plataforma de agente geral com experiência e capacidades equivalentes às categorias públicas do Manus, sem depender de código-fonte proprietário, marcas, credenciais ou segredos internos do Manus.

## O que é confirmado por fontes públicas do próprio Manus

### 1. Sandbox / computador virtual por tarefa
A documentação oficial descreve o Manus como um agente que trabalha em um ambiente sandbox completo, com computador virtual, internet, filesystem persistente durante a tarefa e capacidade de instalar software e criar ferramentas.

Fontes:
- https://manus.im/docs/introduction/welcome
- https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer

### 2. Cloud Browser
O Manus possui navegador em nuvem capaz de visitar sites, clicar, preencher formulários, extrair dados e executar workflows multi-etapas. O usuário pode assumir o controle quando necessário para login, MFA ou verificações.

Fontes:
- https://manus.im/docs/features/cloud-browser
- https://help.manus.im/en/articles/11711218-how-can-i-take-over-manus-browser-or-vs-code

### 3. Browser Operator local
O Manus também documenta um Browser Operator que usa as abas/sessões existentes do navegador local do usuário. Isto é uma capacidade separada do Cloud Browser.

Fonte:
- https://manus.im/docs/pt-br/features/browser-operator

### 4. Cloud Computer persistente
Além do sandbox temporário, o Manus oferece Cloud Computer: uma VM persistente e always-on onde arquivos, ferramentas instaladas e processos continuam ativos entre sessões.

Fonte:
- https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer

### 5. Wide Research / agentes paralelos
Wide Research divide tarefas complexas em subtarefas paralelas. A publicação oficial descreve cada subagente como uma instância geral do Manus, em vez de papéis rígidos. A feature é um mecanismo de processamento paralelo + colaboração agent-to-agent.

Fontes:
- https://manus.im/blog/introducing-wide-research
- https://help.manus.im/en/articles/11960169-what-is-wide-research

### 6. Projects
Projects são workspaces persistentes com instruções compartilhadas e arquivos/knowledge base que são aplicados automaticamente às tarefas criadas dentro do projeto.

Fonte:
- https://manus.im/docs/features/projects

### 7. Skills
Skills são recursos modulares baseados em filesystem para encapsular workflows, instruções e capacidades reutilizáveis e combináveis.

Fonte:
- https://manus.im/docs/features/skills

### 8. Scheduled Tasks
O Manus executa tarefas one-shot ou recorrentes em horários definidos, incluindo pesquisa recorrente, relatórios e monitoramento.

Fonte:
- https://manus.im/docs/features/scheduled-tasks

### 9. Website Builder
O fluxo público do Manus inclui: descrever app -> revisar plano -> acompanhar build em tempo real -> preview vivo -> iterar por linguagem natural -> publicar. A publicação provisiona infraestrutura, build e hosting.

Fontes:
- https://manus.im/docs/website-builder/getting-started
- https://manus.im/docs/website-builder/publishing
- https://manus.im/docs/website-builder/getting-started/usage-and-pricing

### 10. Slides e artefatos
Manus gera apresentações completas com pesquisa, conteúdo, visuais, speaker notes e exporta PPTX/PDF/web slides. Também faz análise de dados com saída em slides, dashboard, report ou webpage.

Fontes:
- https://manus.im/docs/features/slides
- https://manus.im/docs/features/data-visualization

## Importante: o que NÃO está confirmado

Não devemos tratar como fato qualquer afirmação de que o Manus usa diretamente AWS Bedrock, EC2, Lambda, ECS, EKS, S3, DynamoDB, Step Functions ou qualquer combinação específica destes serviços sem uma fonte pública verificável.

Firecracker é uma tecnologia criada pela AWS e é usada por várias infraestruturas de sandbox. E2B publica sua própria arquitetura de sandboxes/microVMs, mas isso por si só não prova que o Manus atual use E2B ou uma topologia AWS específica. Arquitetura do OmniNinja deve ser escolhida pelas capacidades necessárias, não por suposição sobre infraestrutura interna do concorrente.

Referência E2B:
- https://github.com/e2b-dev/infra/blob/main/docs/ARCHITECTURE.md

## Arquitetura-alvo do OmniNinja

### Camada 1 — UI
- Workspace semelhante em fluxo, mas com branding OmniNinja próprio.
- Chat + timeline de ações + painel Computer.
- Tabs Browser / Code / Terminal / Preview / Files.
- Take over do browser.
- Projetos, Skills, Tasks agendadas e artefatos.

### Camada 2 — Agent Orchestrator
- Planner/Executor em loop.
- Tool registry estável.
- Eventos append-only.
- Streaming SSE/WebSocket.
- Retry + provider fallback.
- Checkpoints e resumização de contexto.
- Suporte a pausa/resume para intervenção humana.

### Camada 3 — Multi-agent / Wide mode
- Planner decide quando dividir tarefa.
- Fan-out N subtarefas independentes.
- Cada worker recebe objetivo + contexto mínimo.
- Resultados armazenados em artifacts/files.
- Aggregator final consolida e verifica duplicatas/conflitos.
- Limite de concorrência e orçamento por task.

### Camada 4 — Compute
Dois perfis:
1. Ephemeral Sandbox: uma sandbox isolada por task.
2. Persistent Computer: ambiente de longa duração por usuário/projeto.

Para produção, preferir isolamento real de VM/microVM ou serviço de sandbox dedicado. O atual fallback por diretório/unshare é adequado para desenvolvimento, mas não deve ser considerado isolamento multi-tenant de produção.

### Camada 5 — Browser
- Cloud browser isolado por task/user.
- CDP/Playwright.
- Perfil persistente opcional e criptografado.
- Screenshots/DOM/accessibility tree.
- Input human takeover.
- Política explícita para ações sensíveis.

### Camada 6 — Models
- Model router por capacidade/custo/latência.
- AWS Bedrock pode ser um provider do OmniNinja (Claude e outros modelos disponíveis no Bedrock), junto com provedores externos.
- O modelo não deve ser acoplado à infraestrutura de sandbox.

### Camada 7 — Storage
- Postgres para users/projects/tasks/events/usage.
- Object storage compatível com S3 para artifacts, screenshots e uploads.
- Redis/queue para jobs e coordenação.
- Event log imutável para retomar tarefas.

### Camada 8 — Deployment
- Preview temporário por task.
- Publish permanente.
- Domínio customizado.
- HTTPS automático.
- Build logs e rollback.

## Gaps atuais observados no repositório

O projeto já possui uma base forte:
- Next.js + React + Prisma.
- Agent loop.
- Browser automation via Playwright/Browserless.
- Shell/files.
- SSE/eventos.
- Sandbox local por níveis.
- Modos chat / agent / agent_max.

Principais gaps para paridade funcional moderna:
1. Não depender de JSON textual do LLM para tool calling; usar structured tool calls quando o provider permitir.
2. Adicionar `message_ask_user` + pause/resume real.
3. Criar browser session persistente + takeover.
4. Implementar Projects e knowledge base.
5. Implementar Skills filesystem-based.
6. Implementar Scheduled Tasks.
7. Implementar Wide/parallel agent orchestration.
8. Criar Persistent Cloud Computer separado do sandbox temporário.
9. Melhorar artifacts e geração/download de documentos.
10. Website builder com plan approval, live preview e publish pipeline.
11. Usage metering, quotas e billing ledger.
12. Observabilidade: traces por task/tool/model e custos.
13. Segurança multi-tenant real antes de abrir para usuários externos.

## Ordem de implementação

### P0 — Agente confiável
- Structured tool calling
- pause/resume
- event persistence
- resumable tasks
- browser takeover
- artifact persistence

### P1 — Produto
- Projects
- Skills
- Scheduled Tasks
- Website Builder
- publish/preview

### P2 — Escala
- Wide Research / parallel agents
- task queue
- persistent Cloud Computer
- autoscaling sandboxes
- per-task budgets

### P3 — Empresa
- teams/orgs
- billing
- audit logs
- RBAC
- rate limits
- encrypted secrets vault
- backups/DR

## Princípio de segurança

Nunca colocar API keys, tokens, AWS secrets ou senhas em código, README, commit, query string ou installer codificado em base64. Usar secrets manager/environment variables e rotacionar qualquer segredo que já tenha sido commitado no histórico.
