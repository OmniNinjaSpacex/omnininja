# OMNINJA — arquitetura fonte da verdade

Este arquivo existe para que ChatGPT Work, Codex e qualquer colaborador entendam o estado atual do projeto sem depender de conversas antigas.

## Produto

OMNINJA é uma IA conversacional com uma única identidade pública: **OMNINJA**.

A experiência deve parecer um chat simples e limpo, inspirado na ergonomia do ChatGPT. Por trás, o sistema pode executar tarefas longas e usar ferramentas automaticamente, no estilo de um agente de execução como Manus.

Não transformar a interface em console de ferramentas. Não mostrar nomes de funções, comandos, selectors, prompts internos, tokens, chaves ou chain-of-thought. O usuário vê somente estados humanos curtos como `Pesquisando…`, `Analisando arquivos…`, `Executando…` e o resultado final.

## Provedor de IA

O único provedor de modelos mantido no produto é **OpenAI**.

O nome do modelo/provedor não deve substituir a marca pública OMNINJA na interface.

Serviços OpenAI integrados ou preparados:

- Responses API com GPT-5.6 como motor privado padrão.
- Web Search.
- Code Interpreter.
- File Search / Vector Stores quando configurados.
- Image Generation.
- Embeddings para memória semântica.
- omni-moderation-latest.
- Speech-to-text.
- Text-to-speech.
- Realtime API para voz ao vivo.
- Sora para geração de vídeo.

Não reintroduzir Claude, Gemini, Kimi, Grok, DeepSeek, GLM, Qwen, MiniMax, Nemotron ou OpenRouter como modelos públicos/alternativos sem uma decisão explícita futura do dono do projeto.

## Execução privada estilo Manus

Algumas capacidades precisam de infraestrutura além do modelo:

- **Browserless**: navegador remoto para interação real com páginas.
- **AI Lab/LXD**: workspace Linux remoto por tarefa para shell, arquivos, builds e testes.

Esses componentes são infraestrutura de execução; não são provedores de modelo e não aparecem como escolhas para o usuário.

## Interface

Direção visual atual:

- chat central limpo e espaçado;
- sidebar de tarefas/projetos do OMNINJA;
- tema escuro;
- ciano apenas como acento de identidade;
- composer arredondado com anexos, esforço, pensamento, microfone e criação multimodal;
- mensagens do usuário em bolha discreta;
- resposta do OMNINJA sem card pesado;
- mídia gerada aparece dentro da mensagem.

Controles multimodais atuais:

- ditado por microfone → OpenAI transcription;
- ouvir resposta → OpenAI text-to-speech;
- voz ao vivo → OpenAI Realtime/WebRTC;
- criar imagem → OpenAI Image Generation;
- criar vídeo → OpenAI Sora;
- anexos → análise pelo backend OMNINJA.

## Dados e contexto

- PostgreSQL + Prisma.
- histórico de mensagens e tarefas por usuário;
- embeddings de mensagens para recuperar contexto antigo relevante;
- anexos são processados no backend;
- eventos internos podem ser persistidos para auditoria, mas o navegador recebe somente eventos sanitizados.

## Segurança e privacidade da implementação

- `OPENAI_API_KEY`, `AILAB_API_TOKEN`, credenciais de banco e demais secrets ficam somente no servidor/ambiente de deploy.
- nunca enviar secrets ao navegador;
- nunca expor chain-of-thought;
- nunca afirmar que uma ferramenta executou algo sem resultado confirmado;
- shell deve permanecer fail-closed quando o sandbox seguro configurado não estiver disponível.

## Fonte da verdade para Work/Codex

Ao continuar este projeto:

1. leia este arquivo e o `README.md`;
2. trate a branch `main` como estado atual do produto;
3. preserve a identidade pública OMNINJA;
4. preserve OpenAI como único provedor de modelos;
5. preserve Browserless/AI Lab apenas como infraestrutura de execução;
6. mantenha a experiência de chat simples com ferramentas internas invisíveis;
7. valide Prisma/PostgreSQL e `next build` antes de mesclar mudanças.
