# Matriz oficial de capacidades OpenAI → OMNININJA

Última auditoria: 11 de agosto de 2026.

Este documento transforma a pesquisa nas fontes oficiais em decisões de produto. Ele não autoriza copiar código, textos, marcas ou ativos da OpenAI. O OMNININJA adota capacidades e padrões públicos por meio de implementação própria e mantém uma única identidade pública.

Status:

- **Ativo**: implementado no runtime ou na interface atual.
- **Preparado**: código e contrato existem, mas dependem de configuração segura do deploy.
- **Planejado**: é tecnicamente aplicável, mas ainda exige implementação e validação.
- **Bloqueado**: não deve ser anunciado como funcional sem infraestrutura, acesso ou aprovação externa.

## Experiência do produto

| Capacidade oficial | Status no OMNININJA | Implementação/decisão | Fonte oficial |
| --- | --- | --- | --- |
| Chat multimodal | Ativo | Chat único com texto, imagens, arquivos e memória, sem seletor público de provedor. | [Use ChatGPT](https://learn.chatgpt.com/docs/use-chatgpt) |
| Chat / Work / Codex | Ativo | Três modos de comportamento sob a mesma identidade OMNININJA. | [ChatGPT Work](https://learn.chatgpt.com/docs/get-started-with-work), [Codex cloud](https://learn.chatgpt.com/docs/cloud) |
| Projetos e conversas | Ativo | Projetos e threads contínuas persistem no PostgreSQL; conversas podem ser buscadas, renomeadas, fixadas, excluídas e ramificadas. | [Projects and chats](https://learn.chatgpt.com/docs/projects), [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt) |
| Pesquisa profunda | Ativo | Atalho próprio ativa Work, pensamento e esforço alto; o runtime usa GPT-5.6 e Web Search com citações. Não usa modelos de pesquisa descontinuados. | [Deep research](https://developers.openai.com/api/docs/guides/deep-research), [Web Search](https://developers.openai.com/api/docs/guides/tools-web-search) |
| Arquivos finalizados | Ativo | Arquivos citados pelo Code Interpreter ou Shell são registrados por tarefa e oferecidos como downloads autenticados. | [Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter), [Shell](https://developers.openai.com/api/docs/guides/tools-shell) |
| Biblioteca | Ativo parcial | Exibe anexos da conversa. Uma biblioteca durável e independente de conversas permanece planejada. | [Work with files](https://learn.chatgpt.com/docs/artifacts-viewer) |
| Tarefas agendadas | Preparado | Schema e API CRUD existem. Execução recorrente só pode ser ativada com um scheduler autenticado e observável no deploy. | [Scheduled tasks](https://learn.chatgpt.com/docs/automations) |
| Tarefas longas em segundo plano | Planejado | O runtime atual transmite por SSE. Background Responses + webhooks devem ser adicionados antes de prometer execução desconectada. | [Background mode](https://developers.openai.com/api/docs/guides/background), [Webhooks](https://developers.openai.com/api/docs/guides/webhooks) |
| Visualizações interativas | Planejado | Markdown, código e mídia já renderizam; artefatos interativos exigem um sandbox de visualização separado. | [Visualizations](https://learn.chatgpt.com/docs/visualizations) |
| Sites | Ativo no produto | O próprio OMNININJA é publicado pelo Sites; criação de sites por tarefas usa Shell/arquivos e requer entrega verificável. | [Sites](https://learn.chatgpt.com/docs/sites) |

## Interface e comportamento pesquisados

| Comportamento oficial observado | Status no OMNININJA | Implementação/decisão | Fonte oficial |
| --- | --- | --- | --- |
| Sidebar responsiva | Ativo | Fixa no desktop e vira painel flutuante com fechamento suave no celular; configurações permanecem no rodapé. | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |
| Fixar chats e projetos | Ativo parcial | Chats têm fixação persistente e seção Fixados; projetos continuam na seção própria. | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |
| Busca de conversas | Ativo | Busca server-side por título e conteúdo, sem limitar a consulta ao que já está renderizado na sidebar. | [What is ChatGPT](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq) |
| Ramificar conversa | Ativo | Cria uma nova thread PostgreSQL até a mensagem escolhida, preservando a original. | [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt) |
| Mensagens contínuas | Ativo | Novos turnos são anexados à thread ativa e reutilizam apenas o histórico persistido autorizado do usuário. | [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) |
| Ações sob a resposta | Ativo | Copiar, ouvir, compartilhar, avaliar e ramificar sem mostrar chamadas de ferramenta. | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |
| Composer móvel e teclado | Ativo | Composer respeita safe areas, menu de ferramentas vira bottom sheet e a sidebar não comprime a conversa. | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |
| Colagens muito grandes como anexo | Planejado | Evitar texto gigante no composer e convertê-lo em arquivo exige armazenamento durável de Library. | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) |
| Blocos de escrita editáveis | Planejado | Markdown está ativo; edição persistente, tela cheia e undo/redo requerem um artefato versionado próprio. | [Writing and code blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt) |
| Preview e execução de blocos de código | Planejado | Código já tem destaque e cópia; preview HTML/React/SVG/Mermaid e execução Python devem usar sandbox separado. | [Writing and code blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt) |
| Chat / Work / Codex | Ativo com escopo próprio | OMNININJA oferece os três perfis no mesmo site. Na OpenAI, Chat e Work compartilham recents; Codex oficial continua dedicado a software e tem restrições de superfície. | [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex) |
| Plugins/apps | Planejado | Não expor catálogo falso. Apps só entram com OAuth server-side, permissões, confirmação para ações e conectores auditados. | [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt) |
| Library durável | Ativo parcial | O painel atual agrega anexos da thread; armazenamento independente, busca, filtros e reutilização entre chats ainda precisam de modelo de dados próprio. | [File storage and Library](https://help.openai.com/en/articles/20001052-file-storage-and-library-in-chatgpt) |
| Temporary Chat | Planejado | Exige sessão que não grava histórico/memória/library e política explícita de retenção, sem alegar privacidade que o backend não cumpre. | [Data Controls FAQ](https://help.openai.com/en/articles/7730893-data-controls-faq) |

## OpenAI API e ferramentas hospedadas

| Capacidade oficial | Status no OMNININJA | Implementação/decisão | Fonte oficial |
| --- | --- | --- | --- |
| Responses API | Ativo | Único runtime conversacional em `/api/omnininja/respond`. | [Responses API migration](https://developers.openai.com/api/docs/guides/migrate-to-responses) |
| GPT-5.6 + raciocínio | Ativo | Modelo privado configurável no servidor; esforço baixo, médio ou alto sem expor nome de modelo. | [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| Streaming | Ativo | SSE sanitizado entrega progresso humano e resposta final. | [Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses) |
| Web Search | Ativo | Ferramenta hospedada automática com fontes convertidas em links na resposta. | [Web Search](https://developers.openai.com/api/docs/guides/tools-web-search) |
| File Search / Vector Stores | Preparado | Ativado somente quando `OPENAI_VECTOR_STORE_IDS` contém stores aprovados. | [File Search](https://developers.openai.com/api/docs/guides/tools-file-search) |
| Code Interpreter | Ativo | Análise de dados e criação de arquivos em container automático. | [Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter) |
| Hosted Shell | Ativo | Comandos e builds em container efêmero da OpenAI; nunca no servidor principal. | [Shell](https://developers.openai.com/api/docs/guides/tools-shell) |
| Function calling | Preparado | Pode ser adicionado para ações internas específicas, com schemas mínimos e validação do servidor. | [Using tools](https://developers.openai.com/api/docs/guides/tools) |
| Structured Outputs | Planejado | Útil para contratos internos e geração de UI; ainda não é necessário no fluxo textual atual. | [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| Tool Search | Planejado | Será útil quando o catálogo interno crescer; não deve ser usado para expor um seletor de ferramentas ao usuário. | [Tool Search](https://developers.openai.com/api/docs/guides/tools-tool-search) |
| Skills | Planejado | Skills hospedadas exigem ciclo próprio de upload, versão e avaliação. | [Using tools](https://developers.openai.com/api/docs/guides/tools) |
| Apply Patch | Bloqueado | O modelo pode propor diffs, mas o produto precisa de um aplicador isolado e validação; não se aplica patches no host. | [Apply Patch](https://developers.openai.com/api/docs/guides/tools-apply-patch) |
| MCP e conectores | Preparado | Só será habilitado por integração auditada, OAuth server-side e confirmação para ações; conteúdo externo é não confiável. | [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) |
| Computer Use | Bloqueado | A API fornece decisões de ação, não um navegador hospedado completo. Exige navegador/VM isolado, capturas confirmadas e aprovação humana. | [Computer Use](https://developers.openai.com/api/docs/guides/tools-computer-use) |

## Voz, mídia, memória e segurança

| Capacidade oficial | Status no OMNININJA | Implementação/decisão | Fonte oficial |
| --- | --- | --- | --- |
| Análise de imagens / visão | Ativo | Imagens anexadas são analisadas no backend como contexto multimodal. | [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) |
| Geração de imagens | Ativo | Rota server-only para gerar imagens e exibi-las na conversa. | [Image generation](https://developers.openai.com/api/docs/guides/tools-image-generation) |
| Edição de imagens | Ativo | Ao selecionar uma imagem anexada, o mesmo fluxo multimodal preserva a referência e aplica o pedido de edição. | [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) |
| Vídeo | Ativo com prazo | Integração Sora permanece enquanto a API estiver disponível; deve ser desabilitada ou migrada antes do encerramento oficial. | [Video generation](https://developers.openai.com/api/docs/guides/video-generation) |
| Speech-to-Text | Ativo | Ditado envia áudio ao backend e devolve somente a transcrição. | [Audio and speech](https://developers.openai.com/api/docs/guides/audio) |
| Text-to-Speech | Ativo | Respostas podem ser ouvidas por uma rota autenticada no servidor. | [Audio and speech](https://developers.openai.com/api/docs/guides/audio) |
| Realtime / voz | Ativo | WebRTC inicia voz ao vivo sem expor a chave OpenAI ao navegador. | [Realtime](https://developers.openai.com/api/docs/guides/realtime) |
| Embeddings e memória | Ativo | Embeddings recuperam contexto semântico persistido no PostgreSQL. | [Embeddings](https://developers.openai.com/api/docs/guides/embeddings) |
| Moderação | Ativo | `omni-moderation-latest` avalia entrada como sinal privado de segurança. | [Moderation](https://developers.openai.com/api/docs/guides/moderation) |
| Estado de conversa | Ativo no banco próprio | PostgreSQL é a fonte durável; o runtime envia histórico relevante sem depender de estado público de outro produto. | [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) |
| Compaction | Planejado | O histórico já é limitado; compaction oficial será avaliada para conversas muito longas. | [Compaction](https://developers.openai.com/api/docs/guides/compaction) |

## Capacidades que não são copiáveis ou automaticamente transferíveis

- Uma assinatura ou conta do ChatGPT não autentica automaticamente um site independente. “Sign in with ChatGPT” existe, mas precisa estar disponível e configurado para o aplicativo; não transfere conversas, memória, arquivos, créditos ou assinatura. O login social público atual do OMNININJA é Google OAuth/OIDC. [Fonte oficial](https://help.openai.com/pt-br/articles/20001410-sign-in-with-chatgpt)
- Recursos de aplicativo desktop, extensão do Chrome, appshots, diretório de plugins, pets, Codex Micro e integrações de workspace são produtos/superfícies da OpenAI, não endpoints que podem ser clonados pela API.
- Evals, fine-tuning, Batch e administração da plataforma são ferramentas de engenharia/operação. Podem melhorar o OMNININJA nos bastidores, mas não devem virar botões públicos sem um caso de uso real.
- Nenhuma capacidade será apresentada como ativa antes de existir execução verificável, isolamento adequado, credenciais server-only e tratamento de falhas.
