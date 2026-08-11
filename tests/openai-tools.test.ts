import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAIHostedTools } from '../src/lib/openai-services.ts';
import { collectContainerArtifacts } from '../src/lib/openai-artifacts.ts';
import { publicOmniNinjaRuntimeError } from '../src/lib/omnininja-runtime-error.ts';

test('OpenAI hosted tools select one compatible container executor per mode', () => {
  const previous = process.env.OPENAI_VECTOR_STORE_IDS;
  delete process.env.OPENAI_VECTOR_STORE_IDS;

  try {
    assert.deepEqual(buildOpenAIHostedTools('chat'), [
      { type: 'web_search' },
      { type: 'code_interpreter', container: { type: 'auto' } },
    ]);
    assert.deepEqual(buildOpenAIHostedTools('work'), [
      { type: 'web_search' },
      { type: 'shell', environment: { type: 'container_auto' } },
    ]);
    assert.deepEqual(buildOpenAIHostedTools('codex'), buildOpenAIHostedTools('work'));

    for (const mode of ['chat', 'work', 'codex'] as const) {
      const types = buildOpenAIHostedTools(mode).map((tool) => tool.type);
      assert.equal(types.includes('code_interpreter') && types.includes('shell'), false);
    }
  } finally {
    if (previous === undefined) delete process.env.OPENAI_VECTOR_STORE_IDS;
    else process.env.OPENAI_VECTOR_STORE_IDS = previous;
  }
});

test('File Search is exposed only for configured vector stores', () => {
  const previous = process.env.OPENAI_VECTOR_STORE_IDS;
  process.env.OPENAI_VECTOR_STORE_IDS = 'vs_primary, vs_docs, ,vs_primary';

  try {
    const fileSearch = buildOpenAIHostedTools('chat').find((tool) => tool.type === 'file_search');
    assert.deepEqual(fileSearch, {
      type: 'file_search',
      vector_store_ids: ['vs_primary', 'vs_docs'],
      max_num_results: 12,
    });
  } finally {
    if (previous === undefined) delete process.env.OPENAI_VECTOR_STORE_IDS;
    else process.env.OPENAI_VECTOR_STORE_IDS = previous;
  }
});

test('OpenAI quota and rate failures produce actionable public messages', () => {
  const quotaError = Object.assign(new Error('private detail'), {
    runtimeCode: 'openai_insufficient_quota',
  });
  const rateError = Object.assign(new Error('private detail'), {
    runtimeCode: 'openai_rate_limit',
  });

  assert.match(publicOmniNinjaRuntimeError(quotaError), /créditos de API/);
  assert.match(publicOmniNinjaRuntimeError(rateError), /limite temporário/);
  assert.doesNotMatch(publicOmniNinjaRuntimeError(new Error('<html>private</html>')), /html|private/i);
});

test('container file citations become deduplicated private artifact references', () => {
  const annotation = {
    type: 'container_file_citation',
    container_id: 'cntr_report_123',
    file_id: 'file_report_456',
    filename: 'relatorio.pdf',
  };
  const artifacts = collectContainerArtifacts({
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text: 'Arquivo pronto.',
        annotations: [annotation, annotation, { ...annotation, file_id: '../unsafe' }],
      }],
    }],
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].name, 'relatorio.pdf');
  assert.equal(artifacts[0].kind, 'file');
  assert.deepEqual(JSON.parse(artifacts[0].path), {
    provider: 'openai-container',
    containerId: 'cntr_report_123',
    fileId: 'file_report_456',
  });
});
