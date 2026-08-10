# OmniNinja AI

OmniNinja é uma plataforma de IA conversacional com um único modelo público (`OMNINJA`), níveis de esforço, pensamento opcional, anexos, histórico, ferramentas internas e execução de tarefas.

## Hospedagem pública

A interface pública será publicada com **ChatGPT Sites**, usando a URL de produção gerada automaticamente pelo próprio ChatGPT Sites. Não usamos domínio personalizado e não usamos Render como endereço público.

O endereço público só existe depois que o Site for realmente publicado no ChatGPT Sites. Um endereço antigo ou apenas planejado não deve ser tratado como site ativo.

## Arquitetura

- **Frontend público:** ChatGPT Sites.
- **Modelo:** OMNINJA usando OpenAI no backend.
- **Banco:** PostgreSQL.
- **Browser:** Browserless quando configurado.
- **Sandbox Linux:** provider remoto baseado em AI Lab/LXD.
- **Segurança:** execução de shell continua fail-closed; se o sandbox remoto não estiver autenticado e disponível, o OmniNinja não executa comandos arbitrários no servidor principal como fallback.

## AI Lab

Base upstream estudada para o sandbox remoto:

`https://github.com/lemonade-sdk/ailab`

O AI Lab oferece containers Linux gerenciados, API autenticada e terminal via WebSocket. A integração do OmniNinja deve manter cada tarefa isolada em seu próprio ambiente e nunca enviar segredos do servidor para o container.

## CI

O GitHub Actions valida PostgreSQL com Prisma e executa o build completo do Next.js antes de considerar uma alteração pronta.
