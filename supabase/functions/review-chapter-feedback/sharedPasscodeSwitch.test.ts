import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeHarnessOptions,
  type EdgeQueryCall,
} from '../_testing/edgeFunctionHarness';
import { hashTeamPasscode } from './teamPasscodeHash';

// Retiring the old shared translator passcode. An admin switch in
// public.translator_access_settings turns it off without a deploy (default: still allowed),
// and every request that presents the shared code is recorded in
// public.translator_shared_passcode_uses (translation, request kind, outcome, time; never the
// code or the caller's address) so the owner can see who still depends on it.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SHARED = '424242';
const TEAM_CODE = '615203948172';
const FEEDBACK_ID = '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e';

const SETTINGS_TABLE = 'translator_access_settings';
const USES_TABLE = 'translator_shared_passcode_uses';
const TEAM_TABLE = 'translator_team_passcodes';
const ATTEMPTS_TABLE = 'translator_review_attempts';
const FEEDBACK_TABLE = 'chapter_feedback_submissions';

type SettingsState =
  | { kind: 'row'; enabled: boolean }
  | { kind: 'no_row' }
  | { kind: 'missing_table'; code: string }
  | { kind: 'error' };

interface Scenario {
  settings?: SettingsState;
  usesInsertFails?: boolean;
}

const operation = (call: EdgeQueryCall) =>
  call.steps.find((step) => ['select', 'insert', 'update'].includes(step.method))?.method;

const teamRow = async () => {
  const salt = 'ab'.repeat(16);
  return {
    id: 'team-npi',
    translation_ids: ['npiulb'],
    passcode_salt: salt,
    passcode_hash: await hashTeamPasscode(salt, TEAM_CODE),
    hash_algorithm: 'sha256-salt-v1',
    revoked_at: null,
  };
};

const run = async (scenario: Scenario, body: Record<string, unknown>) => {
  const team = await teamRow();
  let recordedFailures = 0;
  const settings = scenario.settings ?? { kind: 'row', enabled: true };
  const respond: EdgeHarnessOptions['respond'] = (call) => {
    if (call.table === ATTEMPTS_TABLE) {
      if (operation(call) === 'insert') {
        recordedFailures += 1;
        return {};
      }
      return { count: recordedFailures };
    }
    if (call.table === SETTINGS_TABLE) {
      if (settings.kind === 'row') return { data: { shared_passcode_enabled: settings.enabled } };
      if (settings.kind === 'no_row') return { data: null };
      if (settings.kind === 'missing_table') {
        return { error: { code: settings.code, message: 'relation does not exist' } };
      }
      return { error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    }
    if (call.table === USES_TABLE) {
      return scenario.usesInsertFails ? { error: { code: '42501', message: 'denied' } } : {};
    }
    if (call.table === TEAM_TABLE) return { data: [team] };
    if (call.table === FEEDBACK_TABLE) {
      return operation(call) === 'update'
        ? {}
        : { data: { id: FEEDBACK_ID, translation_id: body.translationId, sentiment: 'up' } };
    }
    // Pre-migration answer: the passcode gate uses its read-then-record lockout scripted above.
    if (call.table === 'rpc:claim_passcode_attempt') return { error: { code: 'PGRST202' } };
    if (call.table.startsWith('rpc:')) {
      return { data: { chapters: [], rows: [], nextCursor: null, positiveCount: 0 } };
    }
    return {};
  };
  const harness = loadEdgeFunction(ENTRY, {
    respond,
    env: { TRANSLATOR_REVIEW_PASSCODE: SHARED, TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS: undefined },
  });
  const response = await harness.handle(
    new Request('https://functions.example/review-chapter-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(body),
    })
  );
  const json = (await response.json()) as Record<string, unknown>;
  const touched = (table: string) => harness.calls.filter((call) => call.table === table);
  const usesRecorded = touched(USES_TABLE)
    .filter((call) => operation(call) === 'insert')
    .map((call) => call.steps.find((step) => step.method === 'insert')?.args[0]);
  const failedAttemptsRecorded = touched(ATTEMPTS_TABLE).filter(
    (call) => operation(call) === 'insert'
  ).length;
  return { status: response.status, json, harness, touched, usesRecorded, failedAttemptsRecorded };
};

const chapterRead = (passcode: string, translationId = 'bsb') => ({
  apiVersion: 2,
  passcode,
  translationId,
  bookId: 'JHN',
  chapter: 3,
});

// --- Still allowed (the default) ------------------------------------------------------------

test('while the shared passcode is allowed, each use is recorded with its translation and kind', async () => {
  const result = await run({}, chapterRead(SHARED));

  assert.equal(result.status, 200);
  assert.deepEqual(result.usesRecorded, [
    { translation_id: 'bsb', request_kind: 'read', outcome: 'allowed' },
  ]);
});

test('the usage record never holds the passcode or the caller address', async () => {
  const result = await run({}, { passcode: SHARED, validateOnly: true, translationId: 'bsb' });

  const recorded = JSON.stringify(result.usesRecorded);
  assert.doesNotMatch(recorded, new RegExp(SHARED));
  assert.doesNotMatch(recorded, /203\.0\.113\.7/);
  assert.deepEqual(Object.keys(result.usesRecorded[0] as object).sort(), [
    'outcome',
    'request_kind',
    'translation_id',
  ]);
});

