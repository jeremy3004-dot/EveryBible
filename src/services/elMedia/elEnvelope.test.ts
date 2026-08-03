import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isElEnvelopeShape, verifyElEnvelope } from './elEnvelope';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const catalogEnvelope = readJson('catalog.dev.json');
const manifestEnvelope = readJson('manifest-lqdtest.json');

test('accepts well-formed envelope shape and rejects malformed ones', () => {
  assert.equal(isElEnvelopeShape(catalogEnvelope), true);
  assert.equal(isElEnvelopeShape({ keyId: 'x', algorithm: 'RS256', compactJws: 'a.b.c' }), false);
  assert.equal(
    isElEnvelopeShape({ keyId: 'x', algorithm: 'ES256', compactJws: 'not-a-jws' }),
    false
  );
  assert.equal(isElEnvelopeShape(null), false);
});

test('verifies the signed fixture catalog and returns its payload', async () => {
  const payload = (await verifyElEnvelope(catalogEnvelope, jwks)) as Record<string, unknown> | null;
  assert.ok(payload);
  assert.equal(payload.schema_version, 'lqd-catalog/v1');
});

test('verifies the signed fixture manifest through the same code path', async () => {
  const payload = (await verifyElEnvelope(manifestEnvelope, jwks)) as Record<
    string,
    unknown
  > | null;
  assert.ok(payload);
  assert.equal(payload.schema, 'everybible-audio-manifest/v1');
});

test('rejects a tampered compactJws without throwing', async () => {
  const parts = catalogEnvelope.compactJws.split('.');
  const tamperedPayload = parts[1].slice(0, -2) + (parts[1].endsWith('A') ? 'BB' : 'AA');
  const tampered = {
    ...catalogEnvelope,
    compactJws: [parts[0], tamperedPayload, parts[2]].join('.'),
  };
  assert.equal(await verifyElEnvelope(tampered, jwks), null);
});

test('rejects when keyId is not in the key set', async () => {
  assert.equal(await verifyElEnvelope({ ...catalogEnvelope, keyId: 'unknown-kid' }, jwks), null);
});

test('rejects kid/keyId mismatch', async () => {
  // envelope claims the dev kid but we present a key set where that kid maps to a different key
  const wrongKey = {
    ...jwks[0],
    kid: 'lqd-dev-2026-a',
    x: 'FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU',
    y: 'Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM',
  };
  assert.equal(await verifyElEnvelope(catalogEnvelope, [wrongKey]), null);
});
