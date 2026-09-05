import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyScriptureReference, shouldLoadDailyScriptureText } from './dailyScripture';
import { POPULAR_VERSE_REFERENCES } from './popularVerseReferences';

test('daily references cycle through the complete local roster before repeating', () => {
  const selected = new Set();
  for (let day = 0; day < POPULAR_VERSE_REFERENCES.length; day++) {
    selected.add(getDailyScriptureReference(new Date(2026, 0, 1 + day)));
  }
  assert.equal(selected.size, POPULAR_VERSE_REFERENCES.length);
  assert.equal(
    getDailyScriptureReference(new Date(2026, 0, 1)),
    getDailyScriptureReference(new Date(2026, 0, 1 + POPULAR_VERSE_REFERENCES.length))
  );
});

test('local calendar days remain stable until midnight and advance across New Year', () => {
  const morning = getDailyScriptureReference(new Date(2026, 11, 31, 0, 1));
  const evening = getDailyScriptureReference(new Date(2026, 11, 31, 23, 59));
  assert.equal(morning, evening);
  const index = POPULAR_VERSE_REFERENCES.indexOf(evening);
  assert.equal(
    getDailyScriptureReference(new Date(2027, 0, 1)),
    POPULAR_VERSE_REFERENCES[(index + 1) % POPULAR_VERSE_REFERENCES.length]
  );
});

test('daylight-saving and leap-day boundaries advance exactly one entry', () => {
  for (const date of [new Date(2026, 2, 8), new Date(2026, 10, 1), new Date(2028, 1, 29)]) {
    const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    const index = POPULAR_VERSE_REFERENCES.indexOf(getDailyScriptureReference(previous));
    assert.equal(
      getDailyScriptureReference(date),
      POPULAR_VERSE_REFERENCES[(index + 1) % POPULAR_VERSE_REFERENCES.length]
    );
  }
});

test('daily scripture skips text loading when the translation has no text', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: false,
      isBibleReady: false,
      allowInitialization: true,
    }),
    false
  );
});

test('daily scripture can avoid triggering heavyweight bible initialization on launch', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: true,
      isBibleReady: false,
      allowInitialization: false,
    }),
    false
  );
});

test('daily scripture can initialize bible data when explicitly allowed', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: true,
      isBibleReady: false,
      allowInitialization: true,
    }),
    true
  );
});

test('daily scripture loads text when the bible data is already ready', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: true,
      isBibleReady: true,
      allowInitialization: false,
    }),
    true
  );
});
