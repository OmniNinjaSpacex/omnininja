# OmniNinja — 3-Mode System + Permanent Deployment

## Phase 1: 3-Mode System (chat / agent / agent_max)
- [x] Add `message_notify_user` tool to agent-loop.ts so agent can "talk" to user during execution
- [x] Make MAX_ITERATIONS dynamic based on mode (agent=15, agent_max=30)
- [x] Add mode-specific system prompts (agent = think more, agent_max = full power for complex tasks)
- [x] Modify use-agent-runner.ts: chat → /api/chat always; agent/agent_max → /api/agent/run with mode
- [x] Update agent/run/route.ts to pass mode to loop and adjust limits (maxDuration 600s)
- [x] Stream agent's `message_notify_user` events into the chat as conversational messages
- [x] Update chat-input.tsx mode pills with better labels/placeholders
- [x] Increase chat maxTokens to 1024 for richer conversation
- [x] Build & verify no TS errors

## Phase 2: Build & Test
- [x] npm run build (clean, 17 routes)
- [x] Test chat mode (streaming Claude response ✓)
- [x] Test agent mode (file_write + shell_exec + message_notify_user ✓)
- [x] Verify agent "talks" to user via message_notify_user ✓

## Phase 3: Permanent Deployment
- [x] Deploy permanent landing site: https://sites.super.myninja.ai/41455705-a6b3-462e-8d90-20a3aa1f3552/50b2483b/index.html
- [x] Push final code to GitHub (commit: 52df403)
- [x] OmniNinja app live: https://01lyd.app.super.myninja.ai
- [x] Deliver single deployment command for Ubuntu

## Phase 4: Final Delivery
- [x] Summarize everything to user
