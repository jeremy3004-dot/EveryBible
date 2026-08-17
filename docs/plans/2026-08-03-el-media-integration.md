# Every Language Media Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consume Every Language's signed audio-Bible distribution (catalog + manifests + chapter MP3s from their Cloudflare estate) as an additive catalog source in the EveryBible app, behind a feature flag defaulting OFF, and (in a separate PR) retire the dead LangQuest ingest workstream.

**Architecture:** A new self-contained service layer `src/services/elMedia/` fetches a signed catalog envelope, verifies it (ES256 JWS against pinned keys + JWKS rotation discovery), tolerantly parses it, persists a last-verified copy with a monotonic-sequence rollback guard, and maps entries into the app's existing `BibleTranslation` merge path. Chapter audio resolves through a new `'el-manifest'` audio strategy in `audioRemote.ts` backed by verified, immutable, cached manifests. Playback and downloads reuse the existing chapter machinery unchanged.

**Tech Stack:** React Native / Expo 54, TypeScript strict, `jose` v6 (already a dependency), `node --test` + `tsx` for tests, Zustand, AsyncStorage.

---

## Part A — Ground truth (read before coding)

### A1. Contract status: LOCKED

The contract is **rev 2026-07-18** of `jeremy-app-integration.md` — the copy inside
`/Users/dev/Downloads/lqd-jeremy-handoff-2026-07-19/`, NOT the older copy at
`/Users/dev/Downloads/jeremy-app-integration.md` (that one predates the signed-catalog
upgrade). The schema locked when K1 shipped on 2026-07-19. Differences vs the stale copy
that MUST be honored:

1. **`catalog.dev.json` / `catalog.json` are signed envelopes** (`{keyId, algorithm, compactJws}`),
   same shape as manifests. One verification code path covers both document types.
2. Catalog payload has a **`sequence` (integer)** field. Reject a verified catalog whose
   sequence is lower than the last verified one (rollback/replay guard).
3. Four per-translation fields added: `translation_name` (required), `abbreviation`
   (required), `language_autonym` (optional), `text_direction` (optional, `ltr`|`rtl`).
4. **Key pinning is the recommended trust model**: pin the published public keys in the app
   build; treat the `/.well-known/keys.json` JWKS endpoint as rotation discovery only.