test('each request kind is recorded under its own name', async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ validateOnly: true }, 'unlock'],
    [{ apiVersion: 2 }, 'read'],
    [{ action: 'resolve', feedbackId: FEEDBACK_ID, resolution: 'fixed' }, 'resolve'],
    [{ action: 'reopen', feedbackId: FEEDBACK_ID }, 'reopen'],
    [
      { apiVersion: 2, action: 'audioUrl', feedbackId: FEEDBACK_ID, bookId: 'JHN', chapter: 3 },
      'audio',
    ],
    [{ apiVersion: 2, action: 'positivePreview', bookId: 'JHN', chapter: 3 }, 'bulk_review'],
    [
      {
        apiVersion: 2,
        action: 'reviewPositiveIds',
        feedbackIds: [FEEDBACK_ID],
        bookId: 'JHN',
        chapter: 3,
      },
      'bulk_review',
    ],
  ];
  for (const [extra, kind] of cases) {
    const result = await run({}, { passcode: SHARED, translationId: 'bsb', ...extra });
    assert.equal(
      (result.usesRecorded[0] as { request_kind: string } | undefined)?.request_kind,
      kind,
      JSON.stringify(extra)
    );
  }
});

test('an unlock without a translation, or with an unusable id, records no translation', async () => {
  const bare = await run({}, { passcode: SHARED, validateOnly: true });
  assert.deepEqual(bare.usesRecorded, [
    { translation_id: null, request_kind: 'unlock', outcome: 'allowed' },
  ]);

  const odd = await run(
    {},
    { passcode: SHARED, validateOnly: true, translationId: 'x'.repeat(65) }
  );
  assert.equal((odd.usesRecorded[0] as { translation_id: unknown }).translation_id, null);
});

test('a use outside the shared scope is still recorded, with the translation it asked for', async () => {
  const result = await run({}, chapterRead(SHARED, 'npiulb'));

  assert.equal(result.status, 403);
  assert.equal(result.json.code, 'translation_not_covered');
  assert.deepEqual(result.usesRecorded, [
    { translation_id: 'npiulb', request_kind: 'read', outcome: 'allowed' },
  ]);
});

test('team codes and wrong codes are not recorded as shared passcode uses', async () => {
  const team = await run({}, chapterRead(TEAM_CODE, 'npiulb'));
  assert.equal(team.status, 200);
  assert.deepEqual(team.usesRecorded, []);

  const wrong = await run({}, { passcode: '000000', validateOnly: true });
  assert.equal(wrong.status, 403);
  assert.deepEqual(wrong.usesRecorded, []);
});

test('a failed usage write is logged and never blocks the translator', async () => {
  const result = await run({ usesInsertFails: true }, chapterRead(SHARED));

  assert.equal(result.status, 200);
  assert.ok(
    result.harness.loggedErrors.some((line) => line.includes('translator_shared_passcode_uses'))
  );
});

test('without a settings row the shared passcode stays allowed', async () => {
  const result = await run({ settings: { kind: 'no_row' } }, chapterRead(SHARED));

  assert.equal(result.status, 200);
});

// Deploying this function before the migration must not change behaviour.
for (const code of ['42P01', 'PGRST205']) {
  test(`before the settings table exists (${code}) the shared passcode stays allowed`, async () => {
    const result = await run({ settings: { kind: 'missing_table', code } }, chapterRead(SHARED));

    assert.equal(result.status, 200);
  });
}

// --- Switched off ---------------------------------------------------------------------------

test('once switched off, the shared passcode is refused exactly like a wrong code', async () => {
  const off = await run({ settings: { kind: 'row', enabled: false } }, chapterRead(SHARED));
  const wrong = await run({ settings: { kind: 'row', enabled: false } }, chapterRead('000000'));

  assert.equal(off.status, 403);
  assert.deepEqual(off.json, wrong.json);
  assert.deepEqual(off.json, { success: false, error: 'Translator access denied' });
  assert.equal(off.failedAttemptsRecorded, 1);
  assert.deepEqual(off.touched(FEEDBACK_TABLE), []);
  assert.ok(
    off.harness.calls.every(
      (call) => !call.table.startsWith('rpc:') || call.table === 'rpc:claim_passcode_attempt'
    ),
    'no feedback RPC runs'
  );
});

test('a refused shared passcode is recorded so the owner can see who still uses it', async () => {
  const result = await run(
    { settings: { kind: 'row', enabled: false } },
    { passcode: SHARED, validateOnly: true, translationId: 'bsb' }
  );

  assert.deepEqual(result.usesRecorded, [
    { translation_id: 'bsb', request_kind: 'unlock', outcome: 'refused' },
  ]);
});

test('switching the shared passcode off leaves team codes working', async () => {
  const result = await run(
    { settings: { kind: 'row', enabled: false } },
    chapterRead(TEAM_CODE, 'npiulb')
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.usesRecorded, []);
});

test('an unreadable switch fails closed for the shared passcode only', async () => {
  const shared = await run({ settings: { kind: 'error' } }, chapterRead(SHARED));
  assert.equal(shared.status, 403);
  assert.equal(shared.failedAttemptsRecorded, 1);
  assert.ok(shared.harness.loggedErrors.some((line) => line.includes(SETTINGS_TABLE)));
  assert.doesNotMatch(JSON.stringify(shared.json), /translator_access_settings|timeout/);

  const team = await run({ settings: { kind: 'error' } }, chapterRead(TEAM_CODE, 'npiulb'));
  assert.equal(team.status, 200);
});

test('the switch is read on every checked code, so its lookup does not reveal the shared code', async () => {
  const wrong = await run({}, { passcode: '000000', validateOnly: true });
  const team = await run({}, { passcode: TEAM_CODE, validateOnly: true });

  assert.equal(wrong.touched(SETTINGS_TABLE).length, 1);
  assert.equal(team.touched(SETTINGS_TABLE).length, 1);
});
