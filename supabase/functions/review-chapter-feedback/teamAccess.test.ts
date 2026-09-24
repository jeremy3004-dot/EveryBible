import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeHarness,
  type EdgeHarnessOptions,
  type EdgeQueryCall,
} from '../_testing/edgeFunctionHarness';
import { hashTeamPasscode } from './teamPasscodeHash';

// One passcode per translation team (owner decision 2026-09-24). A team passcode opens only
// the translations its row lists; the old shared TRANSLATOR_REVIEW_PASSCODE keeps working
// during the transition, limited to a configurable scope.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SHARED = '424242';
const NEPALI_CODE = '615203';
const REVOKED_CODE = '771100';
const FEEDBACK_ID = '9b0f6c55-7a8e-4a57-9d55-6d0f7b1c2a3e';

interface TeamRow {
  id: string;
  label: string;
  translation_ids: string[];
  passcode_salt: string;
  passcode_hash: string;
  hash_algorithm: string;
  revoked_at: string | null;
}

const teamRow = async (
  id: string,
  passcode: string,
  translationIds: string[],
  revokedAt: string | null = null
): Promise<TeamRow> => {
  const salt = id
    .replace(/[^0-9a-f]/g, '0')
    .padEnd(32, 'a')
    .slice(0, 32);
  return {
    id,
    label: `Team ${id}`,
    translation_ids: translationIds,
    passcode_salt: salt,
    passcode_hash: await hashTeamPasscode(salt, passcode),
    hash_algorithm: 'sha256-salt-v1',
    revoked_at: revokedAt,
  };
};

interface Scenario {
  attemptsInWindow?: number;
  teams?: TeamRow[];
  teamLookupFails?: boolean;
  env?: Record<string, string | undefined>;
}

const TEAM_TABLE = 'translator_team_passcodes';
const FEEDBACK_TABLE = 'chapter_feedback_submissions';
const ATTEMPTS_TABLE = 'translator_review_attempts';

const operation = (call: EdgeQueryCall) =>
  call.steps.find((step) => ['select', 'insert', 'update'].includes(step.method))?.method;

