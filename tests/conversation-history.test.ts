import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeConversationHistory,
  selectConversationBranch,
} from '../src/lib/conversation-history.ts';

test('continuous conversation history keeps valid roles and appends one current prompt', () => {
  const history = buildRuntimeConversationHistory([
    { role: 'system', content: 'private' },
    { role: 'user', content: 'primeira' },
    { role: 'assistant', content: 'resposta' },
  ], 'continuação');

  assert.deepEqual(history, [
    { role: 'user', content: 'primeira' },
    { role: 'assistant', content: 'resposta' },
    { role: 'user', content: 'continuação' },
  ]);
});

test('conversation branching stops at a persisted message and safely falls back to all', () => {
  const messages = [
    { id: 'one', role: 'user', content: 'pergunta' },
    { id: 'two', role: 'assistant', content: 'resposta' },
    { id: 'three', role: 'user', content: 'outra' },
  ];

  assert.deepEqual(selectConversationBranch(messages, 'two'), messages.slice(0, 2));
  assert.deepEqual(selectConversationBranch(messages, 'client-only-id'), messages);
});
