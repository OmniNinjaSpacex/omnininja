# OmniNinja Agent OS — Integration Status

## Implemented in `openai-agent-os`

- OpenAI Responses API integration for chat.
- Native OpenAI function calling for Agent / Agent MAX.
- Server-side OpenAI secret usage via `OPENAI_API_KEY`.
- Browserless server-side secret usage via `BROWSERLESS_API_KEY`.
- Browserless interactive takeover session endpoint.
- Reconnect endpoint support in agent runs.
- Existing shell, filesystem, browser and preview tools wired into the OpenAI agent loop.
- OpenRouter retained as an optional fallback.
- Environment variable documentation corrected and expanded.
- Capability roadmap for the remaining Agent OS layers.

## Still to implement after this foundation

- Monaco / VS Code-style workspace UI connected to live task files.
- Persistent terminal process manager and multiple terminal tabs.
- Projects + knowledge base.
- Skills filesystem/package system.
- Scheduled tasks.
- Persistent cloud computer.
- Multi-agent / wide research execution.
- Full website-builder publish pipeline.
- Production-grade multi-tenant sandbox isolation.
- Usage tracing, quotas, billing, RBAC and audit logs.

## Deployment requirement

Real API credentials must be configured in the deployment secret manager. The repository intentionally contains no real OpenAI or Browserless credentials.
