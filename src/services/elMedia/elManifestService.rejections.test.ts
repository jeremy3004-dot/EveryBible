import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';

import { getElManifest, __resetElManifestRuntimeForTests } from './elManifestService';
import type { ElCatalogTranslation } from './elCatalogModel';
import type { ElJwk } from './elEnvelope';
import { sha256Bytes, sha256HexSync } from './elEs256';

// Signed-manifest rejection paths. Each envelope here is signed by a throwaway test key that
// the injected trust store holds, and each entry's manifest_sha256 is the digest of the exact
// bytes served, so every case gets past the integrity pre-check and fails (or passes) on the
// signature/payload rule it names.

const CATALOG_BASE_URL = 'https://media.example.test';
const MANIFEST_PATH = '/manifests/audio/lqdtest/v2026-07-20-1.json';
const MANIFEST_URL = `${CATALOG_BASE_URL}${MANIFEST_PATH}`;
const KEY_ID = 'lqd-test-signer';

const fixtureEnvelope = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/manifest-lqdtest.json', import.meta.url).href),
    'utf8'
  )
) as { compactJws: string };
// The real fixture manifest payload (lqdtest, v2026-07-20-1, JHN 1-2), re-signed below.
const fixturePayload = JSON.parse(
  Buffer.from(fixtureEnvelope.compactJws.split('.')[1] as string, 'base64url').toString('utf8')
) as Record<string, unknown>;

const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const encodeJson = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

const privateKey = new Uint8Array(32).fill(11);
const publicKey = p256.getPublicKey(privateKey, false);
const trustedKey: ElJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: toBase64Url(publicKey.slice(1, 33)),
  y: toBase64Url(publicKey.slice(33)),
  kid: KEY_ID,
  alg: 'ES256',
  use: 'sig',
};
const getKeys = async () => [trustedKey];

function signCompactJws(payload: unknown, headerKid = KEY_ID): string {
  const headerSegment = encodeJson({ alg: 'ES256', kid: headerKid });
  const payloadSegment = encodeJson(payload);
  const signingInput = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = p256
    .sign(sha256Bytes(signingInput), privateKey, { format: 'compact', lowS: false })
    .toCompactRawBytes();
  return `${headerSegment}.${payloadSegment}.${toBase64Url(signature)}`;
}

const envelopeBytes = (envelope: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(envelope));

const signedEnvelope = (payload: unknown, headerKid?: string) => ({
  keyId: KEY_ID,
  algorithm: 'ES256',
  compactJws: signCompactJws(payload, headerKid),
});

function entryFor(bytes: Uint8Array): ElCatalogTranslation {
  return {
    translationId: 'lqdtest',
    languageIso6393: 'eng',
    languageName: 'English (EL test)',
    translationName: 'EL Test Translation',
    abbreviation: 'LQTEST',
    source: 'langquest',
    copyright: 'CC0-1.0',
    deliveryMode: 'chapter',
    hasAudio: true,
    currentAudioVersion: 'v2026-07-20-1',
    manifestUrl: MANIFEST_PATH,
    manifestSha256: sha256HexSync(bytes),
  };
}

function createMemoryStorage(options: { failWrites?: boolean; failReads?: boolean } = {}) {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: async (key: string) => {
      if (options.failReads) throw new Error('storage unavailable');
      return raw.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (options.failWrites) throw new Error('disk full');
      raw.set(key, value);
    },
  };
}

function serve(bytes: Uint8Array) {
  const requests: string[] = [];
  const fetchFn = (async (url: string) => {
    requests.push(url);
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

beforeEach(() => {
  __resetElManifestRuntimeForTests();
});

test('a manifest re-signed by a trusted key is accepted and written to the disk cache', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload));
  const storage = createMemoryStorage();
  const server = serve(bytes);

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: server.fetchFn,
    storage,
    getKeys,
  });

  assert.equal(manifest?.translationId, 'lqdtest');
  assert.equal(manifest?.audioVersion, 'v2026-07-20-1');
  assert.deepEqual(server.requests, [MANIFEST_URL]);
  assert.equal(storage.raw.size, 1);
});

