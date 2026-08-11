import assert from 'node:assert/strict';
import test from 'node:test';
import {
  oauthPkceChallenge,
  parseOAuthProvider,
  randomOAuthToken,
  safeOAuthReturnTo,
} from '../src/lib/oauth-config.ts';

test('OAuth providers and return paths are allowlisted', () => {
  assert.equal(parseOAuthProvider('google'), 'google');
  assert.equal(parseOAuthProvider('facebook'), null);
  assert.equal(parseOAuthProvider('openrouter'), null);

  assert.equal(safeOAuthReturnTo('/projects?view=recent'), '/projects?view=recent');
  assert.equal(safeOAuthReturnTo('https://attacker.example'), '/');
  assert.equal(safeOAuthReturnTo('//attacker.example'), '/');
  assert.equal(safeOAuthReturnTo('/\\attacker.example'), '/');
});

test('OAuth PKCE uses the RFC 7636 S256 transform', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(
    await oauthPkceChallenge(verifier),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );

  const first = randomOAuthToken();
  const second = randomOAuthToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});
