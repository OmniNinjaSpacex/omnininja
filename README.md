# OMNININJA

OmniNinja é uma plataforma de IA conversacional com uma única identidade pública: **OMNINJA**.

A experiência é um chat simples e limpo. Por trás, o OMNINJA pode pesquisar, analisar arquivos, gerar mídia, usar navegador remoto e executar tarefas em workspace Linux sem transformar a interface em um console de ferramentas.

Leia também [`ARCHITECTURE.md`](./ARCHITECTURE.md). Esse arquivo é a fonte de verdade para continuar o projeto no ChatGPT Work/Codex.

## Arquitetura atual

- **UI:** Next.js, interface híbrida ChatGPT + identidade própria OMNINJA.
- **Modelo privado:** OpenAI, com GPT-5.6 como padrão configurável.
- **Orquestração:** Responses API com ferramentas internas automáticas.
- **Pesquisa:** OpenAI Web Search.
- **Dados/código:** OpenAI Code Interpreter quando apropriado.
- **Arquivos:** anexos + File Search/Vector Stores quando configurados.
- **Imagem:** OpenAI Image Generation.
- **Vídeo:** OpenAI Sora.
- **Voz:** transcription, text-to-speech e Realtime/WebRTC.
- **Memória:** OpenAI Embeddings + PostgreSQL.
- **Segurança de conteúdo:** omni-moderation-latest como camada adicional.
- **Banco:** PostgreSQL + Prisma.
- **Navegador real:** Browserless.
- **Workspace Linux:** AI Lab/LXD remoto por tarefa.

## Princípio de produto

Publicamente existe apenas **OMNINJA**. OpenAI, Browserless, AI Lab e nomes de ferramentas são detalhes internos.

O navegador nunca deve receber prompts internos, selectors, comandos shell, stdout/stderr, secrets ou chain-of-thought. Ele recebe apenas estados humanos curtos e os resultados necessários.

## Interface multimodal

O composer suporta:

- anexar câmera, fotos e arquivos;
- ditar por microfone;
- voz ao vivo;
- criar imagens;
- criar vídeos;
- escolher esforço Baixo/Médio/Alto;
- ligar/desligar pensamento.

Resultados de imagem e vídeo aparecem dentro da própria conversa. Respostas de texto podem ser lidas em voz alta.

## Hospedagem pública

O GitHub (`OmniNinjaSpacex/omnininja`, branch `main`) é a fonte de código. O app pode ser publicado pelo ChatGPT Sites/Work ou como container Node, mas o runtime completo sempre depende de PostgreSQL e dos serviços de produção configurados.

## Desenvolvimento local

Requisitos:

- Node.js 24;
- PostgreSQL 17 (ou uma versão PostgreSQL ainda suportada pelo provedor);
- uma chave OpenAI válida no backend.

```bash
npm ci
cp .env.example .env.local
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Preencha no mínimo `DATABASE_URL` e `OPENAI_API_KEY` em `.env.local`. Browserless e AI Lab são opcionais para chat simples, mas as respectivas ferramentas ficam indisponíveis quando não configuradas. O shell e os arquivos permanecem fail-closed em produção se o sandbox seguro não estiver disponível.

## Validação obrigatória

Antes de abrir ou atualizar uma PR:

```bash
npm ci
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
npm run typecheck
npm run lint
npm test
npm run build
```

`db:migrate:deploy` deve apontar para um PostgreSQL descartável no CI e para o banco correto durante o deploy. O build não cria tabelas e não usa SQLite como fallback.

## Deploy com Docker Compose

Crie `.env` a partir do exemplo, defina uma senha PostgreSQL compatível com URL e os secrets do backend, então execute:

```bash
docker compose up --build
```

O serviço `migrate` aplica as migrações antes de liberar o app. O container web roda sem root, com filesystem somente leitura e sandbox local desativado por padrão.

Em plataformas sem Docker Compose, execute `npm run db:migrate:deploy` como etapa separada antes de iniciar `.next/standalone/server.js`.

### Banco existente sem histórico Prisma

A migração `20260811000000_init` representa o schema PostgreSQL oficial atual. Se um banco existente já contém essas tabelas, não rode a migração inicial às cegas. Primeiro compare o schema real com `prisma/schema.prisma`, faça backup e, somente quando forem equivalentes, registre a baseline:

```bash
npx prisma migrate resolve --applied 20260811000000_init
```

Depois disso, use apenas migrações incrementais. Nunca use `prisma migrate reset` em produção.

## Variáveis de produção

Obrigatórias para o núcleo:

- `DATABASE_URL`;
- `OPENAI_API_KEY`;
- `OMNININJA_MODEL` (possui default, mas deve ser fixado por ambiente).

Para execução autônoma:

- `BROWSERLESS_API_KEY` e `BROWSERLESS_REGION` para navegação real;
- `OMNININJA_SANDBOX_PROVIDER=ailab`, `AILAB_BASE_URL` e `AILAB_API_TOKEN` para execução remota recomendada;
- ou sandbox local nível 2 (`unshare` + `proot`) em um host dedicado.

Todos os secrets são server-only. Não prefixe secrets com `NEXT_PUBLIC_`.

### Continuidade da geração de vídeo

A OpenAI marcou a Videos API e os modelos Sora 2 como descontinuados, com encerramento anunciado para **24 de setembro de 2026**. A rota atual permanece configurável porque vídeo ainda faz parte do produto, mas o deploy deve acompanhar a [documentação oficial de geração de vídeo](https://developers.openai.com/api/docs/guides/video-generation) e migrar ou desabilitar essa capacidade antes do encerramento quando houver uma substituição oficial.

## CI

O GitHub Actions valida:

1. bootstrap do ambiente AI Lab esperado;
2. instalação travada por `package-lock.json`;
3. Prisma Client e schema;
4. aplicação das migrações em PostgreSQL 17 real;
5. TypeScript e lint;
6. testes automatizados;
7. build completo do Next.js.

Uma alteração só deve chegar à `main` depois dessa validação ficar verde.

## Segurança operacional

- Rotacione imediatamente qualquer credencial que tenha sido commitada em versões antigas; removê-la da árvore atual não a remove do histórico Git.
- Use um secret manager para chaves e tokens.
- Restrinja AI Lab a rede privada ou túnel TLS autenticado.
- Não habilite shell local público se `/api/health/sandbox` não confirmar execução isolada.
- Mantenha rate limiting externo/distribuído no proxy para deploys com múltiplas instâncias; os limites internos são uma segunda camada por processo.
