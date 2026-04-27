# Reader Text Layout Spec

## Goal

Make scripture feel easier to read by default, especially in premium read mode, by moving closer to a restrained paragraph Bible layout:

- narrower readable text measure
- calmer leading
- quieter verse numbers
- real paragraph flow instead of verse-per-line blocks
- softer spacing around section headings

## Research defaults we are adopting

- Mobile scripture body should stay in a narrow single column.
- Side margins should remain in the `20-24px` range.
- Prose leading should land around `1.45-1.55`.
- Verse numbers should stay visible but visually recessive.
- Paragraph flow matters more than decorative styling.

## Current audit

### What is already good

- `src/screens/bible/BibleReaderScreen.tsx` already uses a centered single-column shell.
- `src/screens/bible/BibleReaderScreen.tsx` already uses generous horizontal padding in premium mode.
- `src/screens/bible/bibleReaderModel.ts` already computes reader leading from font size instead of trusting the overly loose shared token directly.

### What is hurting readability now

- `src/screens/bible/BibleReaderScreen.tsx` renders each verse as its own block-level `Pressable`, so prose reads like stacked verse lines instead of a paragraph edition.
- `src/design/system.ts` still defines `typography.readingBody` as `18/38`, which is much looser than the research target and leaks into lesson scripture surfaces.
- `src/screens/bible/BibleReaderScreen.tsx` keeps section-heading spacing very tight, which weakens visual grouping.
- `src/screens/bible/BibleReaderScreen.tsx` keeps verse numbers fairly assertive because they share the same line box and strong weight treatment.
- The current data model only exposes `verse.text` plus optional `heading`; it does not expose true poetry indentation or paragraph-break metadata.

## Implementation decisions

### Phase 1: ship now

- Keep the premium reader single-column layout.
- Tighten shared reading typography to a calmer default for reading surfaces.
- Tighten computed reader leading slightly to sit in the research band.
- Render premium prose as inline paragraph text with nested verse spans so verses wrap naturally inside the same paragraph.
- Keep verse selection and note/highlight affordances per verse by attaching `onPress` to inline spans.
- Quiet verse numbers through smaller sizing and opacity, not by removing them.
- Increase heading-to-paragraph spacing modestly so sections breathe.

### Deferred until the data model improves

- True prose paragraph indents.
- True poetry indentation.
- Hanging continuation indents for wrapped poetic lines.
- Distinct typography rules per genre.

Those need source metadata beyond `heading`.

## Exact defaults for this pass

- `typography.readingBody`: `18/28`
- reader verse leading multiplier: `1.56`
- premium reader shell max width: `560`
- premium reader horizontal padding: keep `24`
- premium section heading spacing: larger than today, but still restrained
- premium verse numbers: smaller and visually muted

## Files in scope

- `src/design/system.ts`
- `src/screens/bible/bibleReaderModel.ts`
- `src/screens/bible/BibleReaderScreen.tsx`
- `src/screens/bible/bibleReaderModel.test.ts`
- `src/screens/bible/bibleReaderChromeSource.test.ts`

## Explicit non-goals for this pass

- no translation data migration
- no redesign of listen mode
- no changes to the plan read-mode floating playback dock behavior
- no poetry-specific indentation heuristics fabricated from verse numbers alone
