import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen shows inline chapter feedback in listen mode and keeps the reader modal as fallback', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /showInlineChapterFeedbackComposer[\s\S]*chapterFeedbackInlineComposer[\s\S]*stableSessionMode === 'listen'/,
    'BibleReaderScreen should render the inline feedback composer only in listen mode behind the feature flag'
  );
  assert.match(
    source,
    /chapterFeedbackEnabled && !showInlineChapterFeedbackComposer[\s\S]*key:\s*'chapter-feedback'/,
    'BibleReaderScreen should keep the overflow feedback action as a fallback when the inline composer is hidden'
  );
  assert.match(
    source,
    /handleSubmitChapterFeedback\('listener'\)/,
    'BibleReaderScreen should submit inline listener feedback through the listener source tag'
  );
  assert.match(
    source,
    /handleSubmitChapterFeedback\('reader'\)/,
    'BibleReaderScreen should keep the reader modal submission path intact'
  );
});

test('BibleReaderScreen renders a lightweight feedback modal with thumbs and an optional multiline comment', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /TextInput[\s\S]*multiline/,
    'BibleReaderScreen should provide a multiline TextInput for optional chapter feedback comments'
  );
  assert.match(
    source,
    /feedbackSentiment === 'up'|setFeedbackSentiment\('up'\)/,
    'BibleReaderScreen should expose a thumbs-up action for chapter feedback'
  );
  assert.match(
    source,
    /feedbackSentiment === 'down'|setFeedbackSentiment\('down'\)/,
    'BibleReaderScreen should expose a thumbs-down action for chapter feedback'
  );
});

test('BibleReaderScreen submits chapter feedback through the dedicated service and preserves retry state on failure', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /submitChapterFeedback\(/,
    'BibleReaderScreen should submit feedback through submitChapterFeedback'
  );
  assert.match(
    source,
    /result\.success[\s\S]*setShowFeedbackModal\(false\)/,
    'BibleReaderScreen should only close the feedback modal after a successful submit result'
  );
  assert.match(
    source,
    /setFeedbackSubmitError|feedbackSubmitError/,
    'BibleReaderScreen should preserve a retry-safe error state when feedback submission fails'
  );
});

test('BibleReaderScreen uses the saved reviewer name and role but does not depend on a manual ID-number preference', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('chapterFeedbackIdNumber'),
    false,
    'BibleReaderScreen should not read a manual chapter feedback ID number from preferences'
  );
  assert.match(
    source,
    /participantName:\s*savedChapterFeedbackIdentity\.name/,
    'BibleReaderScreen should keep sending the saved reviewer name'
  );
  assert.match(
    source,
    /participantRole:\s*savedChapterFeedbackIdentity\.role/,
    'BibleReaderScreen should keep sending the saved reviewer role'
  );
});
