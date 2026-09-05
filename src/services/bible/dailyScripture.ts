import { POPULAR_VERSE_REFERENCES } from './popularVerseReferences';

export function getDailyScriptureReference(date = new Date()) {
  // Use local calendar components, not elapsed local-midnight hours: DST must
  // not repeat/skip a verse. A fixed epoch also keeps the cycle going at New Year.
  const calendarDay = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
  const index =
    ((calendarDay % POPULAR_VERSE_REFERENCES.length) + POPULAR_VERSE_REFERENCES.length) %
    POPULAR_VERSE_REFERENCES.length;
  return POPULAR_VERSE_REFERENCES[index];
}

export function shouldLoadDailyScriptureText({
  translationHasText,
  isBibleReady,
  allowInitialization,
}: {
  translationHasText: boolean;
  isBibleReady: boolean;
  allowInitialization: boolean;
}) {
  if (!translationHasText) {
    return false;
  }

  if (isBibleReady) {
    return true;
  }

  return allowInitialization;
}
