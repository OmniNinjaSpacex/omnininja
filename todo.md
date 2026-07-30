# OmniNinja — Plano de Execução (Clone do Manus AI)

## Fase 1: Análise ✅
- [x] Baixar workspace.tar e dossier do Mediafire
- [x] Ler e analisar o dossier técnico do Manus AI
- [x] Extrair e entender a arquitetura do projeto OmniNinja
- [x] Mapear Manus AI ↔ OmniNinja

## Fase 2: Adaptação do Código ✅
- [x] Substituir z-ai-web-dev-sdk por OpenRouter (multi-modelo)
- [x] Implementar cliente OpenRouter com fallback automático
- [x] Adicionar suporte nativo Google AI Studio para Gemini
- [x] Substituir Browserless por Chromium local (Playwright)
- [x] Rewrites: chat/route.ts, agent-loop.ts, browser-agent.ts, shell-agent.ts
- [x] Adicionar info_search_web (DuckDuckGo) e deploy_expose_port
- [x] Configurar .env com chaves do usuário
- [x] Resiliência anti-402 (max_tokens progressivo: 800→256)
- [x] Corrigir modelo Grok (grok-4.3)
- [x] Corrigir modelo Gemini (gemini-flash-latest via Google API)

## Fase 3: Build e Teste ✅
- [x] Build do projeto Next.js (17 rotas)
- [x] Copiar arquivos para standalone
- [x] Servidor rodando na porta 3000
- [x] /api/me retorna 5 provedores configurados
- [x] Testar /api/chat com todos os 5 modelos
- [x] Claude (anthropic/claude-sonnet-4) ✅
- [x] ChatGPT (openai/gpt-4o) ✅
- [x] Kimi (moonshotai/kimi-k2) ✅
- [x] Grok (x-ai/grok-4.3) ✅
- [x] Gemini (gemini-flash-latest via Google nativo) ✅
- [x] Streaming SSE funcionando (token-a-token)
- [x] Site exposto publicamente: https://01lyd.app.super.myninja.ai

## Fase 4: Entrega
- [ ] Atualizar TUTORIAL_UBUNTU.md com novas chaves/modelos
- [ ] Atualizar install.sh se necessário
- [ ] Empacotar projeto final (zip)
- [ ] Entregar tutorial + código + instruções ao usuário
