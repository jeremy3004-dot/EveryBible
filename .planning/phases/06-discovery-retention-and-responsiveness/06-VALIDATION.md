# Phase 6 Validation

## Automated Verification

### Targeted commands

```bash
node --test --import tsx \
  src/services/bible/referenceParser.test.ts \
  src/screens/bible/bibleSearchModel.test.ts \
  src/services/progress/readingActivity.test.ts
```

```bash
npx eslint \
  src/screens/bible/BibleBrowserScreen.tsx \
  src/screens/bible/ChapterSelectorScreen.tsx \
  src/screens/bible/bibleSearchModel.ts \
  src/services/bible/referenceParser.ts \
  src/screens/more/ProfileScreen.tsx \
  src/screens/more/ReadingActivityScreen.tsx \
  src/services/progress/readingActivity.ts \
  src/stores/progressStore.ts
```

### Broader release confidence

```bash
npm test
```

```bash
npm run release:verify
```

## Manual Verification

### Passage parsing

- Type `John 3:16`, `1 Cor 13`, and `Genesis 1` into the Bible search field and confirm the app opens the correct book/chapter with verse focus when available.
- Type plain-text search like `love one another` and confirm normal local search results still appear.
- Check a complex input such as `Luke 10:5-7, 10-11` and confirm the app opens the first valid verse/chapter instead of misrouting or crashing.

### FlashList migration

- Open chapter selection and confirm grid layout, tapping behavior, and scroll feel are unchanged.
- Run Bible search with enough results to scroll and confirm row rendering, highlighting, and navigation still match the prior experience.

### Reading activity calendar

- Mark reading activity on multiple dates, open the calendar from Profile, and confirm marked days, current streak, and selected-day summary all match stored progress.
- Validate behavior around local date boundaries so "today" and streak display are consistent with the calendar day shown to the user.
