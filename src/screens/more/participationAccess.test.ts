import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeParticipationAccess,
  submitParticipationAccess,
  type ParticipationAccessKind,
  type ParticipationAccessResult,
  type ParticipationAccessSubmit,
} from './participationAccess';

function settings(
  kind: ParticipationAccessKind,
  overrides: Partial<ParticipationAccessSubmit> = {}
) {
  let complete!: (value: ParticipationAccessResult) => void;
  const response = new Promise<ParticipationAccessResult>((resolve) => {
    complete = resolve;
  });
  const recorded = {
    enabled: [] as string[],
    validated: [] as unknown[][],
    errors: [] as (string | null)[],
    preferences: [] as object[],
    checking: [] as boolean[],
    modal: [] as boolean[],
    syncs: 0,
  };
  const access: ParticipationAccessSubmit = {
    attemptRef: { current: 0 },
    kind,
    isChecking: false,
    passcode: 'entered-code',
    translationId: 'BSB',
    validateCouncil: (...args) => {
      recorded.validated.push(['council', ...args]);
      return response;
    },
    validateTranslator: (...args) => {
      recorded.validated.push(['translator', ...args]);
      return response;
    },
    enableCouncil: (passcode) => {
      recorded.enabled.push(`scripture_council:${passcode}`);
      return true;
    },
    enableTranslator: (passcode) => {
      recorded.enabled.push(`translator:${passcode}`);
      return true;
    },
    setIsChecking: (value) => recorded.checking.push(value),
    setShowModal: (value) => recorded.modal.push(value),
    setPasscode: () => {},
    setError: (value) => recorded.errors.push(value),
    setPreferences: (value) => recorded.preferences.push(value),
    syncPreferences: async () => {
      recorded.syncs += 1;
    },
    t: (key) => `t:${key}`,
    ...overrides,
  };
  return {
    submit: () => submitParticipationAccess(access),
    cancel: () => closeParticipationAccess(access),
    complete,
    recorded,
  };
}

for (const role of ['translator', 'scripture_council'] as const) {
  test(`${role} changes mode only after successful validation`, async () => {
    const h = settings(role);
    const pending = h.submit();
    assert.deepEqual(h.recorded.enabled, []);
    h.complete({ success: true });
    await pending;

    assert.deepEqual(h.recorded.enabled, [`${role}:entered-code`]);
    assert.deepEqual(h.recorded.preferences, [
      { chapterFeedbackEnabled: role === 'scripture_council' },
    ]);
    assert.equal(h.recorded.syncs, 1);
    assert.deepEqual(h.recorded.modal, [false]);
    assert.deepEqual(h.recorded.checking, [true, false]);
  });

  test(`${role} rejection and connection failure preserve participation`, async () => {
    const denial = role === 'translator' ? 'Translator access denied' : 'Council access denied';
    for (const [error, message] of [
      [denial, 't:feedback.incorrectCode'],
      ['Network request failed', 't:common.unexpectedError'],
    ]) {
      const h = settings(role);
      const pending = h.submit();
      h.complete({ success: false, error });
      await pending;

      assert.deepEqual(h.recorded.enabled, []);
      assert.deepEqual(h.recorded.preferences, []);
      assert.deepEqual(h.recorded.errors, [null, message]);
    }
  });

  test(`${role} cancellation ignores a successful response arriving later`, async () => {
    const h = settings(role);
    const pending = h.submit();
    h.cancel();
    h.complete({ success: true });
    await pending;

    assert.deepEqual(h.recorded.enabled, []);
    assert.deepEqual(h.recorded.preferences, []);
    assert.deepEqual(h.recorded.checking, [true, false], 'only the close settles the spinner');
  });

  test(`${role} a code the store refuses after validation is reported as incorrect`, async () => {
    const h = settings(role, {
      enableCouncil: () => false,
      enableTranslator: () => false,
    });
    const pending = h.submit();
    h.complete({ success: true });
    await pending;

    assert.deepEqual(h.recorded.preferences, []);
    assert.deepEqual(h.recorded.errors, [null, 't:feedback.incorrectCode']);
  });
}

test('translators validate against the translation being read; council codes do not', async () => {
  const translator = settings('translator');
  const translatorPending = translator.submit();
  translator.complete({ success: true });
  await translatorPending;
  assert.deepEqual(translator.recorded.validated, [['translator', 'entered-code', 'BSB']]);

  const council = settings('scripture_council');
  const councilPending = council.submit();
  council.complete({ success: true });
  await councilPending;
  assert.deepEqual(council.recorded.validated, [['council', 'entered-code']]);
});

test('a second submit while a check is running does nothing', async () => {
  const h = settings('translator', { isChecking: true });
  await h.submit();

  assert.deepEqual(h.recorded.validated, []);
  assert.deepEqual(h.recorded.checking, []);
});