5. Guarantee (contract-tested on EL's side): JWS protected-header `kid` always equals the
   envelope `keyId`. Reject on mismatch anyway.

### A2. Live estate (verified reachable 2026-08-03)

| What | Value |
|---|---|
| Dev/staging base URL (until launch cutover) | `https://lqd-media.platform-979.workers.dev` |
| Production base URL (post-cutover; same contract) | `https://media.everylanguage.com` |
| JWKS | `GET /.well-known/keys.json` (serves both kids below) |
| Dev catalog (contains `lqdtest`) | `GET /catalog.dev.json` — signed with the PROD key |
| Prod catalog (`lqdtest` intentionally absent; still signed) | `GET /catalog.json` |
| Live test content | `lqdtest`: Jonah 1–3, CC0 test audio, `language_iso639_3: "mis"` |
| Cache regimes | catalogs: 5-min TTL + stale-while-revalidate; manifests/audio: immutable; audio supports Range → 206 |

**Pinned keys** (EC P-256, ES256; fetched live from the JWKS on 2026-08-03 — re-verify with
`curl -s https://lqd-media.platform-979.workers.dev/.well-known/keys.json` before committing):

```json
[
  {"kty":"EC","crv":"P-256","x":"FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU","y":"Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM","kid":"lqd-prod-2026-a","alg":"ES256","use":"sig"},
  {"kty":"EC","crv":"P-256","x":"a6Wa5f9HTdnDALAfWytZJUfoI0ZORwyoiOANmdtqYaU","y":"QakRiI46mgqVpTaAl3_H66FOE3szL0Xs58PLDbrxibQ","kid":"lqd-dev-2026-a","alg":"ES256","use":"sig"}
]
```

`lqd-prod-2026-a` signs everything live. `lqd-dev-2026-a` signed the offline fixture pack.
Pin BOTH (fixtures must verify in tests through the same path).

### A3. Fixture pack

`/Users/dev/Downloads/lqd-jeremy-handoff-2026-07-19/lqd-fixture-pack-2026-07-18.zip`
contains `examples/{catalog.dev.json, manifest-lqdtest.json, dev.jwks.json, verify-example.ts, README.md}`.
The two JSON envelopes are REAL signed documents (dev key). Fixture manifest: `lqdtest`
`v2026-07-20-1`, book `JHN`, chapters 1–2, `file_ext: "mp3"`, per-chapter `path`, `bytes`,
`sha256`, `duration_ms`. Fixture catalog payload exercises every field incl. `sequence: 1`,
`language_autonym`, `text_direction`.

### A4. Catalog payload shape (verified JWS payload, snake_case)

```jsonc
{
  "schema_version": "lqd-catalog/v1",
  "sequence": 1,
  "generated_at": "2026-07-19T17:00:24.763Z",
  "base_url": "https://lqd-media.platform-979.workers.dev",
  "translations": [{
    "translation_id": "lqdtest",        // always lq-prefixed, lowercase — collision-proof
    "language_iso639_3": "mis",
    "language_name": "Test Language",
    "translation_name": "LangQuest Distribution Test",
    "abbreviation": "LQDT",
    "language_autonym": "…",             // optional
    "text_direction": "ltr",             // optional, ltr|rtl
    "source": "langquest",
    "copyright": "CC0-1.0",
    "delivery_mode": "chapter",          // skip entries with unknown modes ("segment" may appear later)
    "has_audio": true,
    "current_audio_version": "v2026-07-20-1",
    "manifest_url": "/manifests/audio/lqdtest/v2026-07-20-1.json",  // resolve against base_url
    "manifest_sha256": "<64-hex of manifest file bytes>"            // optional integrity pre-check
  }]
}
```

Compatibility rules: ignore unknown fields; skip entries with unknown `delivery_mode` or
unknown `schema_version` major; never hard-fail the whole catalog over one bad entry.

### A5. Manifest payload shape (verified JWS payload)

```jsonc
{
  "schema": "everybible-audio-manifest/v1",   // deliberately EveryBible's own policy schema
  "translation_id": "lqdtest",
  "audio_version": "v2026-07-20-1",
  "delivery_mode": "chapter",
  "base_url": "https://lqd-media.platform-979.workers.dev",
  "file_ext": "mp3",
  "mime_type": "audio/mpeg",
  "total_books": 1, "total_chapters": 2, "total_bytes": 5406208,
  "books": { "JHN": { "chapters": [
    { "chapter": 1, "path": "/audio/lqdtest/v2026-07-20-1/chapters/JHN/1.mp3",
      "bytes": 2703104, "sha256": "<64-hex>", "duration_ms": 225000 } ] } }
}
```

Book keys are 3-letter USFM (`GEN`…`REV`) — identical to `src/constants/books.ts` IDs.
Manifests and audio are IMMUTABLE by URL: cache forever, never cache-bust; a new
`current_audio_version` in the catalog is how new bytes arrive.

### A6. Existing app integration points (scouted 2026-08-03, with line refs)

| Concern | Where |
|---|---|
| `SignedCatalogEnvelope` type (exists, reuse) | `src/types/bible.ts:148` |
| Existing JWS verify (PEM/SPKI-based, via dynamic `import('jose')`) | `src/services/bible/bibleDataModel.ts:281-311` (`verifySignedCatalogManifest`, `isManifestVerificationRuntimeSupported`) |
| Runtime catalog bootstrap (once-per-launch, deferred warmup) | `src/services/translations/runtimeTranslationBootstrap.ts:37` |
| Catalog fetch from Supabase | `src/services/translations/translationService.ts:34` |
| Catalog→BibleTranslation mapping to mirror | `src/services/translations/translationCatalogModel.ts:106` (`mapCatalogEntryToBibleTranslation`) |
| Store merge | `src/stores/bibleStore.ts:389` (`applyRuntimeCatalog`) |
| Audio URL resolution + strategy dispatch | `src/services/audio/audioRemote.ts:474-545` (`fetchRemoteChapterAudio`) |
| Audio catalog type (strategy union to extend) | `src/types/bible.ts:82-94` (`TranslationAudioCatalog`) |
| Download machinery (decoupled via `resolveRemoteAudio` callback) | `src/services/audio/audioDownloadService.ts` (path convention :365-411, ext resolution reads `catalog.audio.fileExtension`) |
| Env var registry (MUST register new vars here) | `src/services/startup/publicRuntimeConfig.ts:2-11` |
| Feature flags (synchronous, local) | `src/services/featureFlags/featureFlags.ts` |
| Picker UI | `src/screens/bible/TranslationPickerList.tsx:70`, `src/screens/more/TranslationBrowserScreen.tsx` |
| Book constants (USFM ids) | `src/constants/books.ts:12` |
| Test style: `node --test` + `tsx`, hand-rolled doubles, DI via setter/params | e.g. `src/services/audio/audioRemote.test.ts` |
| i18n: 21 locales, coverage test enforces completeness | `src/i18n/locales/`, `coverage.test.ts` |

**Runtime caveat:** verification requires `crypto.subtle` (checked by
`isManifestVerificationRuntimeSupported()`). If unsupported at runtime, the EL source must
degrade to "unavailable" — never crash, never show unverified content.

---

## Part B — Design decisions (locked; don't re-litigate during execution)

1. **New directory `src/services/elMedia/`** — self-contained, barrel-exported. Nothing
   outside it imports `jose` or knows about JWKS. Worst-case failure mode = EL translations
   don't appear; nothing can regress existing content.
2. **One envelope-verification helper for both document types**, JWK-based (`importJWK`),
   ES256-only (the EL contract is ES256-only; the existing PEM path in `bibleDataModel.ts`
   stays untouched for its own use).
3. **Trust model:** pinned keys array (prod + dev) compiled into the app is the default
   trust store. Remote JWKS is fetched only when an envelope's `keyId` misses the pinned
   set + cached JWKS (refetch once, cache ≤1 day). Unknown key after refetch ⇒ document
   temporarily unavailable.
4. **Rollback guard:** persist `{sequence, payloadJson, verifiedAt}` of the last verified
   catalog in AsyncStorage. A verified catalog with `sequence` < stored sequence is
   REJECTED (keep last-good). Equal sequence is accepted (same doc re-fetched).
5. **New audio strategy `'el-manifest'`** added to the `TranslationAudioCatalog` union,
   dispatched in `fetchRemoteChapterAudio`. It consults the verified-manifest cache
   (memory + on-disk, immutable) and returns the absolute chapter URL + mime/ext.
   Chapters absent from the manifest ⇒ `null` (existing "no audio" handling applies).
6. **Surface area (picker UX decision):** EL translations are AUDIO-ONLY. They must NOT be
   selectable as a primary *text* translation (the reader has no verses for them). They
   surface wherever the app selects an *audio source / audio preference*, grouped by
   language. Display name = `translation_name`, short label = `abbreviation`, language
   label = `language_autonym ?? language_name`. If the existing merge path cannot express
   an audio-only translation without it leaking into the text picker, gate it out at the
   picker layer (`has_text === false && source === 'langquest'`) and document it. This is
   task 10's acceptance criterion — verify empirically in the UI.
7. **Language grouping:** map `language_iso639_3` → the app's language code where the app
   already knows the language (e.g. `eng→en`, `spa→es`, `hin→hi`, `nep→ne`, `sat→sat`),
   else use the iso639-3 code as-is. Small static map in `elTranslationMapping.ts`; no dupes
   in the language filter list is the acceptance test.
8. **Config:** `EXPO_PUBLIC_EL_MEDIA_BASE_URL` registered in `publicRuntimeConfig.ts`.
   Absent ⇒ feature inert regardless of flag. Catalog path: `__DEV__` ⇒ `/catalog.dev.json`,
   else `/catalog.json` (contract R6: prod builds only ever read `/catalog.json`).
9. **Feature flag `el_media_source`** in `featureFlags.ts`, default `false` (contract T5;
   flips at K3). Flag off ⇒ zero EL network calls, zero behavior change (byte-for-byte).
10. **Fetch cadence:** piggyback the existing once-per-launch deferred warmup
    (`startDeferredWarmups` → after `bootstrapRuntimeTranslations`). No new timers. A fetch
    failure never empties the list (last-good from AsyncStorage is applied instead).
11. **Downloads:** reuse `audioDownloadService` unchanged; the `'el-manifest'` resolver is
    injected through the existing `resolveRemoteAudio` callback. File extension comes from
    the manifest's `file_ext` (default `mp3`). Per-chapter sha256 verification of
    downloaded bytes is DEFERRED (optional enhancement; contract makes it optional).
12. **`manifest_sha256` integrity pre-check:** implement (cheap): sha256 the fetched
    manifest file bytes via `crypto.subtle.digest` and compare to the catalog's value;
    mismatch ⇒ treat manifest unavailable. Skip silently if `crypto.subtle` absent.
13. **Retirement of the LangQuest ingest workstream (contract T6) is a SEPARATE PR**
    (Part E), executed only after the integration PR lands. Never mix them.

---

## Part C — Integration implementation (PR #1)

Work in a dedicated worktree/branch (e.g. `feat/el-media-source`). After EVERY task:
`npm run typecheck && npm run lint` must pass. Test command per file:
`node --test --import tsx <path>`; full suite `npm test` if defined, plus `npm run test:release` before landing.
Remember the repo gotcha: `node --test` has no `__DEV__` — always guard with
`typeof __DEV__ !== 'undefined' && __DEV__` in source touched by tests.

### Task 1: Commit fixtures

**Files:**
- Create: `src/services/elMedia/fixtures/catalog.dev.json` (signed envelope)
- Create: `src/services/elMedia/fixtures/manifest-lqdtest.json` (signed envelope)
- Create: `src/services/elMedia/fixtures/dev.jwks.json`
- Create: `src/services/elMedia/fixtures/README.md` (one paragraph: provenance = EL fixture pack 2026-07-18, dev-key-signed, used by unit tests; do not edit — bytes are signature-protected)

**Steps:**
1. Unzip `/Users/dev/Downloads/lqd-jeremy-handoff-2026-07-19/lqd-fixture-pack-2026-07-18.zip` to a temp dir; copy `examples/catalog.dev.json`, `examples/manifest-lqdtest.json`, `examples/dev.jwks.json` byte-for-byte into `src/services/elMedia/fixtures/`.
2. Sanity-check: `node -e "const c=require('./src/services/elMedia/fixtures/catalog.dev.json'); console.log(c.keyId, c.algorithm, c.compactJws.split('.').length)"` → `lqd-dev-2026-a ES256 3`.
3. Commit: `git add src/services/elMedia/fixtures && git commit -m "feat(el-media): commit signed EL fixture pack for offline tests"`

### Task 2: Types + envelope verification (`elEnvelope.ts`)

**Files:**
- Create: `src/services/elMedia/elEnvelope.ts`
- Test: `src/services/elMedia/elEnvelope.test.ts`

**Step 1 — failing tests** (uses REAL fixtures + real jose verify; Node ≥20 has WebCrypto):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isElEnvelopeShape, verifyElEnvelope } from './elEnvelope';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) => JSON.parse(readFileSync(new URL(name, fixturesDir), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const catalogEnvelope = readJson('catalog.dev.json');
const manifestEnvelope = readJson('manifest-lqdtest.json');

test('accepts well-formed envelope shape and rejects malformed ones', () => {
  assert.equal(isElEnvelopeShape(catalogEnvelope), true);
  assert.equal(isElEnvelopeShape({ keyId: 'x', algorithm: 'RS256', compactJws: 'a.b.c' }), false);
  assert.equal(isElEnvelopeShape({ keyId: 'x', algorithm: 'ES256', compactJws: 'not-a-jws' }), false);
  assert.equal(isElEnvelopeShape(null), false);
});

test('verifies the signed fixture catalog and returns its payload', async () => {
  const payload = (await verifyElEnvelope(catalogEnvelope, jwks)) as Record<string, unknown> | null;
  assert.ok(payload);
  assert.equal(payload.schema_version, 'lqd-catalog/v1');
});

test('verifies the signed fixture manifest through the same code path', async () => {
  const payload = (await verifyElEnvelope(manifestEnvelope, jwks)) as Record<string, unknown> | null;
  assert.ok(payload);
  assert.equal(payload.schema, 'everybible-audio-manifest/v1');
});

test('rejects a tampered compactJws without throwing', async () => {
  const parts = catalogEnvelope.compactJws.split('.');
  const tamperedPayload = parts[1].slice(0, -2) + (parts[1].endsWith('A') ? 'BB' : 'AA');
  const tampered = { ...catalogEnvelope, compactJws: [parts[0], tamperedPayload, parts[2]].join('.') };
  assert.equal(await verifyElEnvelope(tampered, jwks), null);
});

test('rejects when keyId is not in the key set', async () => {
  assert.equal(await verifyElEnvelope({ ...catalogEnvelope, keyId: 'unknown-kid' }, jwks), null);
});

test('rejects kid/keyId mismatch', async () => {
  // envelope claims the dev kid but we present a key set where that kid maps to a different key
  const wrongKey = { ...jwks[0], kid: 'lqd-dev-2026-a', x: 'FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU', y: 'Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM' };
  assert.equal(await verifyElEnvelope(catalogEnvelope, [wrongKey]), null);
});
```

**Step 2:** `node --test --import tsx src/services/elMedia/elEnvelope.test.ts` → FAIL (module missing).

**Step 3 — implementation:**

```ts
import type { SignedCatalogEnvelope } from '../../types/bible';

export interface ElJwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid: string;
  alg?: string;
  use?: string;
}

// EL contract is ES256-only; compact JWS has exactly three dot-separated segments.
export function isElEnvelopeShape(value: unknown): value is SignedCatalogEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.keyId === 'string' &&
    v.keyId.length > 0 &&
    v.algorithm === 'ES256' &&
    typeof v.compactJws === 'string' &&
    v.compactJws.split('.').length === 3
  );
}

