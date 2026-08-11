-- Align persisted display metadata with the official public product identity.
ALTER TABLE "User" ALTER COLUMN "defaultModel" SET DEFAULT 'OMNININJA';
ALTER TABLE "Task" ALTER COLUMN "mode" SET DEFAULT 'chat';
ALTER TABLE "Task" ALTER COLUMN "model" SET DEFAULT 'OMNININJA';
ALTER TABLE "ScheduledTask" ALTER COLUMN "mode" SET DEFAULT 'work';
ALTER TABLE "Message" ALTER COLUMN "model" SET DEFAULT 'OMNININJA';

UPDATE "User"
SET "defaultModel" = 'OMNININJA'
WHERE "defaultModel" = 'OMNINJA';

UPDATE "Task"
SET "model" = 'OMNININJA'
WHERE "model" = 'OMNINJA';

UPDATE "Message"
SET "model" = 'OMNININJA'
WHERE "model" = 'OMNINJA';
