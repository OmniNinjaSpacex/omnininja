export interface CorporateHighlight {
  label: string;
  title: string;
  detail: string;
}

export interface CorporateSection {
  eyebrow: string;
  title: string;
  body: string;
  items: string[];
}

export interface CorporatePageData {
  slug: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  lead: string;
  highlights: CorporateHighlight[];
  sections: CorporateSection[];
  ctaTitle: string;
  ctaBody: string;
  ctaLabel: string;
  ctaHref: string;
}

export const primaryCorporateNav = [
  { href: '/research', label: 'Pesquisa' },
  { href: '/products', label: 'Produtos' },
  { href: '/business', label: 'Empresas' },
  { href: '/developers', label: 'Desenvolvedores' },
  { href: '/safety', label: 'Segurança' },
  { href: '/company', label: 'Empresa' },
] as const;

export const corporatePages: Record<string, CorporatePageData> = {
  products: {
    slug: 'products',
    navLabel: 'Produtos',
    eyebrow: 'Produtos OMNININJA',
    title: 'Uma inteligência para conversar, trabalhar e construir.',
    lead: 'O OMNININJA reúne conversa, pesquisa, arquivos, voz, mídia e execução em uma experiência única. As ferramentas ficam nos bastidores; o resultado permanece simples.',
    highlights: [
      { label: '01', title: 'Chat', detail: 'Conversa natural, contexto contínuo, raciocínio ajustável e respostas com fontes quando necessário.' },
      { label: '02', title: 'Work', detail: 'Objetivos longos divididos em etapas, execução hospedada e verificação antes da entrega.' },
      { label: '03', title: 'Codex', detail: 'Engenharia de software com análise, terminal hospedado, arquivos, builds e testes.' },
      { label: '04', title: 'Voz', detail: 'Ditado, transcrição, leitura de respostas e conversa de baixa latência.' },
      { label: '05', title: 'Imagem e vídeo', detail: 'Criação visual e geração de vídeo iniciadas diretamente no composer.' },
      { label: '06', title: 'Projetos', detail: 'Conversas, anexos e memória organizados em espaços persistentes.' },
    ],
    sections: [
      {
        eyebrow: 'Experiência',
        title: 'Um único OMNININJA, sem seletores de provedores.',
        body: 'A pessoa escolhe apenas como quer trabalhar. Chat, Work e Codex mudam o comportamento da experiência, não a identidade do produto.',
        items: ['Composer multimodal e responsivo', 'Pesquisa atual com citações', 'Análise de documentos e imagens', 'Histórico, projetos e biblioteca'],
      },
      {
        eyebrow: 'Execução',
        title: 'Capacidade real com limites claros.',
        body: 'Ferramentas hospedadas são escolhidas automaticamente. Operações sensíveis dependem de confirmação e ambientes externos permanecem bloqueados quando a infraestrutura segura não está disponível.',
        items: ['Web Search e File Search', 'Code Interpreter e Shell hospedado', 'Geração de imagem, vídeo e áudio', 'Sandbox opcional com comportamento fail-closed'],
      },
    ],
    ctaTitle: 'Comece no modo que combina com sua tarefa.',
    ctaBody: 'Entre no workspace e converse com uma única IA, do primeiro pedido à entrega final.',
    ctaLabel: 'Abrir OMNININJA',
    ctaHref: '/?workspace=1',
  },
  research: {
    slug: 'research',
    navLabel: 'Pesquisa',
    eyebrow: 'Pesquisa aplicada',
    title: 'Transformando avanços em experiências confiáveis.',
    lead: 'Nossa pesquisa aplicada concentra-se em qualidade de resposta, uso seguro de ferramentas, memória útil, avaliação contínua e interfaces que deixam sistemas complexos mais simples.',
    highlights: [
      { label: 'Qualidade', title: 'Avaliações', detail: 'Casos reais, testes de regressão e verificação de comportamento antes de cada publicação.' },
      { label: 'Contexto', title: 'Memória útil', detail: 'Recuperação semântica de informações relevantes sem transformar todo o histórico em um prompt infinito.' },
      { label: 'Controle', title: 'Ferramentas seguras', detail: 'Separação entre raciocinar, sugerir e executar ações externas.' },
    ],
    sections: [
      {
        eyebrow: 'Linhas de trabalho',
        title: 'Sistemas que sabem quando pesquisar, calcular ou executar.',
        body: 'O runtime seleciona recursos apenas quando eles melhoram materialmente o resultado, reduzindo ruído, custo e latência desnecessários.',
        items: ['Roteamento de ferramentas', 'Atribuição e qualidade de fontes', 'Confiabilidade de tarefas longas', 'Experiência multimodal'],
      },
      {
        eyebrow: 'Transparência',
        title: 'Progresso compreensível sem expor raciocínio privado.',
        body: 'O usuário vê estados curtos como Pesquisando, Analisando e Verificando resultado. A implementação protege prompts internos, segredos e cadeia de pensamento.',
        items: ['Estados de atividade claros', 'Resultados verificáveis', 'Erros honestos e acionáveis', 'Documentação arquitetural versionada'],
      },
    ],
    ctaTitle: 'Veja a engenharia por trás do produto.',
    ctaBody: 'A arquitetura pública explica limites, ferramentas e decisões que sustentam o OMNININJA.',
    ctaLabel: 'Conhecer a plataforma',
    ctaHref: '/developers',
  },
  business: {
    slug: 'business',
    navLabel: 'Empresas',
    eyebrow: 'OMNININJA para empresas',
    title: 'Inteligência aplicada ao trabalho de cada equipe.',
    lead: 'Organize projetos, pesquise informações, analise arquivos e produza entregas em um workspace consistente para operações, produto, engenharia, conteúdo e atendimento.',
    highlights: [
      { label: 'Equipes', title: 'Conhecimento organizado', detail: 'Projetos e conversas mantêm o contexto ligado às entregas.' },
      { label: 'Operações', title: 'Trabalho repetível', detail: 'Tarefas longas seguem etapas claras e registram o resultado.' },
      { label: 'Tecnologia', title: 'Engenharia acelerada', detail: 'Análise, implementação e testes no modo Codex.' },
    ],
    sections: [
      {
        eyebrow: 'Governança',
        title: 'Controles construídos para uso responsável.',
        body: 'Autenticação, isolamento, limitação de requisições, moderação e auditoria técnica reduzem riscos sem transformar a interface em um console.',
        items: ['Sessões protegidas', 'Segredos somente no servidor', 'Limites de uso e créditos', 'Eventos e histórico persistentes'],
      },
      {
        eyebrow: 'Adoção',
        title: 'Comece pequeno e evolua com evidência.',
        body: 'A plataforma foi desenhada para validar fluxos úteis primeiro e ampliar integrações somente quando segurança, custo e retorno estiverem claros.',
        items: ['Projetos-piloto', 'Casos de uso por equipe', 'Métricas de qualidade', 'Integrações sob demanda'],
      },
    ],
    ctaTitle: 'Planeje um caso de uso para sua equipe.',
    ctaBody: 'Use o canal oficial do projeto para apresentar a necessidade e acompanhar a evolução.',
    ctaLabel: 'Falar com o OMNININJA',
    ctaHref: '/contact',
  },
  developers: {
    slug: 'developers',
    navLabel: 'Desenvolvedores',
    eyebrow: 'Plataforma para desenvolvedores',
    title: 'Uma arquitetura moderna para produtos de IA multimodais.',
    lead: 'O OMNININJA usa Responses API, ferramentas hospedadas, Realtime, mídia, embeddings e PostgreSQL em um runtime unificado. APIs públicas de terceiros serão liberadas somente após autenticação, cotas e documentação estarem prontas.',
    highlights: [
      { label: 'Runtime', title: 'Responses API', detail: 'Texto, raciocínio e ferramentas em uma única superfície de execução.' },
      { label: 'Dados', title: 'PostgreSQL + Prisma', detail: 'Usuários, sessões, tarefas, mensagens, projetos, memória e créditos persistentes.' },
      { label: 'Mídia', title: 'Multimodal', detail: 'Arquivos, visão, imagem, vídeo, transcrição, fala e Realtime.' },
    ],
    sections: [
      {
        eyebrow: 'Ferramentas',
        title: 'Capacidades hospedadas e infraestrutura opcional.',
        body: 'Pesquisa, busca em arquivos, análise de código e terminal hospedado podem ser usados automaticamente. Execução persistente externa continua isolada e nunca cai silenciosamente para o servidor principal.',
        items: ['Web Search e File Search', 'Code Interpreter e Shell', 'Moderação e embeddings', 'AI Lab/LXD opcional'],
      },
      {
        eyebrow: 'Princípios',
        title: 'API privada, identidade pública simples.',
        body: 'Chaves, modelos e provedores permanecem no servidor. O cliente recebe apenas capacidades, estados sanitizados e resultados necessários para a experiência.',
        items: ['Sem chaves no frontend', 'Sem seletor público de provider', 'Streaming por eventos sanitizados', 'Falhas fechadas para infraestrutura ausente'],
      },
    ],
    ctaTitle: 'Explore o código oficial.',
    ctaBody: 'O repositório principal registra arquitetura, migrações e validações do produto.',
    ctaLabel: 'Abrir GitHub',
    ctaHref: 'https://github.com/OmniNinjaSpacex/omnininja',
  },
  safety: {
    slug: 'safety',
    navLabel: 'Segurança',
    eyebrow: 'Segurança de IA',
    title: 'Capacidade com responsabilidade em cada etapa.',
    lead: 'O OMNININJA combina moderação, limites de ferramenta, confirmações para ações sensíveis e comunicação honesta sobre o que foi ou não executado.',
    highlights: [
      { label: 'Antes', title: 'Classificar', detail: 'Conteúdo é avaliado para identificar categorias que precisam de bloqueio ou cuidado adicional.' },
      { label: 'Durante', title: 'Conter', detail: 'Ferramentas recebem escopo mínimo, tempo limite e ambiente isolado.' },
      { label: 'Depois', title: 'Verificar', detail: 'O resultado só é apresentado como concluído quando existe confirmação técnica.' },
    ],
    sections: [
      {
        eyebrow: 'Ações externas',
        title: 'O usuário continua no controle.',
        body: 'Ações com impacto real devem apresentar contexto suficiente e pedir confirmação quando necessário. Conteúdo de páginas e arquivos é tratado como não confiável.',
        items: ['Confirmação em ações de alto impacto', 'Defesa contra prompt injection', 'Sem exposição de cadeia de pensamento', 'Relato fiel de limitações'],
      },
      {
        eyebrow: 'Execução',
        title: 'Fail-closed é uma decisão de produto.',
        body: 'Se um navegador, VM ou sandbox seguro não estiver configurado, a operação permanece bloqueada em vez de executar no servidor principal.',
        items: ['Ambientes separados por tarefa', 'Segredos removidos do ambiente filho', 'Limites de arquivo e comando', 'Timeouts e rate limits'],
      },
    ],
    ctaTitle: 'Conheça também a proteção dos dados.',
    ctaBody: 'Segurança de IA e segurança da informação funcionam como partes do mesmo sistema.',
    ctaLabel: 'Segurança e privacidade',
    ctaHref: '/security',
  },
  security: {
    slug: 'security',
    navLabel: 'Privacidade',
    eyebrow: 'Segurança e privacidade',
    title: 'Dados protegidos por arquitetura, não por promessa.',
    lead: 'Credenciais permanecem no servidor, sessões usam cookies protegidos, o banco aplica relações e índices consistentes e ambientes de execução não recebem segredos do deploy.',
    highlights: [
      { label: 'Identidade', title: 'Sessões seguras', detail: 'Tokens opacos, cookies httpOnly e expiração controlada.' },
      { label: 'Infraestrutura', title: 'Segredos isolados', detail: 'Chaves de API e conexões de banco nunca são entregues ao navegador.' },
      { label: 'Dados', title: 'Persistência responsável', detail: 'Projetos, mensagens e anexos seguem escopo do usuário autenticado.' },
    ],
    sections: [
      {
        eyebrow: 'Proteções',
        title: 'Camadas independentes reduzem o impacto de falhas.',
        body: 'Validação de entrada, rate limiting, políticas de origem, queries parametrizadas e isolamento de execução trabalham em conjunto.',
        items: ['PKCE e nonce no login Google', 'Prisma com PostgreSQL', 'Validação de URLs e anexos', 'Logs sem segredos'],
      },
      {
        eyebrow: 'Privacidade',
        title: 'Coletar apenas o necessário para entregar o serviço.',
        body: 'O produto mantém dados essenciais de conta, conversas e operação. Controles adicionais de exportação e exclusão serão publicados antes de uma abertura comercial ampla.',
        items: ['Transparência de finalidade', 'Retenção proporcional', 'Acesso limitado', 'Evolução documentada'],
      },
    ],
    ctaTitle: 'Leia como os dados são tratados.',
    ctaBody: 'A política pública resume categorias de dados, finalidades e controles disponíveis.',
    ctaLabel: 'Política de privacidade',
    ctaHref: '/privacy',
  },
  company: {
    slug: 'company',
    navLabel: 'Empresa',
    eyebrow: 'Sobre o OMNININJA',
    title: 'Construindo uma IA útil, simples e capaz de realizar.',
    lead: 'Nossa missão é transformar capacidades avançadas de IA em trabalho concreto, mantendo uma identidade clara, uma interface acessível e limites técnicos honestos.',
    highlights: [
      { label: 'Missão', title: 'Do pedido à entrega', detail: 'Reduzir a distância entre uma ideia e um resultado verificável.' },
      { label: 'Produto', title: 'Uma única IA', detail: 'Sem confundir o usuário com fornecedores, loops ou consoles internos.' },
      { label: 'Princípio', title: 'Confiança por evidência', detail: 'Nunca afirmar que algo foi executado sem um resultado confirmado.' },
    ],
    sections: [
      {
        eyebrow: 'Direção',
        title: 'Chat simples na frente. Engenharia rigorosa por trás.',
        body: 'O OMNININJA combina ergonomia de conversa com execução de tarefas longas e mantém a complexidade técnica fora do caminho do usuário.',
        items: ['Design responsivo', 'Ferramentas automáticas', 'Memória contextual', 'Infraestrutura segura'],
      },
      {
        eyebrow: 'Construção aberta',
        title: 'A main é a fonte oficial do produto.',
        body: 'Arquitetura, código e migrações evoluem no repositório oficial com build, testes e revisão antes de publicação.',
        items: ['Arquitetura documentada', 'CI obrigatório', 'Migrações versionadas', 'Releases verificáveis'],
      },
    ],
    ctaTitle: 'Acompanhe a evolução do OMNININJA.',
    ctaBody: 'Notícias de produto e mudanças relevantes ficam reunidas em um único lugar.',
    ctaLabel: 'Ver novidades',
    ctaHref: '/news',
  },
  news: {
    slug: 'news',
    navLabel: 'Notícias',
    eyebrow: 'Novidades',
    title: 'O que está mudando no OMNININJA.',
    lead: 'Atualizações de produto, infraestrutura e segurança explicadas de forma direta.',
    highlights: [
      { label: 'Produto', title: 'Chat, Work e Codex', detail: 'Três modos de experiência, uma única identidade OMNININJA.' },
      { label: 'Infraestrutura', title: 'OpenAI hospedada', detail: 'Pesquisa, análise e terminal passam a usar ferramentas hospedadas quando disponíveis.' },
      { label: 'Conta', title: 'Google como login social', detail: 'OAuth com PKCE, nonce e comportamento oculto enquanto as credenciais não estiverem configuradas.' },
    ],
    sections: [
      {
        eyebrow: 'Release atual',
        title: 'Base de produção consolidada.',
        body: 'A versão atual remove dependências antigas, preserva PostgreSQL e Prisma, melhora a experiência móvel e valida os dois builds de produção.',
        items: ['Navegação legada removida', 'Interface móvel refinada', 'Migrações Neon validadas', 'Rotas principais testadas'],
      },
      {
        eyebrow: 'Próximos passos',
        title: 'Evolução guiada por disponibilidade real.',
        body: 'Integrações que exigem contas externas, navegadores isolados ou acesso especial permanecem desativadas até que a infraestrutura correspondente esteja configurada.',
        items: ['Credenciais Google de produção', 'Harness isolado para Computer Use', 'Controles de dados do usuário', 'Avaliações contínuas'],
      },
    ],
    ctaTitle: 'Experimente a implementação atual.',
    ctaBody: 'O workspace reúne todas as capacidades já liberadas para esta implantação.',
    ctaLabel: 'Abrir OMNININJA',
    ctaHref: '/?workspace=1',
  },
  academy: {
    slug: 'academy',
    navLabel: 'Academia',
    eyebrow: 'Academia OMNININJA',
    title: 'Aprenda a transformar pedidos em boas entregas.',
    lead: 'Guias curtos para conversar melhor com a IA, organizar projetos, analisar arquivos e escolher o modo certo para cada tarefa.',
    highlights: [
      { label: 'Começar', title: 'Pedidos claros', detail: 'Informe objetivo, contexto, restrições e o formato do resultado esperado.' },
      { label: 'Organizar', title: 'Projetos', detail: 'Agrupe conversas relacionadas para manter decisões e arquivos próximos.' },
      { label: 'Verificar', title: 'Evidência', detail: 'Peça fontes, testes e critérios de conclusão quando o resultado exigir precisão.' },
    ],
    sections: [
      {
        eyebrow: 'Escolha do modo',
        title: 'Chat para entender, Work para realizar, Codex para construir.',
        body: 'O modo orienta o comportamento sem trocar de modelo publicamente. É possível mudar a qualquer momento conforme a tarefa evolui.',
        items: ['Chat: conversa e explicação', 'Work: objetivos em várias etapas', 'Codex: software e testes', 'Pensamento: esforço ajustável'],
      },
      {
        eyebrow: 'Arquivos e voz',
        title: 'Use a modalidade que contém o melhor contexto.',
        body: 'Anexe documentos e imagens quando eles forem a fonte do trabalho; use ditado para registrar ideias rápidas e voz ao vivo para conversas naturais.',
        items: ['Documentos e tabelas', 'Imagens e interfaces', 'Transcrição de áudio', 'Leitura de respostas'],
      },
    ],
    ctaTitle: 'Aprenda fazendo.',
    ctaBody: 'Abra uma conversa e descreva o resultado que você quer obter.',
    ctaLabel: 'Nova conversa',
    ctaHref: '/?workspace=1',
  },
  contact: {
    slug: 'contact',
    navLabel: 'Contato',
    eyebrow: 'Contato',
    title: 'Fale sobre produto, parceria ou implantação.',
    lead: 'Enquanto os canais comerciais dedicados são preparados, o repositório oficial concentra solicitações técnicas, dúvidas e propostas públicas.',
    highlights: [
      { label: 'Produto', title: 'Sugestões', detail: 'Explique o problema, o público e o resultado esperado.' },
      { label: 'Técnico', title: 'Problemas', detail: 'Inclua passos reproduzíveis sem anexar senhas, tokens ou dados pessoais.' },
      { label: 'Parceria', title: 'Propostas', detail: 'Descreva escopo, integração desejada e benefícios para os usuários.' },
    ],
    sections: [
      {
        eyebrow: 'Canal atual',
        title: 'GitHub oficial do OMNININJA.',
        body: 'Issues permitem registrar e acompanhar solicitações com histórico público. Nunca publique credenciais, dados de clientes ou informações confidenciais.',
        items: ['Solicitações de recurso', 'Relatos de bug', 'Discussões de arquitetura', 'Propostas de colaboração'],
      },
      {
        eyebrow: 'Segurança',
        title: 'Informações sensíveis exigem um canal privado.',
        body: 'Não envie falhas exploráveis ou segredos em issues públicas. Um canal privado de segurança será divulgado antes da abertura comercial.',
        items: ['Sem API keys', 'Sem senhas', 'Sem dados pessoais', 'Sem exploits públicos'],
      },
    ],
    ctaTitle: 'Abra uma solicitação no repositório oficial.',
    ctaBody: 'Use um título claro e forneça apenas informações que podem ser públicas.',
    ctaLabel: 'Abrir uma issue',
    ctaHref: 'https://github.com/OmniNinjaSpacex/omnininja/issues',
  },
  privacy: {
    slug: 'privacy',
    navLabel: 'Privacidade',
    eyebrow: 'Política de privacidade',
    title: 'Como o OMNININJA trata dados para operar o serviço.',
    lead: 'Esta política descreve a implementação atual. Ela será revisada antes de qualquer expansão comercial ou mudança material no tratamento de dados.',
    highlights: [
      { label: 'Conta', title: 'Dados de identidade', detail: 'Nome, e-mail, imagem de perfil e identificadores necessários para autenticação.' },
      { label: 'Uso', title: 'Conteúdo do workspace', detail: 'Conversas, arquivos, projetos, tarefas e eventos necessários para fornecer o serviço.' },
      { label: 'Operação', title: 'Dados técnicos', detail: 'Sessão, limites de uso, falhas e sinais de segurança indispensáveis à operação.' },
    ],
    sections: [
      {
        eyebrow: 'Finalidades',
        title: 'Entregar, proteger e melhorar o produto.',
        body: 'Os dados são usados para responder solicitações, manter histórico, aplicar controles de segurança, diagnosticar falhas e melhorar a confiabilidade.',
        items: ['Prestação do serviço', 'Autenticação e prevenção de abuso', 'Persistência solicitada pelo usuário', 'Manutenção e qualidade'],
      },
      {
        eyebrow: 'Fornecedores',
        title: 'Infraestrutura necessária para processar solicitações.',
        body: 'Serviços de IA, hospedagem e banco de dados podem processar informações estritamente para executar o produto. Segredos e credenciais não são enviados ao frontend.',
        items: ['Processamento de IA', 'Hospedagem da aplicação', 'PostgreSQL gerenciado', 'Monitoramento técnico essencial'],
      },
      {
        eyebrow: 'Controles',
        title: 'Acesso e exclusão evoluem com o produto.',
        body: 'Controles completos de exportação e exclusão serão disponibilizados antes de uma abertura ampla. Até lá, solicitações podem ser registradas no canal oficial.',
        items: ['Acesso autenticado', 'Escopo por usuário', 'Retenção proporcional', 'Revisão de solicitações'],
      },
    ],
    ctaTitle: 'Tem uma dúvida sobre dados?',
    ctaBody: 'Registre uma solicitação sem incluir informações confidenciais.',
    ctaLabel: 'Entrar em contato',
    ctaHref: '/contact',
  },
  terms: {
    slug: 'terms',
    navLabel: 'Termos',
    eyebrow: 'Termos de uso',
    title: 'Regras essenciais para usar o OMNININJA.',
    lead: 'Ao usar a versão atual, você concorda em utilizar o serviço de forma legal, segura e responsável, respeitando limites técnicos e direitos de terceiros.',
    highlights: [
      { label: 'Conta', title: 'Responsabilidade', detail: 'Proteja sua sessão e forneça informações corretas no cadastro.' },
      { label: 'Conteúdo', title: 'Direitos', detail: 'Envie apenas conteúdo que você pode usar e processar.' },
      { label: 'Ferramentas', title: 'Uso seguro', detail: 'Não tente burlar isolamento, limites, autenticação ou controles de segurança.' },
    ],
    sections: [
      {
        eyebrow: 'Uso permitido',
        title: 'O serviço deve apoiar trabalho legítimo.',
        body: 'É proibido usar o OMNININJA para abuso, invasão, fraude, violação de privacidade, disseminação de malware ou outras atividades ilegais.',
        items: ['Respeitar leis aplicáveis', 'Respeitar propriedade intelectual', 'Não comprometer o serviço', 'Não compartilhar credenciais'],
      },
      {
        eyebrow: 'Resultados',
        title: 'IA pode errar e exige revisão proporcional ao risco.',
        body: 'Confirme informações importantes e obtenha orientação profissional quando a decisão envolver áreas de alto impacto. Recursos podem mudar conforme disponibilidade técnica.',
        items: ['Verificar fatos importantes', 'Revisar código antes de publicar', 'Confirmar ações externas', 'Manter backups adequados'],
      },
      {
        eyebrow: 'Disponibilidade',
        title: 'A versão atual está em evolução.',
        body: 'O serviço pode ser atualizado, limitado ou interrompido para manutenção, segurança ou conformidade. Mudanças materiais serão documentadas.',
        items: ['Sem garantia de disponibilidade contínua', 'Limites de uso aplicáveis', 'Recursos dependem de infraestrutura', 'Termos sujeitos a revisão'],
      },
    ],
    ctaTitle: 'Leia também a política de privacidade.',
    ctaBody: 'Entenda quais dados sustentam a operação do produto.',
    ctaLabel: 'Política de privacidade',
    ctaHref: '/privacy',
  },
};

export const corporateSlugs = Object.keys(corporatePages);
