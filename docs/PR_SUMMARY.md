# PR summary — OpenAI Agent OS foundation

This branch makes OpenAI the primary OmniNinja reasoning engine while preserving the existing UI/event system and keeping OpenRouter as an optional fallback.

## Main changes

- Native OpenAI Responses API chat client.
- Native OpenAI function-calling agent loop.
- Existing browser, shell, filesystem, search and preview tools wired into OpenAI tool calls.
- Browserless interactive takeover endpoint and reconnect flow.
- Server-only secret configuration.
- Corrected `.env.example` variable names and documented the target app URL.
- Added Agent OS roadmap and setup/security documentation.

## Important deployment note

No live credentials are committed. Configure `OPENAI_API_KEY` and `BROWSERLESS_API_KEY` through the hosting/deployment secret manager.
