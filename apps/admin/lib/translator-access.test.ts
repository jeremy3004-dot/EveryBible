import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { createSupabaseFake, mockModule, stepArgs } from './testing/adminTestHarness';

const service = createSupabaseFake();
let isAdmin = true;
mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    if (!isAdmin) throw new Error('Admin identity required');
    return { id: 'admin-1', role: 'super_admin' };
  },
});
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });

const {
  getSharedPasscodeSetting,
  getSharedPasscodeUsage,
  getTranslationIdsWithFeedback,
  getTranslatorTeams,
  parseTeamPasscodeLength,
  parseTeamTranslationIds,
  translationsWithoutTeamCode,
} = await import('./translator-access');

beforeEach(() => {
  service.reset();
  isAdmin = true;
});

test('every loader checks for an admin before it reads anything', async () => {
  // The page guards too, but a loader imported by a future page must not rely on that.
  isAdmin = false;
  for (const load of [
    getTranslatorTeams,
    getSharedPasscodeSetting,
    () => getSharedPasscodeUsage(),
    getTranslationIdsWithFeedback,
  ]) {
    await assert.rejects(load(), /Admin identity required/);
  }
  assert.deepEqual(service.calls, []);
});

test('the team list never reads passcode salts or hashes', async () => {
  service.respondTo('translator_team_passcodes', () => ({
    data: [
      {
        id: 'team-1',
        label: 'Nepali team',
        translation_ids: ['npiulb'],
        created_at: '2026-09-24T08:00:00.000Z',
        revoked_at: null,
      },
    ],
  }));

  const teams = await getTranslatorTeams();

  assert.deepEqual(teams, [
    {
      id: 'team-1',
      label: 'Nepali team',
      translationIds: ['npiulb'],
      createdAt: '2026-09-24T08:00:00.000Z',
      revokedAt: null,
    },
  ]);
  const [call] = service.callsFor('translator_team_passcodes');
  assert.doesNotMatch(String(call.columns), /salt|hash|\*/);
});

test('a failed team list load is reported rather than shown as empty', async () => {
  service.respondTo('translator_team_passcodes', () => ({
    data: null,
    error: { message: 'relation does not exist' },
  }));
  await assert.rejects(getTranslatorTeams(), /Unable to load translator teams/);
});

test('translation hints are the distinct ids the app has sent feedback for', async () => {
  service.respondTo('chapter_feedback_submissions', () => ({
    data: [{ translation_id: 'bsb' }, { translation_id: 'bsb' }, { translation_id: 'npiulb' }],
  }));
  assert.deepEqual(await getTranslationIdsWithFeedback(), ['bsb', 'npiulb']);
});

test('translation hints read every feedback row, not just the first page PostgREST returns', async () => {
  // The hint drives the "no active team passcode" warning shown before the shared passcode is
  // turned off. PostgREST caps a response at max_rows (1000 by default) whatever .limit() asks
  // for, so ids that sort after the first page would silently drop out of that warning.
  const PAGE = 1000;
  const rows = [
    ...Array.from({ length: PAGE }, () => ({ translation_id: 'aaa' })),
    ...Array.from({ length: PAGE }, () => ({ translation_id: 'bsb' })),
    { translation_id: 'zzz' },
  ];
  service.respondTo('chapter_feedback_submissions', (call) => {
    const [from, to] = (stepArgs(call, 'range')[0] ?? [0, rows.length - 1]) as [number, number];
    // Emulate the server-side cap regardless of the requested window.
    return { data: rows.slice(from, Math.min(to + 1, from + PAGE)) };
  });

  assert.deepEqual(await getTranslationIdsWithFeedback(), ['aaa', 'bsb', 'zzz']);
});

test('translation ids keep their case and are split on commas and new lines', () => {
  assert.deepEqual(parseTeamTranslationIds('BSB, bsb\n el-nep '), {
    ids: ['BSB', 'bsb', 'el-nep'],
  });
  assert.deepEqual(parseTeamTranslationIds(null), { error: 'Enter at least one translation ID' });
});

test('the code length defaults to six and accepts only the offered lengths', () => {
  assert.deepEqual(parseTeamPasscodeLength(null), { length: 6 });
  assert.deepEqual(parseTeamPasscodeLength(''), { length: 6 });
  assert.deepEqual(parseTeamPasscodeLength('10'), { length: 10 });
  assert.deepEqual(parseTeamPasscodeLength(' 12 '), { length: 12 });
  for (const raw of ['8', '13', '6.5', 'twelve']) {
    assert.deepEqual(parseTeamPasscodeLength(raw), {
      error: 'Choose a code length of 6, 10 or 12 digits',
    });
  }
});

// ---------------------------------------------------------------------------
// Retiring the shared passcode
// ---------------------------------------------------------------------------

const team = (id: string, translationIds: string[], revokedAt: string | null = null) => ({
  id,
  label: `Team ${id}`,
  translationIds,
  createdAt: '2026-09-24T08:00:00.000Z',
  revokedAt,
});