export async function verifyElEnvelope(
  envelope: SignedCatalogEnvelope,
  keys: ElJwk[]
): Promise<unknown | null> {
  const jwk = keys.find((key) => key.kid === envelope.keyId);
  if (!jwk) return null;
  try {
    const { importJWK, compactVerify } = await import('jose');
    const publicKey = await importJWK(jwk as Parameters<typeof importJWK>[0], 'ES256');
    const { payload, protectedHeader } = await compactVerify(envelope.compactJws, publicKey, {
      algorithms: ['ES256'],
    });
    if (protectedHeader.kid !== envelope.keyId) return null;
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch {
    return null;
  }
}
```

Match the existing dynamic-import-jose pattern from `bibleDataModel.ts:286` (keeps jose out
of the startup bundle path — see memory note on Metro inlineRequires being OFF).

**Step 4:** tests pass. **Step 5:** commit `feat(el-media): ES256 JWK envelope verification (one path for catalog + manifests)`.

### Task 3: Pinned keys + JWKS service (`elJwks.ts`)

**Files:** Create `src/services/elMedia/elJwks.ts`, test `src/services/elMedia/elJwks.test.ts`.

**Behavior (write tests first, DI everything):**
- `EL_PINNED_JWKS: ElJwk[]` — the two keys from §A2, hardcoded. (Re-curl the live JWKS first; if it differs from §A2, STOP and flag to Jeremy.)
- `getElKeys(deps)` returns pinned keys merged with any cached remote JWKS (pinned first, deduped by kid).
- `refreshElJwksForUnknownKeyId(keyId, deps)`: if `keyId` already known → no fetch. Else fetch `{baseUrl}/.well-known/keys.json` at most once per app launch per keyId (guard map), parse `{keys: [...]}` tolerantly (skip non-EC/kid-less entries), cache result in memory + AsyncStorage (`el-media:jwks-cache`, with `fetchedAt`; TTL 24h).
- All failures → return what we had. Never throw.

**Tests:** unknown-kid triggers exactly one fetch (count via injected fetchFn); known-kid triggers none; malformed JWKS response leaves pinned set intact; TTL respected via injected `now()`.

Commit: `feat(el-media): pinned trust store + JWKS rotation discovery`.

### Task 4: Catalog model — tolerant parsing (`elCatalogModel.ts`)

**Files:** Create `src/services/elMedia/elCatalogModel.ts`, test `elCatalogModel.test.ts`.

**Step 1 — failing tests** covering, at minimum:
- Parses the REAL fixture catalog payload (verify fixture via `verifyElEnvelope`, then parse) → 1 translation, all fields mapped (camelCase), `sequence === 1`.
- Unknown top-level/entry fields are ignored (add junk keys → still parses).
- Entry with `delivery_mode: 'segment'` is SKIPPED, others kept.
- Entry missing a required field (e.g. `translation_name`) is SKIPPED, catalog still returned.
- `schema_version: 'lqd-catalog/v2'` → returns `null` (unknown major).
- Non-integer / negative `sequence` → `null`.
- Empty `translations` array is VALID (that's live prod today).
- `translation_id` not matching `/^lq[a-z0-9][a-z0-9-]*$/` is skipped (defensive collision guard).
- `text_direction: 'weird'` → field dropped, entry kept.

**Step 3 — implementation** (complete):

```ts
export interface ElCatalogTranslation {
  translationId: string;
  languageIso6393: string;
  languageName: string;
  translationName: string;
  abbreviation: string;
  languageAutonym?: string;
  textDirection?: 'ltr' | 'rtl';
  source: string;
  copyright: string;
  deliveryMode: 'chapter';
  hasAudio: boolean;
  currentAudioVersion: string;
  manifestUrl: string;
  manifestSha256: string;
}

export interface ElCatalog {
  schemaVersion: string;
  sequence: number;
  generatedAt: string;
  baseUrl: string;
  translations: ElCatalogTranslation[];
}

const EL_CATALOG_SCHEMA_PREFIX = 'lqd-catalog/v1';
const EL_TRANSLATION_ID_RE = /^lq[a-z0-9][a-z0-9-]*$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

function parseElCatalogTranslation(raw: unknown): ElCatalogTranslation | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (entry.delivery_mode !== 'chapter') return null;
  if (
    !isNonEmptyString(entry.translation_id) ||
    !EL_TRANSLATION_ID_RE.test(entry.translation_id) ||
    !isNonEmptyString(entry.language_iso639_3) ||
    !isNonEmptyString(entry.language_name) ||
    !isNonEmptyString(entry.translation_name) ||
    !isNonEmptyString(entry.abbreviation) ||
    !isNonEmptyString(entry.source) ||
    !isNonEmptyString(entry.copyright) ||
    typeof entry.has_audio !== 'boolean' ||
    !isNonEmptyString(entry.current_audio_version) ||
    !isNonEmptyString(entry.manifest_url) ||
    !isNonEmptyString(entry.manifest_sha256) ||
    !SHA256_HEX_RE.test(entry.manifest_sha256)
  ) {
    return null;
  }
  const parsed: ElCatalogTranslation = {
    translationId: entry.translation_id,
    languageIso6393: entry.language_iso639_3,
    languageName: entry.language_name,
    translationName: entry.translation_name,
    abbreviation: entry.abbreviation,
    source: entry.source,
    copyright: entry.copyright,
    deliveryMode: 'chapter',
    hasAudio: entry.has_audio,
    currentAudioVersion: entry.current_audio_version,
    manifestUrl: entry.manifest_url,
    manifestSha256: entry.manifest_sha256,
  };
  if (isNonEmptyString(entry.language_autonym)) parsed.languageAutonym = entry.language_autonym;
  if (entry.text_direction === 'ltr' || entry.text_direction === 'rtl') {
    parsed.textDirection = entry.text_direction;
  }
  return parsed;
}

