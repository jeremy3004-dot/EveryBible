# Scripture Share Background Gallery

## Decision

Scripture image-share pickers should offer both:

- the existing home verse background photos
- the bundled reading-plan cover artwork already shipped on-device

## Implementation

- Keep home verse backgrounds first so the default daily selection stays unchanged.
- Append the deduped reading-plan cover sources after them for the share gallery.
- Current consumer: the Bible reader verse-image share sheet.

## Guardrail

If plan-cover assets change, keep `src/data/shareVerseBackgrounds.ts` and
`src/data/shareVerseBackgroundsSource.test.ts` passing so bundled cover art remains
available for scripture image sharing.