test('translations with feedback but no active team code are listed as gaps', () => {
  assert.deepEqual(
    translationsWithoutTeamCode(
      ['bsb', 'npiulb', 'el-nep', 'BSB'],
      [team('a', ['npiulb']), team('b', ['el-nep', 'bsb'], '2026-09-24T09:00:00.000Z')]
    ),
    ['bsb', 'el-nep', 'BSB']
  );
  assert.deepEqual(translationsWithoutTeamCode([], []), []);
});

test('the shared passcode switch reads as allowed until the owner turns it off', async () => {
  service.respondTo('translator_access_settings', () => ({
    data: { shared_passcode_enabled: false, updated_at: '2026-09-25T10:00:00.000Z' },
  }));
  assert.deepEqual(await getSharedPasscodeSetting(), {
    installed: true,
    allowed: false,
    updatedAt: '2026-09-25T10:00:00.000Z',
  });

  service.respondTo('translator_access_settings', () => ({ data: null }));
  assert.deepEqual(await getSharedPasscodeSetting(), {
    installed: true,
    allowed: true,
    updatedAt: null,
  });
});

test('before the migration the switch reports itself as not installed', async () => {
  service.respondTo('translator_access_settings', () => ({
    data: null,
    error: { code: 'PGRST205', message: 'Could not find the table' },
  }));
  assert.deepEqual(await getSharedPasscodeSetting(), {
    installed: false,
    allowed: true,
    updatedAt: null,
  });
});

test('any other switch read failure is reported rather than shown as allowed', async () => {
  service.respondTo('translator_access_settings', () => ({
    data: null,
    error: { code: '57014', message: 'statement timeout' },
  }));
  await assert.rejects(getSharedPasscodeSetting(), /Unable to load the shared passcode setting/);
});

test('shared passcode uses are summarised per translation over the recent window', async () => {
  service.respondTo('translator_shared_passcode_uses', () => ({
    data: [
      { translation_id: 'bsb', outcome: 'refused', used_at: '2026-09-24T12:00:00.000Z' },
      { translation_id: 'bsb', outcome: 'allowed', used_at: '2026-09-24T11:00:00.000Z' },
      { translation_id: null, outcome: 'allowed', used_at: '2026-09-23T09:00:00.000Z' },
      { translation_id: 'bsb', outcome: 'allowed', used_at: '2026-09-20T09:00:00.000Z' },
    ],
  }));

  const usage = await getSharedPasscodeUsage(new Date('2026-09-24T13:00:00.000Z'), 30);

  assert.deepEqual(usage, {
    installed: true,
    since: '2026-08-25T13:00:00.000Z',
    total: 4,
    lastUsedAt: '2026-09-24T12:00:00.000Z',
    truncated: false,
    byTranslation: [
      { translationId: 'bsb', allowed: 2, refused: 1, lastUsedAt: '2026-09-24T12:00:00.000Z' },
      { translationId: null, allowed: 1, refused: 0, lastUsedAt: '2026-09-23T09:00:00.000Z' },
    ],
  });
  const [call] = service.callsFor('translator_shared_passcode_uses');
  assert.deepEqual(stepArgs(call, 'gte'), [['used_at', '2026-08-25T13:00:00.000Z']]);
  assert.doesNotMatch(String(call.columns), /\*/);
});

test('usage counts come from the database total, so a capped page is flagged as truncated', async () => {
  // PostgREST returns at most max_rows (1000 by default) rows, far below the 5000 the code
  // asks for, so the row count alone can neither be the total nor detect truncation.
  service.respondTo('translator_shared_passcode_uses', () => ({
    data: Array.from({ length: 1000 }, (_, index) => ({
      translation_id: 'bsb',
      outcome: 'allowed',
      used_at: `2026-09-24T12:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:00.000Z`,
    })),
    count: 1500,
  }));

  const usage = await getSharedPasscodeUsage(new Date('2026-09-24T13:00:00.000Z'), 30);

  assert.equal(usage.total, 1500);
  assert.equal(usage.truncated, true);
  const [call] = service.callsFor('translator_shared_passcode_uses');
  assert.deepEqual(stepArgs(call, 'select')[0][1], { count: 'exact' });
});

test('before the migration the usage log reports itself as not installed', async () => {
  service.respondTo('translator_shared_passcode_uses', () => ({
    data: null,
    error: { code: '42P01', message: 'relation does not exist' },
  }));
  const usage = await getSharedPasscodeUsage(new Date('2026-09-24T13:00:00.000Z'), 30);
  assert.equal(usage.installed, false);
  assert.equal(usage.total, 0);
  assert.deepEqual(usage.byTranslation, []);
});

test('any other usage read failure is reported rather than shown as unused', async () => {
  service.respondTo('translator_shared_passcode_uses', () => ({
    data: null,
    error: { code: '57014', message: 'statement timeout' },
  }));
  await assert.rejects(
    getSharedPasscodeUsage(new Date('2026-09-24T13:00:00.000Z'), 30),
    /Unable to load shared passcode uses/
  );
});