export function parseElCatalogPayload(payload: unknown): ElCatalog | null {
  if (!payload || typeof payload !== 'object') return null;
  const doc = payload as Record<string, unknown>;
  if (!isNonEmptyString(doc.schema_version) || !doc.schema_version.startsWith(EL_CATALOG_SCHEMA_PREFIX)) {
    return null;
  }
  if (typeof doc.sequence !== 'number' || !Number.isInteger(doc.sequence) || doc.sequence < 0) {
    return null;
  }
  if (!isNonEmptyString(doc.generated_at) || !isNonEmptyString(doc.base_url)) return null;
  if (!Array.isArray(doc.translations)) return null;
  const translations: ElCatalogTranslation[] = [];
  for (const raw of doc.translations) {
    const entry = parseElCatalogTranslation(raw);
    if (entry) translations.push(entry);
  }
  return {
    schemaVersion: doc.schema_version,
    sequence: doc.sequence,
    generatedAt: doc.generated_at,
    baseUrl: doc.base_url,
    translations,
  };
}
```

Commit: `feat(el-media): tolerant lqd-catalog/v1 payload parsing`.

### Task 5: Manifest model (`elManifestModel.ts`)

Same pattern. Types:

```ts
export interface ElManifestChapter {
  chapter: number;
  path: string;        // resolves against manifest baseUrl
  bytes: number;
  sha256: string;
  durationMs?: number;
}