test('a signature lifted from a different document is rejected and nothing is cached', async () => {
  const genuine = signedEnvelope(fixturePayload);
  const other = signedEnvelope({ ...fixturePayload, audio_version: 'v2026-07-21-1' });
  const [header, payload] = genuine.compactJws.split('.');
  const foreignSignature = other.compactJws.split('.')[2];
  const bytes = envelopeBytes({
    ...genuine,
    compactJws: `${header}.${payload}.${foreignSignature}`,
  });
  const storage = createMemoryStorage();

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: serve(bytes).fetchFn,
    storage,
    getKeys,
  });

  assert.equal(manifest, null);
  assert.equal(storage.raw.size, 0);
});

test('a signed payload whose protected-header kid disagrees with the envelope keyId is rejected', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload, 'some-other-kid'));
  const storage = createMemoryStorage();

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: serve(bytes).fetchFn,
    storage,
    getKeys,
  });

  assert.equal(manifest, null);
  assert.equal(storage.raw.size, 0);
});

test('a correctly signed payload that is not an audio manifest is rejected', async () => {
  for (const payload of [
    { ...fixturePayload, schema: 'everybible-audio-manifest/v2' },
    { ...fixturePayload, books: 'JHN' },
    ['not', 'an', 'object'],
  ]) {
    __resetElManifestRuntimeForTests();
    const bytes = envelopeBytes(signedEnvelope(payload));
    const storage = createMemoryStorage();

    const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
      fetchFn: serve(bytes).fetchFn,
      storage,
      getKeys,
    });

    assert.equal(manifest, null, JSON.stringify(payload).slice(0, 60));
    assert.equal(storage.raw.size, 0);
  }
});

test('bytes that match the advertised digest but are not JSON are rejected', async () => {
  const bytes = new TextEncoder().encode('<html>502 Bad Gateway</html>');

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: serve(bytes).fetchFn,
    storage: createMemoryStorage(),
    getKeys,
  });

  assert.equal(manifest, null);
});

test('a JSON body that is not an ES256 envelope is rejected before any key lookup', async () => {
  let keyLookups = 0;
  const bytes = envelopeBytes({ ...signedEnvelope(fixturePayload), algorithm: 'RS256' });

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: serve(bytes).fetchFn,
    storage: createMemoryStorage(),
    getKeys: async () => {
      keyLookups += 1;
      return [trustedKey];
    },
  });

  assert.equal(manifest, null);
  assert.equal(keyLookups, 0);
});

test('a trust-store lookup that throws is treated as a failed verification', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload));
  const storage = createMemoryStorage();

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: serve(bytes).fetchFn,
    storage,
    getKeys: async () => {
      throw new Error('keystore unavailable');
    },
  });

  assert.equal(manifest, null);
  assert.equal(storage.raw.size, 0);
});

test('an unreadable disk cache entry is ignored and the manifest is fetched and re-verified', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload));
  const storage = createMemoryStorage();
  const diskKey = `el-media:manifest:${sha256HexSync(new TextEncoder().encode(MANIFEST_URL))}`;
  storage.raw.set(diskKey, '{"schema":');
  const server = serve(bytes);

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: server.fetchFn,
    storage,
    getKeys,
  });

  assert.equal(manifest?.translationId, 'lqdtest');
  assert.equal(server.requests.length, 1);
  assert.equal(
    JSON.parse(storage.raw.get(diskKey) as string).payload.schema,
    fixturePayload.schema
  );
});

test('a disk cache whose reads throw falls through to the network', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload));
  const server = serve(bytes);

  const manifest = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, {
    fetchFn: server.fetchFn,
    storage: createMemoryStorage({ failReads: true }),
    getKeys,
  });

  assert.equal(manifest?.translationId, 'lqdtest');
  assert.equal(server.requests.length, 1);
});

test('a failed disk write still returns the verified manifest and serves it from memory', async () => {
  const bytes = envelopeBytes(signedEnvelope(fixturePayload));
  const storage = createMemoryStorage({ failWrites: true });
  const server = serve(bytes);
  const deps = { fetchFn: server.fetchFn, storage, getKeys };

  const first = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, deps);
  const second = await getElManifest(entryFor(bytes), CATALOG_BASE_URL, deps);

  assert.equal(first?.translationId, 'lqdtest');
  assert.equal(second, first);
  assert.equal(server.requests.length, 1);
  assert.equal(storage.raw.size, 0);
});
