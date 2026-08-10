# OpenAI + Browserless setup

Configure these values only in the deployment/server secret manager. Do not commit real values.

```env
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-5.2
OPENAI_CHAT_MODEL=gpt-5.2

BROWSERLESS_API_KEY=
BROWSERLESS_REGION=production-sfo
BROWSERLESS_RECONNECT_TIMEOUT_MS=300000

NEXT_PUBLIC_APP_URL=https://omnininja-agent-os.gbvinidutra.chatgpt.site
```

## Runtime flow

1. Chat mode sends conversation messages to the OpenAI Responses API.
2. Agent/Agent MAX uses structured OpenAI function calls.
3. Function calls are dispatched to Browserless/Playwright, sandbox shell, filesystem, search, or preview tools.
4. Browser takeover creates an interactive Browserless session and returns a `liveURL` plus a reconnect endpoint. The Browserless API token itself remains server-side.
5. The agent run endpoint can receive the reconnect endpoint and execute subsequent browser actions in that same browser session.

## Secret handling

- Never place real OpenAI or Browserless keys in this repository.
- Never prefix server secrets with `NEXT_PUBLIC_`.
- Rotate any credential that has been pasted into a chat, screenshot, issue, commit, log, or public URL.
- Use the hosting platform's encrypted environment/secrets feature for production.