export interface ElAudioManifest {
  schema: string;                 // 'everybible-audio-manifest/v1'
  translationId: string;
  audioVersion: string;
  deliveryMode: 'chapter';
  baseUrl: string;
  fileExt: string;
  mimeType: string;
  books: Record<string, ElManifestChapter[]>;  // key: 3-letter USFM
}
```

`parseElManifestPayload(payload: unknown): ElAudioManifest | null` — reject unknown `schema`
major or `delivery_mode !== 'chapter'`; skip malformed chapters/books, keep the rest;
require `path` starting with `/`; chapter integer ≥ 1; `bytes` positive integer; `sha256`
64-hex; `duration_ms` optional number → `durationMs`. Also export
`resolveElChapterFromManifest(manifest, bookId, chapter): { url: string; mimeType: string; fileExt: string; bytes: number; durationMs?: number } | null`
(absolute URL = `baseUrl` + `path`; no template logic — literal paths only).

**Tests:** real fixture manifest parses (JHN 1–2, correct absolute URLs); tampered/malformed
cases; unknown book key skipped without dropping others; missing chapter lookup → null.

Commit: `feat(el-media): everybible-audio-manifest/v1 parsing + chapter resolution`.

### Task 6: Catalog service — fetch/verify/sequence/last-good (`elCatalogService.ts`)

**Files:** Create `src/services/elMedia/elCatalogService.ts` + test.

**Contract:**

```ts
interface ElCatalogServiceDeps {
  fetchFn?: typeof fetch;
  storage?: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  getKeys?: (keyId: string) => Promise<ElJwk[]>;   // wraps elJwks (pinned + rotation refetch)
  isVerificationSupported?: () => boolean;          // wraps isManifestVerificationRuntimeSupported
}
export async function refreshElCatalog(catalogUrl: string, deps?): Promise<ElCatalog | null>;
export async function getLastVerifiedElCatalog(deps?): Promise<ElCatalog | null>;
```

**Behavior (test each):**
1. Happy path: fetch → `isElEnvelopeShape` → `verifyElEnvelope` → `parseElCatalogPayload` → persist `{sequence, payloadJson, verifiedAt}` under `el-media:last-catalog` → return catalog.
2. Network failure / non-2xx / malformed body → return last-good from storage (or null); NEVER throws.
3. Verification failure → last-good.
4. **Sequence regression:** stored sequence 5, incoming verified sequence 4 → REJECT, keep stored. Equal sequence → accept.
5. Verification runtime unsupported → return null without fetching (EL source unavailable).
6. Storage round-trip: `getLastVerifiedElCatalog` re-parses the persisted payload through `parseElCatalogPayload` (never trust raw storage).

Default `storage` = AsyncStorage (import path: match whatever `src/stores/*` use). Default
`getKeys` = elJwks. No module-eval side effects (see memory: no work at import time —
everything inside functions).

Commit: `feat(el-media): catalog service with last-verified persistence and sequence rollback guard`.

### Task 7: Manifest service — immutable cache (`elManifestService.ts`)

**Contract:**

```ts
export async function getElManifest(
  entry: ElCatalogTranslation,
  catalogBaseUrl: string,
  deps?: ElManifestServiceDeps
): Promise<ElAudioManifest | null>;
```

**Behavior (test each):**
1. Cache key = absolute manifest URL (immutable ⇒ memory Map + AsyncStorage `el-media:manifest:<sha256-of-url or url>`; check memory → disk → network, in that order; a cache hit performs zero fetches).
2. On fetch: raw bytes → optional integrity pre-check: if `crypto.subtle` available, sha256(bytes) must equal `entry.manifestSha256`, else skip check → envelope shape → verify → parse → require `payload.translation_id === entry.translationId` and `payload.audio_version === entry.currentAudioVersion` (defense against swapped documents) → cache VERIFIED payload JSON (not the envelope) → return.
3. Any failure → cached verified copy if present, else null. Never throws, never returns unverified data.
4. New `current_audio_version` in catalog ⇒ different manifest URL ⇒ separate cache entry (old one left alone; R5 satisfied — already-downloaded files keep working).

Commit: `feat(el-media): verified immutable manifest cache`.

### Task 8: Config + flag plumbing

**Files:**
- Modify: `src/services/startup/publicRuntimeConfig.ts` — add `EXPO_PUBLIC_EL_MEDIA_BASE_URL` to the keys tuple + defaults (mirror how `EXPO_PUBLIC_BIBLE_ASSET_BASE_URL` is handled).
- Modify: `src/services/featureFlags/featureFlags.ts` — add `el_media_source: false`.
- Create: `src/services/elMedia/elMediaConfig.ts` + test:

```ts
export function resolveElCatalogUrl(deps?: { baseUrl?: string | null; isDev?: boolean; isFlagEnabled?: boolean }): string | null
```

Returns null unless flag enabled AND base URL configured; appends `/catalog.dev.json` when
dev (`typeof __DEV__ !== 'undefined' && __DEV__` as default for `isDev`), `/catalog.json`
otherwise; strips trailing slash. Tests: flag off → null; no base URL → null; dev vs prod
path selection.
- Modify: `.env.example` — add `EXPO_PUBLIC_EL_MEDIA_BASE_URL=` with a comment (dev value: `https://lqd-media.platform-979.workers.dev`).

Commit: `feat(el-media): config resolution behind el_media_source flag`.

### Task 9: Translation mapping (`elTranslationMapping.ts`)

**Read first:** `src/types/bible.ts` (`BibleTranslation`, `TranslationAudioCatalog`),
`src/services/translations/translationCatalogModel.ts:106` (`mapCatalogEntryToBibleTranslation`) —
mirror its output shape exactly.

**Files:**
- Modify: `src/types/bible.ts` — extend the `TranslationAudioCatalog` strategy union with `'el-manifest'` and add the fields it needs: `{ strategy: 'el-manifest'; manifestUrl: string; audioVersion: string; catalogBaseUrl: string; fileExtension?: string }` (fit the existing union style — read it first; keep additive, do not disturb existing variants).
- Create: `src/services/elMedia/elTranslationMapping.ts` + test.

**Mapping rules (per catalog entry with `hasAudio === true`):**

| BibleTranslation field | Source |
|---|---|
| id | `translationId` (already lowercase, `lq`-prefixed — must survive `normalizeCatalogTranslationId` unchanged; add a test asserting that) |
| name | `translationName` |
| abbreviation | `abbreviation` |
| languageCode | `mapElLanguageCode(languageIso6393)` — static map for languages the app ships (`eng→en, spa→es, hin→hi, nep→ne, mar→mr, ben→bn, tam→ta, tel→te, pan→pa, urd→ur, ara→ar, fra→fr, deu→de, por→pt, rus→ru, ind→id, jpn→ja, kor→ko, tur→tr, vie→vi, zho→zh`), else iso639-3 as-is |
| languageName | `languageAutonym ?? languageName` |
| license/copyright field(s) | `copyright` (`CC0-1.0` ⇒ whatever the app's public-domain representation is) |
| text availability | audio-only: whatever combination of existing fields expresses "no text pack" (mirror how audio-capable entries without text are represented; verify against `filterInstallableCatalogEntries` so entries are not filtered out) |
| catalog.audio | `{ strategy: 'el-manifest', manifestUrl, audioVersion: currentAudioVersion, catalogBaseUrl, fileExtension: 'mp3' }` |

`mapElCatalogToBibleTranslations(catalog: ElCatalog): BibleTranslation[]` — skips
`hasAudio === false` entries.

**Tests:** fixture catalog maps to 1 translation with correct fields; `has_audio:false`
skipped; id normalization stability; language-code mapping incl. unmapped fallback.

Commit: `feat(el-media): map EL catalog entries into BibleTranslation shape`.

### Task 10: Bootstrap merge + picker surfacing

**Read first:** `src/services/translations/runtimeTranslationBootstrap.ts` (whole file),
`src/stores/bibleStore.ts:389-446`, `src/screens/bible/TranslationPickerList.tsx`.

**Files:**
- Modify: `src/services/translations/runtimeTranslationBootstrap.ts` — after the Supabase runtime catalog is applied, if `resolveElCatalogUrl()` returns a URL: `refreshElCatalog(url)` (falling back to `getLastVerifiedElCatalog()`), map, and merge via the same `applyRuntimeCatalog` path (or a parallel `applyElCatalog` action if merge semantics would overwrite Supabase entries — read `mergeRuntimeCatalogTranslations` in `bibleStoreModel.ts` first and decide; EL ids can never collide, so a single combined apply is likely fine). Wrap the entire EL block in try/catch; flag-off short-circuits before ANY EL code loads (lazy `import()` of the elMedia module inside the guard, so flag-off adds zero startup cost — see startup-hotpaths memory).
- Modify picker layer only if needed per decision B6: EL entries must appear in audio-source selection grouped by language, and must NOT be offerable as a primary text translation. Where a source badge is shown, add i18n key `translations.elSourceBadge` = "Every Language" to `en.ts` + all 20 other locales (run the locale coverage test).

**Acceptance (manual, simulator, dev build with flag forced on + `EXPO_PUBLIC_EL_MEDIA_BASE_URL` set to the live dev URL):**
- `lqdtest` appears grouped under its language; label "LangQuest Distribution Test" / "LQDT"; no duplicate language groups.
- It is not selectable as the reader's text translation (or selecting it is impossible/clearly audio-only).
- Flag off (default): pickers byte-identical to today; zero requests to `lqd-media.platform-979.workers.dev` (verify with Metro network inspector or proxy).
- Airplane mode after one successful launch: EL entry still listed (last-good), playback of non-downloaded chapters fails gracefully.

Commit: `feat(el-media): merge EL translations into runtime catalog behind flag`.

### Task 11: Playback — `'el-manifest'` strategy in audioRemote

**Read first:** `src/services/audio/audioRemote.ts:474-545` and its test file for the DI pattern.

**Files:**
- Modify: `src/services/audio/audioRemote.ts` — add an `'el-manifest'` case to the strategy dispatch: lazy-import `elManifestService`, `getElManifest(entryFromCatalogAudio)`, `resolveElChapterFromManifest(manifest, bookId, chapter)` → return the same asset shape the other branches return (URL absolute, mime `audio/mpeg`, extension from manifest). Missing manifest/chapter → null (existing no-audio UX).
- Test: `src/services/audio/audioRemote.test.ts` — add cases using `setRemoteAudioMetadataResolver` with an el-manifest translation + an injected manifest-service double: resolves JHN/1 to the fixture URL; unknown chapter → null; manifest unavailable → null (no throw).

**Acceptance (device/simulator, flag on, live dev URL):** stream Jonah 1 of `lqdtest`;
seek/scrub works (Range-request backed); background playback works; chapter with no audio
shows the normal no-audio state.

Commit: `feat(audio): resolve chapter audio from verified EL manifests`.

### Task 12: Downloads

**Read first:** `src/services/audio/audioDownloadService.ts` — the `resolveRemoteAudio`
callback type (:97) and extension resolution; find the call sites that construct the
resolver (likely passing `fetchRemoteChapterAudio`).

**Files:**
- Verify/modify so the download path works for `'el-manifest'` translations end-to-end: since downloads already flow through `fetchRemoteChapterAudio`-style resolution, Task 11 may make this free. Confirm: file lands at `{root}{translationId}/{bookId}/{chapter}.mp3`, offline lookup finds it, size ≥ 1024-byte guard passes.
- Add a focused test in `audioDownloadService.test.ts` style: download an el-manifest chapter via injected resolver double → file recorded at the expected path with `.mp3`.
- DEFERRED (do not build now, note in code comment only if a natural anchor exists): per-chapter sha256 verification of downloaded bytes against the manifest.

**Acceptance (manual):** download Jonah 1–3 for `lqdtest`, airplane mode, playback works offline on iOS and Android.

Commit: `feat(audio): EL chapter downloads through existing machinery`.

### Task 13: Full verification pass

1. `npm run typecheck && npm run lint && npm run format:check`
2. Full test suite + `npm run test:release`.
3. Locale coverage test passes (new keys in all 21 locales).
4. Flag-off regression sweep: with `el_media_source` false and no env var, grep bundler
   output/network for any EL fetch (must be none); app behavior byte-identical.
5. Live smoke (matches EL's K1 doc):
   ```sh
   curl -s https://lqd-media.platform-979.workers.dev/.well-known/keys.json | jq '.keys[].kid'
   curl -s https://lqd-media.platform-979.workers.dev/catalog.dev.json | jq '{keyId, algorithm}'
   ```
6. Both-platform manual QA per Tasks 10–12 acceptance lists.

Commit any fixes; then merge PR #1 to `main` per repo workflow (`npm run release:verify` before landing). Do NOT flip the flag or ship a release as part of this PR.

---

## Part D — Contract acceptance mapping (EL spec S7)

| EL task | Covered by |
|---|---|
| T1 config + fetch + tolerant parse + last-good | Tasks 4, 6, 8 |
| T2 catalog merge, grouped by ISO 639-3, no dupes, no regression when disabled | Tasks 9, 10 |
| T3 manifest pipeline: verify, JWKS caching, keyId-miss refetch, tampered-JWS reject | Tasks 2, 3, 5, 7 |
| T4 playback + downloads (stream, seek, download, background, both platforms) | Tasks 11, 12 |
| T5 env wiring dev/prod + flag default off | Task 8, 10, 13 |
| T6 retire ingest workstream | Part E |

---

## Part E — Retire the LangQuest ingest workstream (PR #2, after PR #1 lands)

**Context:** the in-repo ingest pipeline (Trigger.dev + `langquest_*` tables + admin
dashboard) never received production credentials and never will — EL's distribution
replaces it (contract T6, confirmed in Skyler's 2026-07-18 reply). It was never live:
STATE.md says deployment was "blocked on external credentials". The heavyweight
decommission preconditions in `.planning/workstreams/oss-platform-langquest/RUNBOOK-DECOMMISSION.md`
were written for a *live* system and mostly don't apply; keep its spirit (freeze → snapshot → remove → verify).

**Removal inventory (verified 2026-08-03):**

1. `apps/workflows/` — entire app (langquest tasks are its only tasks).
2. `packages/langquest-ingest/` — only consumed by apps/workflows.
3. `.github/workflows/langquest-workflows-deploy.yml`.
4. `apps/admin/app/(dashboard)/langquest/` (page + actions) and `apps/admin/lib/langquest/` (admin-data.ts, workflows.ts).
5. The `/langquest` nav entry in `apps/admin/lib/admin-navigation.ts`.
6. `scripts/langquest-operational-check.ts` + the `langquest:ops-check` npm script.
7. Root workspace references: `package.json` workspaces + regenerate `package-lock.json`; check `turbo.json` pipelines.
8. `.planning/workstreams/oss-platform-langquest/` — do NOT delete; add a superseded banner to STATE.md pointing at this plan + the EL contract.

**Database (decision gate, do in this order):**
1. In the live Supabase project, check row counts for `langquest_translation_candidates`,
   `langquest_ownership_decisions`, `langquest_selected_translations`,
   `langquest_chapter_artifacts`, `workflow_runs`, `workflow_events`.
2. Grep the whole monorepo for `workflow_runs` / `workflow_events` usage OUTSIDE langquest
   code. If any non-langquest consumer exists, keep those two tables.
3. Write a new migration `supabase/migrations/<ts>_drop_langquest_ingest_tables.sql`
   dropping the four `langquest_*` tables (and `workflow_runs`/`workflow_events` only if
   step 2 found no other consumers). Keep the original create-migration in history.
   If any table has meaningful rows, export to CSV first and stash under an archive
   location before dropping — ask Jeremy only if rows exist.
4. Also check for Trigger.dev cloud schedules (daily discovery 01:30 UTC, ingest 02:00 UTC):
   if a Trigger.dev project was ever deployed, disable schedules there first (likely never
   deployed — STATE.md says blocked on credentials — verify, don't assume).

**Do NOT remove:** `SignedCatalogEnvelope` in `src/types/bible.ts`, the verification code in
`bibleDataModel.ts`, `docs/bible-media-platform-policy.md`, or anything under
`src/services/elMedia/` — these are the living halves of the new integration.

**Verify after removal:** `npm run typecheck && npm run lint`, admin app builds
(`apps/admin` build command), full test suite, `git grep -i langquest` returns only
`.planning/` archive docs + this plan + elMedia code comments referencing the source name
`langquest` (that string is a legitimate catalog `source` value — keep it in elMedia).

Commit as a small series (workflows app, admin surface, scripts/workspace, migration), PR to `main`.

---

## Part F — Rollout gates (do not do these inside PR #1/#2)

| Gate | Action | Trigger |
|---|---|---|
| Dev soak | Dev builds run with flag forced on against `lqd-media.platform-979.workers.dev` | After PR #1 lands |
| K2 | Joint check with Skyler: `lqdtest` + Santhali (369 chapters) via `catalog.dev.json`; sign-off | EL side, realistically early September (gated on LangQuest's distribution API) |
| K3 | Prod cutover: point `EXPO_PUBLIC_EL_MEDIA_BASE_URL` at `https://media.everylanguage.com`, flip `el_media_source` to true, release via the normal TestFlight flow (all repo release rules apply) | When Skyler declares K3 |
| Emergency lever | EL removes a translation from catalog.json (propagates ≤5 min). App-side: build-based flag disable is the agreed fallback — no remote kill-switch required | Agreed in the 2026-07-18 reply, Q3 |

## Open items to communicate back to Skyler (not blockers)

1. Send him `docs/bible-media-platform-policy.md` (he asked for it in the reply; the manifest schema is intentionally ours, so amendments should be narrow).
2. Confirm the app pins `lqd-prod-2026-a` + `lqd-dev-2026-a` and treats JWKS as rotation-only, as recommended.
3. Picker UX decision (his open question): EL translations surface as audio-only sources in the audio-source/preference selection, grouped by language, labeled with `translation_name`/`abbreviation`, autonym-preferred language labels. Not selectable as a primary text translation until EL ships text packs.
4. Timing (his open question): T1–T5 are one focused implementation session plus device QA — realistic calendar time ~1 week from start; well ahead of K2 in September.

---

## Part G — Contract rev 2026-08-15 (Skyler handoff) — LANDED 2026-08-17

Source: `el-media-handoff-2026-08-15.md`. Supersedes the specific rows below; everything else
in this plan stands as-built. T1–T5 were reviewed by EL and endorsed, including the deliberate
deferrals (per-chapter downloaded-bytes hashing, `manifest_sha256` not threaded into the audio
path).

### What changed in the contract

| Change | App-side effect |
|---|---|
| `translation_id` is now `el-{slug}` (source-agnostic permanent ids); `lqdtest` grandfathered | **Required fix, landed:** the collision guard in `elCatalogModel.ts` is now `/^(el-\|lq)[a-z0-9][a-z0-9-]*$/`. The old `lq`-only regex dropped every real EL translation *silently*, because the parser is deliberately tolerant. Regression tests: `keeps el-prefixed translation ids from the production catalog` |
| `language_iso639_3` may be `mis` (ISO's own "uncoded language" value) | None — picker grouping keys off English `language_name`, and `mapElLanguageCode` passes unknown codes through unchanged. Covered by a parser test |
| New optional `language_glottocode` (e.g. `sant1410`) | None — unknown fields are ignored by design; available if code-keyed grouping is ever wanted |
| `source` is no longer the constant `"langquest"` — opaque provenance label | None — no code enums it. The `has_text === false && source === 'langquest'` phrasing in §B6 above is stale: the picker gate is `hasText === false`, never the source value |
| Launch domain will be `bible.everylanguage.com` (not `media.everylanguage.com`) | Cosmetic until cutover; the dev worker keeps serving through the transition. `.env.example` updated |
| A third dev-only kid `lqd-dev-2026-b` appears in the JWKS | None — it never signs anything the app consumes; rotation-discovery path handles it |

### Live content as of the handoff

`el-bhujel` — "Bhujel Bible" (BYH, iso `byh`), `v2026-08-15-2`: the complete book of Job,
42 chapters, 3.9 h of measured-duration audio, in the **production** catalog. Catalog
`sequence` is 3, still signed with the pinned `lqd-prod-2026-a`. Remaining Bhujel OT books
publish over the following days under the same translation id (new catalog versions), and
~322 chapters across more `el-{slug}` languages are export-ready in the first wave.
Additive `verse_timings` (per-chapter verse → `{start_ms, end_ms}`) is planned upstream —
ignore until verse navigation/highlighting is wanted.

### Build-plumbing gaps closed (EL's review found all three)

1. `app.config.js` `PUBLIC_RUNTIME_CONFIG_KEYS` now includes `EXPO_PUBLIC_EL_MEDIA_BASE_URL`,
   so release builds resolve it from Expo `extra` and not just inlined env. A new test
   (`app config allowlist matches the public runtime config keys`) fails on any future drift
   between that allowlist and `publicRuntimeConfig.ts`.
2. `eas.json` now sets `EXPO_PUBLIC_EL_MEDIA_BASE_URL` in the `development`, `preview`, and
   `production` build profiles.
3. `el_media_source` has an enable path: `EXPO_PUBLIC_EL_MEDIA_SOURCE=true|1` resolves the
   flag ON (precedence: explicit `setFeatureFlagOverride` > env opt-in > `FEATURE_FLAG_DEFAULTS`).
   `development` and `preview` builds set it; **production deliberately does not**, so prod
   stays inert until the launch cutover. A test asserts that production gate.

### Revised rollout gates (supersede Part F)

| Gate | Action | Status |
|---|---|---|
| Dev soak | `development`/`preview` builds now resolve the flag ON against `lqd-media.platform-979.workers.dev`; expect the book of Job in Bhujel to appear as an audio-only source and play | Ready — needs on-device QA |
| K2 | Joint check with Skyler (`el-bhujel` + Santhali via `catalog.dev.json`) | EL side, ~September |
| Launch cutover | Point `EXPO_PUBLIC_EL_MEDIA_BASE_URL` at `https://bible.everylanguage.com` and add `EXPO_PUBLIC_EL_MEDIA_SOURCE=true` to the `production` profile (which flips the test in `runtimeConfig.test.ts` — update it deliberately, in the same commit), then release via the normal TestFlight flow | When Skyler gives notice |
