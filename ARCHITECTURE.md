# OMNININJA — arquitetura fonte da verdade

Este arquivo existe para que ChatGPT Work, Codex e qualquer colaborador entendam o estado atual do projeto sem depender de conversas antigas.

## Produto

OMNININJA é uma IA conversacional com uma única identidade pública: **OMNININJA**.

A experiência deve parecer um chat simples e limpo, inspirado na ergonomia do ChatGPT. Por trás, o sistema pode executar tarefas longas e usar ferramentas automaticamente, no estilo de um agente de execução como Manus.

Não transformar a interface em console de ferramentas. Não mostrar nomes de funções, comandos, selectors, prompts internos, tokens, chaves ou chain-of-thought. O usuário vê somente estados humanos curtos como `Pesquisando…`, `Analisando arquivos…`, `Executando…` e o resultado final.

## Provedor de IA

O único provedor de modelos mantido no produto é **OpenAI**.

O nome do modelo/provedor não deve substituir a marca pública OMNININJA na interface.

A interface oferece três modos de experiência — **Chat**, **Work** e **Codex** —
sem trocar a identidade ou expor modelos. Chat prioriza conversa, Work assume
objetivos em várias etapas e Codex prioriza desenvolvimento de software.

Serviços OpenAI integrados ou preparados:

- Responses API com GPT-5.6 como motor privado padrão.
- Web Search.
- Code Interpreter.
- Shell hospedado da OpenAI em container efêmero e isolado.
- File Search / Vector Stores quando configurados.
- perfil de pesquisa profunda usando GPT-5.6, esforço alto e Web Search com citações;
- Image Generation.
- Embeddings para memória semântica.
- omni-moderation-latest.
- Speech-to-text.
- Text-to-speech.
- Realtime API para voz ao vivo.
- Sora para geração de vídeo.
- arquivos gerados por Code Interpreter/Shell entregues por proxy autenticado enquanto o container OpenAI estiver ativo;
- Computer Use preparado para tarefas visuais quando existir um harness isolado
  de navegador/VM que execute ações e devolva capturas confirmadas.

Não reintroduzir Claude, Gemini, Kimi, Grok, DeepSeek, GLM, Qwen, MiniMax, Nemotron ou OpenRouter como modelos públicos/alternativos sem uma decisão explícita futura do dono do projeto.

## Runtime único

A única superfície conversacional de execução é o fluxo unificado de `/api/omnininja/respond` + `src/lib/omnininja-runtime.ts`.

Esse endpoint cria uma `Task`, persiste mensagens e eventos, debita créditos de forma atômica e transmite somente estados sanitizados por SSE. Geração de imagem, vídeo e voz usa rotas multimodais dedicadas para evitar transportar payloads binários dentro do streaming textual.

Arquitetura legada removida e que não deve ser recriada:

- `/api/agent/run`;
- `openai-agent-loop.ts` paralelo;
- `Agent MAX`;
- seleção pública de providers/modelos;
- `demoMode` e `configuredProviders`;
- takeover de navegador da UI antiga;
- timelines simuladas e consoles de ferramentas voltados ao usuário.

## Execução privada estilo Manus

O runtime conversacional usa as ferramentas hospedadas da OpenAI sempre que
disponíveis: Web Search, Code Interpreter, File Search e Shell hospedado.

O **AI Lab/LXD** permanece como infraestrutura isolada opcional para workspaces
persistentes, builds longos e um futuro harness seguro do Computer Use. Ele não
é um provedor de modelo e não aparece como escolha para o usuário.

Computer Use não é um navegador hospedado completo por si só: o modelo propõe
ações e o produto precisa executá-las em um navegador ou VM isolados, devolver
capturas e exigir confirmação humana em ações de alto impacto. Sem esse harness,
a capacidade permanece indisponível e fail-closed; o OMNININJA nunca simula que
clicou, digitou ou concluiu uma ação visual.

## Interface

Direção visual atual:

- chat central limpo e espaçado;
- seletor compacto Chat / Work / Codex, sempre sob a identidade OMNININJA;
- sidebar de tarefas/projetos do OMNININJA;
- tema escuro;
- ciano apenas como acento de identidade;
- composer arredondado com anexos, esforço, pensamento, microfone e criação multimodal;
- mensagens do usuário em bolha discreta;
- resposta do OMNININJA sem card pesado;
- mídia gerada aparece dentro da mensagem.

Controles multimodais atuais:

- ditado por microfone → OpenAI transcription;
- ouvir resposta → OpenAI text-to-speech;
- voz ao vivo → OpenAI Realtime/WebRTC;
- criar imagem → OpenAI Image Generation;
- criar vídeo → OpenAI Sora;
- anexos → análise pelo backend OMNININJA.

O workspace também oferece um atalho de **Pesquisa profunda**, que seleciona Work, esforço alto e pensamento interno sem expor um modelo diferente. Arquivos finais citados pelos containers OpenAI são persistidos como referências privadas de `Artifact`; o navegador recebe apenas uma URL autenticada do próprio OMNININJA.

As rotas institucionais atuais são `/products`, `/research`, `/business`, `/developers`, `/safety`, `/security`, `/company`, `/news`, `/academy`, `/contact`, `/privacy` e `/terms`. O conteúdo e o código são originais da marca OMNININJA.

## Dados e contexto

- PostgreSQL + Prisma.
- histórico de mensagens e tarefas por usuário;
- projetos vinculam tarefas sem criar outra identidade de agente;
- embeddings de mensagens para recuperar contexto antigo relevante;
- anexos são processados no backend e apenas seus metadados seguros são preservados no histórico;
- eventos internos podem ser persistidos para auditoria, mas o navegador recebe somente eventos sanitizados.

## Autenticação

- e-mail/senha e sessão HttpOnly permanecem disponíveis;
- o único login social é Google OAuth/OIDC com state de uso único, PKCE e nonce;
- tokens do Google não são persistidos;
- a conta Google pode ser a mesma usada pelo usuário no ChatGPT, mas isso não
  vincula nem concede acesso à conta, assinatura ou dados do ChatGPT;
- login direto com conta ChatGPT só poderá ser adicionado se a OpenAI oferecer
  e aprovar o OMNININJA para um fluxo OAuth público de parceiro.

## Segurança e privacidade da implementação

- `OPENAI_API_KEY`, `AILAB_API_TOKEN`, credenciais de banco e demais secrets ficam somente no servidor/ambiente de deploy.
- nunca enviar secrets ao navegador;
- nunca expor chain-of-thought;
- nunca afirmar que uma ferramenta executou algo sem resultado confirmado;
- execução persistente externa deve permanecer fail-closed quando o AI Lab não estiver disponível;
- ações de Computer Use devem permanecer fail-closed sem harness isolado e confirmação apropriada;
- rotas de autenticação, execução e mídia devem aplicar limites, validar tamanho/forma do input e devolver erros públicos sanitizados;
- migrações Prisma devem ser aplicadas a PostgreSQL antes de iniciar um deploy novo.

## Fonte da verdade para Work/Codex

Ao continuar este projeto:

1. leia este arquivo e o `README.md`;
2. trate a branch `main` como estado atual do produto;
3. preserve a identidade pública OMNININJA;
4. preserve OpenAI como único provedor de modelos;
5. preserve as ferramentas hospedadas da OpenAI e o AI Lab isolado;
6. mantenha a experiência de chat simples com ferramentas internas invisíveis;
7. não recrie rotas, estados ou UIs marcados acima como arquitetura legada removida;
8. valide Prisma/PostgreSQL e `next build` antes de mesclar mudanças.
