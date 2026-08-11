import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateHostname,
  validatePublicHttpUrl,
} from '../src/lib/public-http-url.ts';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  normalizeOmniNinjaAttachments,
} from '../src/lib/omnininja-attachments.ts';
import { checkRateLimit } from '../src/lib/rate-limit.ts';
import { openAISafetyIdentifier } from '../src/lib/openai-safety.ts';
import { parseJsonRequest } from '../src/lib/http-body.ts';
import {
  readPublicApiError,
  safePublicApiError,
} from '../src/lib/public-api-error.ts';

test('browser navigation rejects local and private destinations', () => {
  for (const hostname of [
    'localhost',
    'api.internal',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
  ]) {
    assert.equal(isPrivateHostname(hostname), true, hostname);
  }

  assert.throws(() => validatePublicHttpUrl('http://127.0.0.1/admin'));
  assert.throws(() => validatePublicHttpUrl('file:///etc/passwd'));
  assert.throws(() => validatePublicHttpUrl('https://user:pass@example.com'));
  assert.equal(validatePublicHttpUrl('https://example.com/path'), 'https://example.com/path');
});

test('attachment normalization verifies encoded size and server-side limits', () => {
  const raw = Buffer.from('conteúdo de teste', 'utf8');
  const valid = {
    id: 'attachment-1',
    name: 'teste.txt',
    mimeType: 'text/plain',
    size: raw.byteLength,
    dataUrl: `data:text/plain;base64,${raw.toString('base64')}`,
  };

  assert.deepEqual(normalizeOmniNinjaAttachments([valid]), [valid]);
  assert.deepEqual(normalizeOmniNinjaAttachments([{ ...valid, size: 1 }]), []);
  assert.deepEqual(normalizeOmniNinjaAttachments([{ ...valid, dataUrl: 'data:text/plain,abc' }]), []);
  assert.equal(
    normalizeOmniNinjaAttachments(Array.from({ length: 20 }, (_, index) => ({
      ...valid,
      id: String(index),
    }))).length,
    MAX_ATTACHMENTS_PER_MESSAGE,
  );
});

test('rate limiter blocks requests after the configured allowance', () => {
  const request = new Request('https://example.com', {
    headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
  });
  const scope = `test-${crypto.randomUUID()}`;

  assert.deepEqual(checkRateLimit(request, scope, 2, 60_000), { ok: true });
  assert.deepEqual(checkRateLimit(request, scope, 2, 60_000), { ok: true });
  const blocked = checkRateLimit(request, scope, 2, 60_000);
  assert.equal(blocked.ok, false);
});

test('OpenAI safety identifiers are stable and privacy-preserving', () => {
  const first = openAISafetyIdentifier('user-a');
  assert.equal(first, openAISafetyIdentifier('user-a'));
  assert.notEqual(first, openAISafetyIdentifier('user-b'));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes('user-a'), false);
});

test('JSON request parsing enforces a streaming byte limit', async () => {
  const valid = await parseJsonRequest(new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ ok: true }),
  }), 1024);
  assert.equal(valid.ok, true);

  const oversized = await parseJsonRequest(new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(200) }),
  }), 32);
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.response.status, 413);
});

test('public API errors never expose infrastructure HTML', async () => {
  const fallback = 'Serviço temporariamente indisponível.';
  const htmlResponse = new Response('<!DOCTYPE html><html><body>internal stack</body></html>', {
    status: 500,
    headers: { 'content-type': 'text/html' },
  });
  assert.equal(await readPublicApiError(htmlResponse, fallback), fallback);
  assert.equal(safePublicApiError('<script>internal</script>', fallback), fallback);

  const jsonResponse = Response.json(
    { error: 'Tente novamente em instantes.' },
    { status: 503 },
  );
  assert.equal(
    await readPublicApiError(jsonResponse, fallback),
    'Tente novamente em instantes.',
  );
});
