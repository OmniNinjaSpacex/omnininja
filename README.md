# OmniNinja AI

OmniNinja é uma plataforma de IA conversacional com um único modelo público (`OMNINJA`), níveis de esforço, pensamento opcional, anexos, histórico, ferramentas internas e execução de tarefas.

## Hospedagem pública

A interface pública será publicada com **ChatGPT Sites**, usando a URL de produção gerada automaticamente pelo próprio ChatGPT Sites. Não usamos domínio personalizado e não usamos Render como endereço público.

O endereço público definitivo só existe depois que o Site for realmente publicado no ChatGPT Sites.

## Arquitetura

- **Frontend público:** ChatGPT Sites.
- **Modelo:** OMNINJA usando OpenAI no backend.
- **Banco:** PostgreSQL.
- **Browser:** Browserless quando configurado.
- **Sandbox Linux:** provider remoto baseado em AI Lab/LXD.
- **Segurança:** shell fail-closed; se o sandbox remoto não estiver autenticado e disponível, o OmniNinja não executa comandos arbitrários no servidor principal como fallback.

## AI Lab

Base upstream do sandbox remoto:

`https://github.com/lemonade-sdk/ailab`

A integração do OmniNinja usa containers Linux remotos por tarefa, API autenticada e terminal via WebSocket. Shell e operações de arquivos ficam no mesmo ambiente da tarefa.

## CI

O GitHub Actions valida PostgreSQL com Prisma e executa o build completo do Next.js antes de considerar uma alteração pronta.
