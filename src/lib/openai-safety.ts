import { createHash } from 'node:crypto';

/** Stable, privacy-preserving identifier for OpenAI request-level safeguards. */
export function openAISafetyIdentifier(userId: string): string {
  return createHash('sha256')
    .update(`omnininja-user:${userId}`)
    .digest('hex');
}