const run = async (scenario: Scenario, body: Record<string, unknown>) => {
  let recordedFailures = 0;
  const respond: EdgeHarnessOptions['respond'] = (call) => {
    if (call.table === ATTEMPTS_TABLE) {
      if (operation(call) === 'insert') {
        recordedFailures += 1;
        return {};
      }
      return { count: (scenario.attemptsInWindow ?? 0) + recordedFailures };
    }
    if (call.table === TEAM_TABLE) {
      // Deliberately ignores the query's filters: the function must also refuse a revoked
      // row itself rather than trusting the database filter alone.
      return scenario.teamLookupFails
        ? {
            error: {
              code: '42P01',
              message: 'relation "translator_team_passcodes" does not exist',
            },
          }
        : { data: scenario.teams ?? [] };
    }
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
  const harness: EdgeHarness = loadEdgeFunction(ENTRY, {
    respond,
    env: {
      TRANSLATOR_REVIEW_PASSCODE: SHARED,
      TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS: undefined,
      ...scenario.env,
    },
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
  const failedAttemptsRecorded = touched(ATTEMPTS_TABLE).filter(
    (call) => operation(call) === 'insert'
  ).length;
  return { status: response.status, json, harness, touched, failedAttemptsRecorded };
};

const nepaliTeam = () => teamRow('team-npi', NEPALI_CODE, ['npiulb', 'npi-audio']);
const revokedTeam = () => teamRow('team-old', REVOKED_CODE, ['npiulb'], '2026-09-20T10:00:00.000Z');

const chapterRead = (translationId: string, passcode: string) => ({
  apiVersion: 2,
  passcode,
  translationId,
  bookId: 'JHN',
  chapter: 3,
});

// --- Team passcodes -----------------------------------------------------------------------

test('a team passcode unlocks and tells the app which translations it covers', async () => {
  const result = await run(
    { teams: [await nepaliTeam()] },
    { passcode: NEPALI_CODE, validateOnly: true, translationId: 'npiulb' }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    success: true,
    translationIds: ['npiulb', 'npi-audio'],
    coversTranslation: true,
  });
  assert.equal(result.failedAttemptsRecorded, 0);
});

test('unlocking while reading another translation still succeeds but reports it is not covered', async () => {
  const result = await run(
    { teams: [await nepaliTeam()] },
    { passcode: NEPALI_CODE, validateOnly: true, translationId: 'bsb' }
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.coversTranslation, false);
});

test('only active team rows are fetched', async () => {
  const result = await run(
    { teams: [await nepaliTeam()] },
    { passcode: NEPALI_CODE, validateOnly: true }
  );

  const [lookup] = result.touched(TEAM_TABLE);
  assert.ok(
    lookup.steps.some(
      (step) => step.method === 'is' && step.args[0] === 'revoked_at' && step.args[1] === null
    ),
    'team lookup must filter out revoked rows'
  );
  // Only the columns needed to verify a code; never select * into the function's memory.
  const select = lookup.steps.find((step) => step.method === 'select');
  assert.doesNotMatch(String(select?.args[0]), /\*/);
});

test('a team passcode reads feedback for a translation it covers', async () => {
  const result = await run({ teams: [await nepaliTeam()] }, chapterRead('npi-audio', NEPALI_CODE));

  assert.equal(result.status, 200);
  const [review] = result.touched('rpc:chapter_feedback_review_v2');
  assert.equal((review.steps[0].args[0] as { p_translation: string }).p_translation, 'npi-audio');
});

test('a team passcode cannot read another translation', async () => {
  const result = await run({ teams: [await nepaliTeam()] }, chapterRead('bsb', NEPALI_CODE));

  assert.equal(result.status, 403);
  assert.deepEqual(result.json, {
    success: false,
    error: 'This access code does not cover this translation',
    code: 'translation_not_covered',
  });
  assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
  assert.deepEqual(result.touched('rpc:chapter_feedback_review_v2'), []);
  // The code itself was right, so this is not a guess and must not lock the team out.
  assert.equal(result.failedAttemptsRecorded, 0);
});

test('a team passcode cannot resolve, reopen or bulk-review another translation', async () => {
  const team = await nepaliTeam();
  for (const body of [
    { action: 'resolve', feedbackId: FEEDBACK_ID, resolution: 'fixed', note: 'x' },
    { action: 'reopen', feedbackId: FEEDBACK_ID },
    { action: 'audioUrl', feedbackId: FEEDBACK_ID, bookId: 'JHN', chapter: 3, apiVersion: 2 },
    {
      action: 'reviewPositiveIds',
      feedbackIds: [FEEDBACK_ID],
      bookId: 'JHN',
      chapter: 3,
      apiVersion: 2,
    },
    { apiVersion: 2 },
  ]) {
    const result = await run(
      { teams: [team] },
      { passcode: NEPALI_CODE, translationId: 'bsb', ...body }
    );
    assert.equal(result.status, 403, `${JSON.stringify(body)} must be refused`);
    assert.equal(result.json.code, 'translation_not_covered');
    assert.deepEqual(result.touched(FEEDBACK_TABLE), []);
    assert.ok(
      result.harness.calls.every(
        (call) => !call.table.startsWith('rpc:') || call.table === 'rpc:claim_passcode_attempt'
      ),
      'no feedback RPC runs'
    );
  }
});

test('a team passcode resolves feedback in its own translation', async () => {
  const result = await run(
    { teams: [await nepaliTeam()] },
    {
      passcode: NEPALI_CODE,
      translationId: 'npiulb',
      action: 'resolve',
      feedbackId: FEEDBACK_ID,
      resolution: 'no_change_needed',
    }
  );

  assert.equal(result.status, 200);
  const update = result.touched(FEEDBACK_TABLE).find((call) => operation(call) === 'update');
  assert.ok(update);
  assert.deepEqual(
    update.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['id', FEEDBACK_ID],
      ['translation_id', 'npiulb'],
    ]
  );
});

// The admin dashboard can issue 10- and 12-digit team codes once the app keypad accepts them.
// Codes are compared as whole strings, so no function change is needed for longer codes.
test('a twelve-digit team code unlocks and reads, and its six-digit prefix does not', async () => {
  const longCode = '615203948172';
  const team = await teamRow('team-long', longCode, ['npiulb']);

  const unlock = await run(
    { teams: [team] },
    { passcode: longCode, validateOnly: true, translationId: 'npiulb' }
  );
  assert.equal(unlock.status, 200);
  assert.equal(unlock.json.coversTranslation, true);

  const read = await run({ teams: [team] }, chapterRead('npiulb', longCode));
  assert.equal(read.status, 200);

  const prefix = await run(
    { teams: [team] },
    { passcode: longCode.slice(0, 6), validateOnly: true }
  );
  assert.equal(prefix.status, 403);
  assert.equal(prefix.failedAttemptsRecorded, 1);
});

test('a revoked team passcode is refused and counts as a failed attempt', async () => {
  const result = await run(
    { teams: [await nepaliTeam(), await revokedTeam()] },
    { passcode: REVOKED_CODE, validateOnly: true }
  );

  assert.equal(result.status, 403);
  assert.deepEqual(result.json, { success: false, error: 'Translator access denied' });
  assert.equal(result.failedAttemptsRecorded, 1);
});

test('a row with an unknown hash algorithm never matches', async () => {
  const team = { ...(await nepaliTeam()), hash_algorithm: 'plaintext' };
  const result = await run({ teams: [team] }, { passcode: NEPALI_CODE, validateOnly: true });

  assert.equal(result.status, 403);
});

test('a wrong passcode is refused and recorded when team rows exist', async () => {
  const result = await run(
    { teams: [await nepaliTeam()] },
    { passcode: '000000', validateOnly: true }
  );

  assert.equal(result.status, 403);
  assert.equal(result.failedAttemptsRecorded, 1);
});

test('when a team code equals the shared code, the narrower team scope wins', async () => {
  const collision = await teamRow('team-dup', SHARED, ['npiulb']);
  const result = await run({ teams: [collision] }, { passcode: SHARED, validateOnly: true });

  assert.deepEqual(result.json.translationIds, ['npiulb']);
});

// --- Shared passcode transition --------------------------------------------------------------

test('the shared passcode defaults to the translations that already have feedback', async () => {
  const unlock = await run({}, { passcode: SHARED, validateOnly: true, translationId: 'bsb' });
  assert.deepEqual(unlock.json, {
    success: true,
    translationIds: ['bsb'],
    coversTranslation: true,
  });

  const read = await run({}, chapterRead('bsb', SHARED));
  assert.equal(read.status, 200);
});

test('the shared passcode no longer opens translations outside its scope', async () => {
  const result = await run({}, chapterRead('npiulb', SHARED));

  assert.equal(result.status, 403);
  assert.equal(result.json.code, 'translation_not_covered');
  assert.deepEqual(result.touched('rpc:chapter_feedback_review_v2'), []);
});

test('the shared passcode scope is configurable', async () => {
  const env = { TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS: ' bsb , npiulb ,, ' };
  const unlock = await run({ env }, { passcode: SHARED, validateOnly: true });
  assert.deepEqual(unlock.json.translationIds, ['bsb', 'npiulb']);

  const read = await run({ env }, chapterRead('npiulb', SHARED));
  assert.equal(read.status, 200);
});

test('an empty shared scope retires the shared passcode', async () => {
  const result = await run(
    { env: { TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS: 'none' } },
    { passcode: SHARED, validateOnly: true }
  );

  assert.equal(result.status, 403);
  assert.equal(result.failedAttemptsRecorded, 1);
});

test('without TRANSLATOR_REVIEW_PASSCODE, team passcodes still work and the old code does not', async () => {
  const env = { TRANSLATOR_REVIEW_PASSCODE: undefined };
  const teams = [await nepaliTeam()];

  const team = await run({ env, teams }, { passcode: NEPALI_CODE, validateOnly: true });
  assert.equal(team.status, 200);

  const old = await run({ env, teams }, { passcode: SHARED, validateOnly: true });
  assert.equal(old.status, 403);
});

test('the shared passcode still works if the team table cannot be read', async () => {
  const result = await run({ teamLookupFails: true }, chapterRead('bsb', SHARED));

  assert.equal(result.status, 200);
});

test('a code that cannot be checked against the team table fails closed without a recorded failure', async () => {
  const result = await run(
    { teamLookupFails: true },
    { passcode: NEPALI_CODE, validateOnly: true }
  );

  assert.equal(result.status, 503);
  assert.equal(result.failedAttemptsRecorded, 0);
  assert.ok(result.harness.loggedErrors.some((line) => line.includes('translator_team_passcodes')));
  assert.doesNotMatch(JSON.stringify(result.json), /translator_team_passcodes|relation/);
});

// --- Lockout ---------------------------------------------------------------------------------

test('a locked-out client is refused before any passcode is checked, even a valid team code', async () => {
  const result = await run(
    { attemptsInWindow: 10, teams: [await nepaliTeam()] },
    { passcode: NEPALI_CODE, validateOnly: true }
  );

  assert.equal(result.status, 429);
  assert.deepEqual(result.touched(TEAM_TABLE), []);
});

test('the tenth wrong code in the window is answered with a lockout', async () => {
  const result = await run(
    { attemptsInWindow: 9, teams: [await nepaliTeam()] },
    { passcode: '123456', validateOnly: true }
  );

  assert.equal(result.status, 429);
  assert.equal(result.failedAttemptsRecorded, 1);
});
