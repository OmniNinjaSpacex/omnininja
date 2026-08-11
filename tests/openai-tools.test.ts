import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAIHostedTools } from '../src/lib/openai-services.ts';
import { collectContainerArtifacts } from '../src/lib/openai-artifacts.ts';

test('OpenAI hosted tools include web, code and isolated shell', () => {
  const previous = process.env.OPENAI_VECTOR_STORE_IDS;
  delete process.env.OPENAI_VECTOR_STORE_IDS;

  try {
    assert.deepEqual(buildOpenAIHostedTools(), [
      { type: 'web_search' },
      { type: 'code_interpreter', container: { type: 'auto' } },
      { type: 'shell', environment: { type: 'container_auto' } },
    ]);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_VECTOR_STORE_IDS;
    else process.env.OPENAI_VECTOR_STORE_IDS = previous;
  }
});

test('File Search is exposed only for configured vector stores', () => {
  const previous = process.env.OPENAI_VECTOR_STORE_IDS;
  process.env.OPENAI_VECTOR_STORE_IDS = 'vs_primary, vs_docs, ,vs_primary';

  try {
    const fileSearch = buildOpenAIHostedTools().find((tool) => tool.type === 'file_search');
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
