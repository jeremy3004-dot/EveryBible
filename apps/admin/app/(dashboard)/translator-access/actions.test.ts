/**
 * Team translator passcodes: create (shown once), revoke, rotate. Admin gating for every
 * export is also covered by app/serverBoundaryAuth.test.ts; the first tests here pin it for
 * these actions specifically, then the caller is a super_admin.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import * as realCrypto from '../../../lib/translator-access-crypto';
import {
  RedirectSignal,
  captureRedirect,
  createSupabaseFake,
  formData,
  mockModule,
  mockNextServerRuntime,
  stepArgs,
  type SupabaseQueryCall,
} from '../../../lib/testing/adminTestHarness';

const ADMIN = { email: 'ops@everybible.app', id: 'admin-1', name: 'Ops Lead', role: 'super_admin' };
const TEAM_TABLE = 'translator_team_passcodes';
const TEAM_ID = '7e7e7e7e-0000-4000-8000-000000000007';

const service = createSupabaseFake();
let adminGate: 'admin' | 'signed_out' | 'forbidden' = 'admin';
// Codes the generator hands out next; empty means the real CSPRNG generator.
const scriptedCodes: string[] = [];

mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    if (adminGate === 'signed_out') throw new RedirectSignal('/login?reason=auth');
    if (adminGate === 'forbidden') throw new RedirectSignal('/login?reason=forbidden');
    return ADMIN;
  },
});
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });
mockModule(mock, '@/lib/translator-access-crypto', {
  ...realCrypto,
  generateTeamPasscode: (length?: realCrypto.TeamPasscodeLength) =>
    scriptedCodes.shift() ?? realCrypto.generateTeamPasscode(length),
});
const next = mockNextServerRuntime(mock);

const {
  createTranslatorTeamPasscodeAction,
  revokeTranslatorTeamPasscodeAction,
  rotateTranslatorTeamPasscodeAction,
} = await import('./actions');

interface StoredRow {
  id: string;
  label: string;
  translation_ids: string[];
  passcode_salt: string;
  passcode_hash: string;
}

let activeRows: StoredRow[] = [];
let failOn: Partial<Record<'select' | 'insert' | 'update', string>> = {};
let revokableRow: { id: string; label: string; translation_ids: string[] } | null = null;

beforeEach(() => {
  service.reset();
  adminGate = 'admin';
  scriptedCodes.length = 0;
  activeRows = [];
  failOn = {};
  revokableRow = { id: TEAM_ID, label: 'Nepali ULB team', translation_ids: ['npiulb'] };
  next.revalidatedPaths.length = 0;
  service.respondTo(TEAM_TABLE, (call: SupabaseQueryCall) => {
    const failure = failOn[call.operation as 'select' | 'insert' | 'update'];
    if (failure) return { data: null, error: { message: failure } };
    if (call.operation === 'insert') return { data: { id: 'team-new' } };
    if (call.operation === 'update') return { data: revokableRow };
    return { data: activeRows };
  });
});

const teamCalls = (operation: string) =>
  service.callsFor(TEAM_TABLE).filter((call) => call.operation === operation);
const auditRows = () => service.callsFor('admin_audit_logs').map((call) => call.payload);

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

for (const gate of ['signed_out', 'forbidden'] as const) {
  test(`every translator-access action refuses a ${gate} caller before touching the database`, async () => {
    adminGate = gate;
    const input = formData({ label: 'Team', translationIds: 'npiulb', teamId: TEAM_ID });
    for (const action of [
      createTranslatorTeamPasscodeAction,
      revokeTranslatorTeamPasscodeAction,
      rotateTranslatorTeamPasscodeAction,
    ]) {
      const url = await captureRedirect(() => action(input));
      assert.match(url, /^\/login\?reason=/);
    }
    assert.deepEqual(service.calls, []);
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test('creating a team passcode stores only a salted hash and returns the code once', async () => {
  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: '  Nepali ULB team ', translationIds: 'npiulb, npi-audio\nnpiulb' })
  );

  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.match(result.passcode ?? '', /^[0-9]{6}$/);
  assert.equal(result.label, 'Nepali ULB team');
  assert.deepEqual(result.translationIds, ['npiulb', 'npi-audio']);

  const [insert] = teamCalls('insert');
  const row = insert.payload as Record<string, unknown>;
  assert.deepEqual(Object.keys(row).sort(), [
    'created_by',
    'hash_algorithm',
    'label',
    'passcode_hash',
    'passcode_salt',
    'translation_ids',
  ]);
  assert.equal(row.label, 'Nepali ULB team');
  assert.deepEqual(row.translation_ids, ['npiulb', 'npi-audio']);
  assert.equal(row.created_by, 'admin-1');
  assert.equal(row.hash_algorithm, 'sha256-salt-v1');
  assert.match(String(row.passcode_salt), /^[0-9a-f]{32}$/);
  assert.equal(
    row.passcode_hash,
    realCrypto.hashTeamPasscode(String(row.passcode_salt), result.passcode ?? '')
  );
  assert.ok(!JSON.stringify(row).includes(`"${result.passcode}"`), 'plaintext code stored');

  assert.deepEqual(next.revalidatedPaths, ['/translator-access']);
});

test('the audit row names the team and translations but never the code or its hash', async () => {
  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: 'Nepali ULB team', translationIds: 'npiulb' })
  );

  const [insert] = teamCalls('insert');
  const row = insert.payload as { passcode_hash: string; passcode_salt: string };
  assert.deepEqual(auditRows(), [
    {
      action: 'translator_access.team_passcode.create',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'team-new',
      entity_type: 'translator_team_passcode',
      metadata: { codeLength: 6, label: 'Nepali ULB team', translationIds: ['npiulb'] },
      summary: 'Created a translator passcode for Nepali ULB team (npiulb).',
    },
  ]);
  const audit = JSON.stringify(auditRows());
  for (const secret of [result.passcode ?? '', row.passcode_hash, row.passcode_salt]) {
    assert.ok(!audit.includes(secret), 'audit log leaked passcode material');
  }
});

test('a new code never matches another active team code', async () => {
  const salt = realCrypto.newTeamPasscodeSalt();
  activeRows = [
    {
      id: 'team-1',
      label: 'BSB team',
      translation_ids: ['bsb'],
      passcode_salt: salt,
      passcode_hash: realCrypto.hashTeamPasscode(salt, '111111'),
    },
  ];
  scriptedCodes.push('111111', '222222');

  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: 'Nepali team', translationIds: 'npiulb' })
  );

  assert.equal(result.passcode, '222222');
  const [lookup] = teamCalls('select');
  assert.deepEqual(stepArgs(lookup, 'is'), [['revoked_at', null]]);
});

test('an operator can issue a longer code once the new app build is widely installed', async () => {
  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: 'Nepali ULB team', translationIds: 'npiulb', codeLength: '12' })
  );

  assert.equal(result.ok, true);
  assert.match(result.passcode ?? '', /^[0-9]{12}$/);
  const [insert] = teamCalls('insert');
  const row = insert.payload as { passcode_salt: string; passcode_hash: string };
  assert.equal(
    row.passcode_hash,
    realCrypto.hashTeamPasscode(row.passcode_salt, result.passcode ?? '')
  );
  assert.equal((auditRows()[0] as { metadata: { codeLength: number } }).metadata.codeLength, 12);
});

for (const [label, fields, error] of [
  [
    'a missing team name',
    { translationIds: 'npiulb' },
    'A team name of at most 120 characters is required',
  ],
  [
    'an over-long team name',
    { label: 'x'.repeat(121), translationIds: 'npiulb' },
    'A team name of at most 120 characters is required',
  ],
  [
    'no translations',
    { label: 'Team', translationIds: ' , ' },
    'Enter at least one translation ID',
  ],
  [
    'a malformed translation ID',
    { label: 'Team', translationIds: 'npiulb, bad id!' },
    'Invalid translation ID: bad id!',
  ],
  [
    'an unsupported code length',
    { label: 'Team', translationIds: 'npiulb', codeLength: '8' },
    'Choose a code length of 6, 10 or 12 digits',
  ],
  [
    'too many translations',
    { label: 'Team', translationIds: Array.from({ length: 51 }, (_, i) => `t${i}`).join(',') },
    'A passcode can cover at most 50 translations',
  ],
] as const) {
  test(`creating a passcode with ${label} writes nothing`, async () => {
    const result = await createTranslatorTeamPasscodeAction(formData(fields));
    assert.deepEqual(result, {
      ok: false,
      error,
      passcode: null,
      label: null,
      translationIds: [],
    });
    assert.deepEqual(service.calls, []);
  });
}

test('a failed insert returns the error, no code, and no audit row', async () => {
  failOn = { insert: 'permission denied for table translator_team_passcodes' };
  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: 'Team', translationIds: 'npiulb' })
  );

  assert.equal(result.ok, false);
  assert.equal(result.passcode, null);
  assert.match(result.error ?? '', /permission denied/);
  assert.deepEqual(auditRows(), []);
  assert.deepEqual(next.revalidatedPaths, []);
});

test('if active codes cannot be loaded, nothing is created', async () => {
  failOn = { select: 'relation "translator_team_passcodes" does not exist' };
  const result = await createTranslatorTeamPasscodeAction(
    formData({ label: 'Team', translationIds: 'npiulb' })
  );

  assert.equal(result.ok, false);
  assert.deepEqual(teamCalls('insert'), []);
});

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

test('revoking stamps who and when on the active row only, audits it and returns to the list', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T09:00:00.000Z') });
  const url = await captureRedirect(() =>
    revokeTranslatorTeamPasscodeAction(formData({ teamId: TEAM_ID }))
  );

  const [update] = teamCalls('update');
  assert.deepEqual(update.payload, {
    revoked_at: '2026-09-24T09:00:00.000Z',
    revoked_by: 'admin-1',
  });
  assert.deepEqual(stepArgs(update, 'eq'), [['id', TEAM_ID]]);
  assert.deepEqual(stepArgs(update, 'is'), [['revoked_at', null]]);
  assert.deepEqual(auditRows(), [
    {
      action: 'translator_access.team_passcode.revoke',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: TEAM_ID,
      entity_type: 'translator_team_passcode',
      metadata: { label: 'Nepali ULB team', translationIds: ['npiulb'] },
      summary: 'Revoked the translator passcode for Nepali ULB team (npiulb).',
    },
  ]);
  assert.deepEqual(next.revalidatedPaths, ['/translator-access']);
  // The label is operator input, so it is URL-encoded rather than trusted in the query string.
  assert.equal(
    url,
    `/translator-access?notice=${encodeURIComponent('Passcode revoked for Nepali ULB team')}`
  );
});

test('revoking without a team id changes nothing', async () => {
  const url = await captureRedirect(() => revokeTranslatorTeamPasscodeAction(formData({})));
  assert.equal(url, '/translator-access?error=Missing team id');
  assert.deepEqual(service.calls, []);
});

test('a team id that is not a uuid is refused before any write, not sent to Postgres', async () => {
  // Postgres would answer with "invalid input syntax for type uuid", shown to the operator.
  const url = await captureRedirect(() =>
    revokeTranslatorTeamPasscodeAction(formData({ teamId: 'team-7' }))
  );
  assert.equal(url, '/translator-access?error=Missing team id');

  const result = await rotateTranslatorTeamPasscodeAction(formData({ teamId: 'team-7' }));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Missing team id');
  assert.deepEqual(service.calls, []);
});

test('revoking a passcode that is already revoked reports it and is not audited', async () => {
  revokableRow = null;
  const url = await captureRedirect(() =>
    revokeTranslatorTeamPasscodeAction(formData({ teamId: TEAM_ID }))
  );
  assert.equal(
    url,
    `/translator-access?error=${encodeURIComponent('That passcode is already revoked or does not exist')}`
  );
  assert.deepEqual(auditRows(), []);
});

// ---------------------------------------------------------------------------
// Rotate
// ---------------------------------------------------------------------------

test('rotating revokes the old code first, then issues a new one for the same team', async () => {
  const result = await rotateTranslatorTeamPasscodeAction(formData({ teamId: TEAM_ID }));

  assert.equal(result.ok, true);
  assert.match(result.passcode ?? '', /^[0-9]{6}$/);
  assert.equal(result.label, 'Nepali ULB team');
  assert.deepEqual(result.translationIds, ['npiulb']);

  const order = service.callsFor(TEAM_TABLE).map((call) => call.operation);
  assert.deepEqual(order, ['update', 'select', 'insert']);
  const insert = teamCalls('insert')[0].payload as Record<string, unknown>;
  assert.equal(insert.label, 'Nepali ULB team');
  assert.deepEqual(insert.translation_ids, ['npiulb']);

  assert.deepEqual(auditRows(), [
    {
      action: 'translator_access.team_passcode.rotate',
      actor_email: 'ops@everybible.app',
      actor_user_id: 'admin-1',
      entity_id: 'team-new',
      entity_type: 'translator_team_passcode',
      metadata: {
        codeLength: 6,
        label: 'Nepali ULB team',
        previousTeamPasscodeId: TEAM_ID,
        translationIds: ['npiulb'],
      },
      summary: 'Rotated the translator passcode for Nepali ULB team (npiulb).',
    },
  ]);
  assert.ok(!JSON.stringify(auditRows()).includes(result.passcode ?? '---'));
});

test('rotating can move a team to a longer code', async () => {
  const result = await rotateTranslatorTeamPasscodeAction(
    formData({ teamId: TEAM_ID, codeLength: '10' })
  );

  assert.equal(result.ok, true);
  assert.match(result.passcode ?? '', /^[0-9]{10}$/);
});

test('rotating with an unsupported code length leaves the current code working', async () => {
  const result = await rotateTranslatorTeamPasscodeAction(
    formData({ teamId: TEAM_ID, codeLength: '7' })
  );

  assert.equal(result.error, 'Choose a code length of 6, 10 or 12 digits');
  assert.deepEqual(service.calls, []);
});

test('rotating a code that is not active issues nothing', async () => {
  revokableRow = null;
  const result = await rotateTranslatorTeamPasscodeAction(formData({ teamId: TEAM_ID }));

  assert.equal(result.ok, false);
  assert.equal(result.error, 'That passcode is already revoked or does not exist');
  assert.deepEqual(teamCalls('insert'), []);
  assert.deepEqual(auditRows(), []);
});

test('if the replacement cannot be issued, the operator is told the old code is already revoked', async () => {
  failOn = { insert: 'insert failed' };
  const result = await rotateTranslatorTeamPasscodeAction(formData({ teamId: TEAM_ID }));

  assert.equal(result.ok, false);
  assert.equal(result.passcode, null);
  assert.match(result.error ?? '', /old passcode was revoked.*insert failed/);
  // The revoke happened, so it is audited even though the rotation did not finish.
  assert.deepEqual(
    auditRows().map((row) => (row as { action: string }).action),
    ['translator_access.team_passcode.revoke']
  );
  assert.deepEqual(next.revalidatedPaths, ['/translator-access']);
});

test('rotating without a team id changes nothing', async () => {
  const result = await rotateTranslatorTeamPasscodeAction(formData({}));
  assert.equal(result.error, 'Missing team id');
  assert.deepEqual(service.calls, []);
});
