-- Continuous conversation history and ChatGPT-style organization controls.
ALTER TABLE "Task"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "branchedFromId" TEXT;

CREATE INDEX "Task_userId_pinnedAt_updatedAt_idx"
ON "Task"("userId", "pinnedAt", "updatedAt");
