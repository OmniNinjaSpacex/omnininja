# OmniNinja AI

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

O GitHub é a fonte de código. O frontend pode ser publicado pelo ChatGPT Sites/Work; o backend continua dependendo das variáveis e serviços de produção configurados.

## CI

O GitHub Actions valida:

1. bootstrap do ambiente AI Lab esperado;
2. dependências;
3. Prisma Client;
4. schema PostgreSQL;
5. build completo do Next.js.

Uma alteração só deve chegar à `main` depois dessa validação ficar verde.
