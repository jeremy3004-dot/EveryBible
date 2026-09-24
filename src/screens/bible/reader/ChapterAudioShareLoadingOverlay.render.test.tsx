import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostAncestors, installRenderHarness } from '../../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string) => harness.i18n.t(key);

test('preparing a chapter audio share is announced and holds VoiceOver on its busy card', async () => {
  const { ChapterAudioShareLoadingOverlay } = await import('./ChapterAudioShareLoadingOverlay');
  const view = await harness.render(
    <ChapterAudioShareLoadingOverlay
      chapterAudioShareActionLabel="Share chapter audio"
      pendingChapterAudioShareAction="full"
    />
  );

  const status = `Share chapter audio, ${t('common.loading')}`;
  const card = view.getByLabelText(status);
  assert.equal(card.props.accessible, true);
  assert.deepEqual(card.props.accessibilityState, { busy: true });
  assert.equal(card.props.accessibilityLiveRegion, 'polite');
  assert.ok(hostAncestors(card).some((node) => node.props.accessibilityViewIsModal === true));
  assert.deepEqual(harness.rn.__recorded.announcements, [status]);
});

test('nothing renders or is announced while no share is being prepared', async () => {
  const { ChapterAudioShareLoadingOverlay } = await import('./ChapterAudioShareLoadingOverlay');
  const view = await harness.render(
    <ChapterAudioShareLoadingOverlay
      chapterAudioShareActionLabel="Share chapter audio"
      pendingChapterAudioShareAction={null}
    />
  );

  assert.equal(view.queryByText('Share chapter audio'), null);
  assert.deepEqual(harness.rn.__recorded.announcements, []);
});
