import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen gates the chapter feedback action behind the settings preference', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /chapterFeedbackEnabled[\s\S]*key:\s*'chapter-feedback'/,
    'BibleReaderScreen should only add the chapter feedback action when chapterFeedbackEnabled is true'
  );
});

test('BibleReaderScreen requires a live auth session before opening the chapter feedback modal', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /useAuthStore\(\(state\) => state\.session(?:\s*!==\s*null)?\)/,
    'BibleReaderScreen should read the live auth session from the auth store'
  );
  assert.match(
    source,
    /if\s*\(!hasLiveAuthSession\)/,
    'BibleReaderScreen should block feedback submission paths when no live auth session is available'
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

test('BibleReaderScreen keeps the feedback submit actions reachable when the keyboard is open', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /<KeyboardAvoidingView[\s\S]*behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}[\s\S]*styles\.feedbackModalOverlay/s,
    'BibleReaderScreen should wrap the feedback modal in a KeyboardAvoidingView so the keyboard can shift the sheet upward'
  );

  assert.match(
    source,
    /<ScrollView[\s\S]*styles\.feedbackModalScrollView[\s\S]*keyboardShouldPersistTaps="handled"[\s\S]*styles\.feedbackActionRow/s,
    'BibleReaderScreen should make the feedback modal body scrollable so the submit row stays reachable above the keyboard'
  );
});
