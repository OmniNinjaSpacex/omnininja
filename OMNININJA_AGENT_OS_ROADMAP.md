# OmniNinja Agent OS — Capability Roadmap

## Vision

OmniNinja is a general-purpose AI Agent OS: chat + autonomous execution + cloud browser + isolated compute + files + terminal + code workspace + previews + persistent projects.

## P0 — Foundation (this branch)

- Native OpenAI Responses API as the primary reasoning engine.
- Structured function calling for agent tools.
- Chat mode backed by OpenAI when `OPENAI_API_KEY` is configured.
- Agent / Agent MAX execution through the existing SSE event stream.
- Browserless cloud browser.
- Interactive Browserless takeover session for login/MFA/manual intervention.
- Browser tools: navigate, click, type, scroll, screenshot, text/HTML extraction, JS, keyboard, history.
- Shell execution inside the task sandbox.
- File read/write/list tools.
- Lightweight web search tool.
- Preview/expose-port tool.
- Secret-safe server configuration through environment variables.
- OpenRouter remains an optional fallback instead of the primary dependency.

## P1 — Full computer workspace

- VS Code-style editor panel with Monaco.
- Real file explorer synchronized with each task workspace.
- Terminal tabs and long-running process manager.
- Preview panel with port discovery and live reload.
- Artifact downloads and project ZIP export.
- Task pause/resume/cancel.
- Human approval checkpoints for sensitive external actions.
- Persistent browser profiles where appropriate.

## P2 — Persistent product layer

- Projects with custom instructions and knowledge/files.
- Skills stored as reusable filesystem packages.
- Scheduled tasks.
- Persistent cloud computer per user/project.
- Task checkpoints and resumable event log.
- Secret vault for user integrations.
- Connectors for GitHub, Google services and additional APIs.

## P3 — Multi-agent / wide execution

- Planner decomposes complex goals into independent subtasks.
- Parallel workers with concurrency and cost limits.
- Shared artifact/task store instead of shared hidden context.
- Aggregator/verifier agent merges results and resolves conflicts.
- Specialized optional workers for research, browser, coding and data tasks.

## P4 — Website/app builder

- Plan -> build -> live preview -> iterate -> publish flow.
- Repository creation/import.
- Build logs and health checks.
- Temporary preview deployments.
- Permanent publish pipeline and rollback.
- Domain configuration.

## P5 — Platform / company readiness

- Teams and organizations.
- RBAC and audit logs.
- Usage metering, quotas and billing ledger.
- Rate limits and abuse controls.
- Tracing per task/model/tool.
- Encrypted secrets and backups.
- Production-grade multi-tenant sandbox isolation.

## Security rules

1. Never commit API keys, cookies, session tokens, passwords or cloud credentials.
2. Keep OpenAI and Browserless credentials server-side only.
3. Never expose environment variables through terminal output or generated artifacts.
4. Treat task sandboxes as untrusted workloads.
5. Use production-grade VM/microVM/container isolation before allowing arbitrary multi-tenant shell access.
6. Require human takeover/approval for authentication and other sensitive external operations.
