export type ConversationHistoryMessage = {
  id?: string;
  role: string;
  content: string;
};

export type RuntimeConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function buildRuntimeConversationHistory(
  persisted: ConversationHistoryMessage[],
  currentUserText: string,
  limit = 40,
): RuntimeConversationMessage[] {
  const history = persisted.flatMap((message): RuntimeConversationMessage[] => (
    message.role === 'user' || message.role === 'assistant'
      ? [{ role: message.role, content: message.content }]
      : []
  ));
  const current: RuntimeConversationMessage = { role: 'user', content: currentUserText };
  return [...history, current].slice(-Math.max(1, limit));
}

export function selectConversationBranch<T extends ConversationHistoryMessage>(
  messages: T[],
  messageId: string,
): T[] {
  if (!messageId) return [...messages];
  const index = messages.findIndex((message) => message.id === messageId);
  return index >= 0 ? messages.slice(0, index + 1) : [...messages];
}
