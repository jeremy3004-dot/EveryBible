import test, { afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { act } from 'react-test-renderer';
import { mockModule, mockPackage } from '../../testing/mockModules';
import { createReactNavigationFake } from '../../testing/nativePackageFakes';
import {
  concern,
  feedbackPage,
  installFeedbackReviewFixture,
  praise,
  settled,
} from './ChapterFeedbackReviewScreen.renderFixture';

const fixture = installFeedbackReviewFixture(mock, { skip: ['@react-navigation/native'] });
const { harness, t, responders, calls, reviewStore, renderReview } = fixture;
let focused = true;
harness.navigation.navigation.isFocused = () => focused;
const navigationDirectory = dirname(
  createRequire(import.meta.url).resolve('@react-navigation/core')
);
mockModule(mock, join(navigationDirectory, 'useNavigation.js'), {
  useNavigation: () => harness.navigation.navigation,
});
before(async () => {
  const { useFocusEffect } = (await import(join(navigationDirectory, 'useFocusEffect.js'))) as {
    useFocusEffect: typeof import('@react-navigation/native').useFocusEffect;
  };
  mockPackage(mock, '@react-navigation/native', {
    ...createReactNavigationFake(harness.navigation),
    useFocusEffect,
  });
});
afterEach(() => {
  focused = true;
});

test('a decision from Pending cannot reload Pending rows under Done', async () => {
  responders.fetch = async (input) =>
    feedbackPage({ feedback: input.status === 'reviewed' ? [settled] : [praise] });
  let finish: () => void = () => {};
  responders.resolve = () =>
    new Promise((resolve) => {
      finish = () => resolve({ success: true });
    });
  const view = await renderReview();
  try {
    await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
    assert.equal(calls.resolve.length, 1);
    await view.press(view.getByRole('tab', { name: t('feedback.doneTab') }));
    await view.flush();
    assert.ok(view.getByText('Old concern'));
    await act(async () => finish());
    await view.flush();
    assert.equal(calls.fetch.at(-1)?.status, 'reviewed');
    assert.ok(view.getByText('Old concern'));
    assert.deepEqual(harness.rn.__recorded.announcements, []);
    // A fresh action in Done remains available after the old operation settles.
    await view.press(view.getByRole('button', { name: t('bible.translatorReviewReopen') }));
    await view.flush();
    assert.equal(calls.reopen.length, 1);
    assert.equal(calls.fetch.at(-1)?.status, 'reviewed');
  } finally {
    finish();
    await view.unmount();
  }
});

test('a native bulk confirmation cannot mutate with cleared reviewer access', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [concern], positiveCount: 2 });
  responders.reviewPositive = async (input) =>
    input.ids ? { success: true } : { success: true, feedbackIds: ['a', 'b'] };
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();
  const confirmation = harness.rn.__recorded.alerts.at(-1);
  assert.ok(confirmation);
  await act(async () => reviewStore.setState({ enabled: false, accessPasscode: null }));
  await view.flush();
  const buttons = confirmation.buttons as { text: string; onPress?: () => void }[];
  await act(async () =>
    buttons.find((button) => button.text === t('feedback.markReviewed'))?.onPress?.()
  );
  await view.flush();
  assert.equal(calls.reviewPositive.length, 1);
  assert.deepEqual(harness.rn.__recorded.announcements, []);
  await view.unmount();
});

test('retained-screen blur invalidates bulk confirmation and refocus permits fresh review', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [concern], positiveCount: 2 });
  responders.reviewPositive = async (input) =>
    input.ids ? { success: true } : { success: true, feedbackIds: ['a', 'b'] };
  const view = await renderReview();
  const review = () => view.getByRole('button', { name: t('feedback.markReviewed') });
  const confirm = (alert: (typeof harness.rn.__recorded.alerts)[number]) =>
    (alert.buttons as { text: string; onPress?: () => void }[])
      .find((button) => button.text === t('feedback.markReviewed'))
      ?.onPress?.();
  await view.press(review());
  await view.flush();
  const oldConfirmation = harness.rn.__recorded.alerts.at(-1);
  assert.ok(oldConfirmation);
  await act(async () => {
    focused = false;
    harness.navigation.emit('blur', {});
  });
  assert.ok(view.getByRole('header', { name: 'John 3' }), 'the screen stayed mounted');
  await act(async () => confirm(oldConfirmation));
  assert.equal(calls.reviewPositive.length, 1);
  await act(async () => {
    focused = true;
    harness.navigation.emit('focus', {});
  });
  await view.flush();
  await view.press(review());
  await view.flush();
  const currentConfirmation = harness.rn.__recorded.alerts.at(-1);
  assert.ok(currentConfirmation);
  await act(async () => confirm(currentConfirmation));
  await view.flush();
  assert.equal(calls.reviewPositive.length, 3);
  assert.deepEqual(calls.reviewPositive.at(-1)?.ids, ['a', 'b']);
  assert.deepEqual(harness.rn.__recorded.announcements, [t('feedback.reviewed')]);
  await view.unmount();
});

test('a bulk preview finishing after unmount does not present a native confirmation', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [concern], positiveCount: 2 });
  let finish: () => void = () => {};
  responders.reviewPositive = () =>
    new Promise((resolve) => {
      finish = () => resolve({ success: true, feedbackIds: ['a', 'b'] });
    });
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  assert.equal(calls.reviewPositive.length, 1);
  await view.unmount();
  await act(async () => finish());
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(harness.rn.__recorded.announcements, []);
});

test('an obsolete decision failure does not alert over the screen opened afterward', async () => {
  let finish: () => void = () => {};
  responders.resolve = () =>
    new Promise((resolve) => {
      finish = () => resolve({ success: false });
    });
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  assert.equal(calls.resolve.length, 1);
  const loadsBefore = calls.fetch.length;
  await view.unmount();
  await act(async () => finish());
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(harness.rn.__recorded.announcements, []);
  assert.equal(calls.fetch.length, loadsBefore);
});

test('a current bulk review failure releases its controls for a successful retry', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [concern], positiveCount: 2 });
  responders.reviewPositive = async () => ({ success: false });
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('common.unexpectedError'));
  responders.reviewPositive = async (input) =>
    input.ids ? { success: true } : { success: true, feedbackIds: ['fresh'] };
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();
  const confirmation = harness.rn.__recorded.alerts.at(-1);
  assert.ok(confirmation);
  await act(async () =>
    (confirmation.buttons as { text: string; onPress?: () => void }[])
      .find((button) => button.text === t('feedback.markReviewed'))
      ?.onPress?.()
  );
  await view.flush();
  assert.deepEqual(calls.reviewPositive.at(-1)?.ids, ['fresh']);
  assert.deepEqual(harness.rn.__recorded.announcements, [t('feedback.reviewed')]);
  await view.unmount();
});
