import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { createSupabaseFake, mockModule } from './testing/adminTestHarness';

const service = createSupabaseFake();
mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });

const {
  getTranslationIdsWithFeedback,
  getTranslatorTeams,
  parseTeamPasscodeLength,
  parseTeamTranslationIds,
} = await import('./translator-access');

beforeEach(() => service.reset());

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
