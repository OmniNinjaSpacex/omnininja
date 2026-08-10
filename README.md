# OmniNinja AI

OmniNinja é uma plataforma de IA conversacional com um único modelo público (`OMNINJA`), níveis de esforço, pensamento opcional, anexos, histórico, ferramentas internas e execução de tarefas.

## Deploy rápido no Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/OmniNinjaSpacex/omnininja)

O botão acima usa o `render.yaml` deste repositório para criar um Web Service público no Render. Depois de aprovado no painel, o Render gera o endereço `*.onrender.com` do serviço.

### Variáveis obrigatórias

Configure os valores no painel do Render. Nunca coloque chaves reais no GitHub.

- `DATABASE_URL` — PostgreSQL de produção.
- `OPENAI_API_KEY` — chave usada internamente pelo OMNINJA.

O Blueprint gera `NEXTAUTH_SECRET` automaticamente e já configura `OMNINJA_MODEL`, `OPENAI_BASE_URL`, `HOSTNAME=0.0.0.0` e o health check `/api/health`.

## Estado do sandbox

O shell local continua fail-closed em produção: se não houver isolamento seguro, comandos arbitrários não são executados no host do site. A integração remota com AI Lab/LXD está sendo preparada como provider separado.

## CI

O GitHub Actions valida PostgreSQL com Prisma e executa o build completo do Next.js antes de considerar uma alteração pronta.
