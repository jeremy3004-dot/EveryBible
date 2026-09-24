# Screen-reader pass, 2026-09-24

Scope: every `src/**/*.tsx` changed since 2026-09-22 (`git log --since=2026-09-22`,
55 files, base `63ba5cf9`). I read each diff and checked every interactive element
for role, label, state, hint, value, grouping, headings, focus order, async
announcements and hidden decoration. This was a code review only. Nothing was run
under VoiceOver or TalkBack; see "Device QA" below.

Background that shaped the fixes:

- A pressable element that sets `accessibilityLabel` replaces all the text inside
  it, so anything the row shows but the label leaves out is lost. On iOS, buttons
  nested inside an accessible element can't be reached either.
- `accessibilityLiveRegion` and `accessibilityRole="alert"` only work on Android.
  VoiceOver needs `announceForAccessibility` (`src/utils/a11y.ts`).
- `Pressable`/`TouchableOpacity` already merge `disabled` into
  `accessibilityState`, and `AppButton` already sets `busy` while loading.

## Fixed

| Area                         | Problem                                                                                                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prayer Wall (known bug)      | The prayed/encouraged state was never announced. The pills show it only by fill and icon, and the card label (one VoiceOver stop) left it out, so tapping again to withdraw sounded the same as tapping to pray. Toggles and rollbacks were silent.                                                      | The card label says "You prayed for this" / "You encouraged this" (`prayerCardAccessibility.ts`). The pills get `accessibilityState.selected`. Each toggle announces the state it ends in, and a failed write announces an error.   |
| Plan detail day rows         | The Today card's label dropped its target line ("Today's target: 1/3 chapters") and never said when the day was finished. Session pills showed "done" only by fill.                                                                                                                                      | `planDayRowAccessibility.ts` builds the label and value for both row kinds. Finished session pills carry a Completed value.                                                                                                         |
| Onboarding lists             | Row labels were the title only, so the subtitle (English name, availability, download %), the RECOMMENDED/DOWNLOAD/SUGGESTED chip and the radio selection were all lost. Downloading rows weren't marked busy.                                                                                           | `localeOptionRowAccessibility.ts` builds label, `selected`/`busy` state and a 0–100 value. `AppCard` gains an `accessibilityState` prop for the suggested-nation card.                                                              |
| Feedback response card       | The open card's label was only the comment, which dropped the verdict, source, sender, date and voice note. Listen and Mark reviewed were unreachable inside it. **Settled cards** passed a label too, so `AppCard` turned them into one element and swallowed the Listen and Reopen buttons completely. | `feedbackResponseAccessibility.ts` builds the full label and adds custom actions. Settled cards have no label, so their buttons can be reached.                                                                                     |
| Focused review / review list | The page swapped with no sound after a decision. The failure text used `role="alert"`, which iOS ignores. The finished state wasn't a heading. List decisions and the bulk "mark reviewed" were silent.                                                                                                  | Announces the new position, "All current feedback reviewed" and errors. Header roles added, and the duplicate progress bar is hidden. List decisions announce the outcome (Reviewed / Addressed / No change needed / Needs review). |
| Error boundary fallback      | The screen changed silently. The title wasn't a heading and the 64pt icon was exposed.                                                                                                                                                                                                                   | Announces the title and message on mount, adds a header role and hides the icon.                                                                                                                                                    |
| Translator access notices    | The "needs download" error (Android live region only) was silent on iOS. The Settings passcode and identity errors had the same problem.                                                                                                                                                                 | Both are now announced.                                                                                                                                                                                                             |
| Reader                       | The listen-mode plan bar arrows were labelled "Previous" / "Next". The arrows changed chapter silently (a read-mode swipe does announce). Highlight add/remove and note save were silent.                                                                                                                | Labels are now "Previous chapter" / "Next chapter". The target reference is announced, and so are "Highlight added" / "Highlight removed" / "Saved".                                                                                |
| Bible search                 | Results (including zero results) arrived silently while focus stayed in the field. Search errors used an Android-only live region.                                                                                                                                                                       | Announces "Results: N" and the error text.                                                                                                                                                                                          |
| Learn / Gather               | Passage block headings, including the only mention of a fallback (borrowed) translation, weren't headings. Group session Next/Previous changed phase silently.                                                                                                                                           | Header role on block headings. The phase title is announced, and the phase tabs are a `tablist`.                                                                                                                                    |
| Chapter feedback summary     | The title wasn't a heading.                                                                                                                                                                                                                                                                              | Header role.                                                                                                                                                                                                                        |

New strings are in all 21 locales, under `interface.*`: `prayerYouPrayed`,
`prayerYouEncouraged`, `prayerPrayedRemoved`, `prayerEncouragedRemoved`,
`highlightAdded`, `highlightRemoved` and `searchResultCount`. Each locale reuses the
terms it already uses for prayer and highlights, in its existing register (du / tú /
vous / 你).

## Checked, already fine

- Audio clip handles: adjustable, labelled, time value, and ±5 s swipe actions.
- Skip ±10 s, sleep timer and speed buttons: labelled, with values. The three
  playback modals are `accessibilityViewIsModal`, have escape handling, and are no
  longer wrapped by an accessible backdrop.
- Plan dot heatmap: hidden. The progress tally is one grouped stop ("Day 1 of 365,
  Completed, 0 of 365 days").
- Annotation action pills: role button, text label, disabled state from `Pressable`.
  Colour swatches: selected and disabled.
- Settings Clear cache / Delete account: `ListRow` buttons, confirmation alerts
  (which screen readers speak), and a busy Delete button.
- Translator queue cards: counts are the value. Book rows: expanded state. Chapter
  tiles: roles.
- Lesson audio rule: adjustable with a time value.

## Not fixed (deferred)

- Fixed in a follow-up the same day: sleep-timer options now carry the selected
  state (from `audioStore.sleepTimerMinutes`, counted only while a countdown
  exists), Prayer Wall delete and mark-answered are announced, and onboarding
  search announces "Results: N" once typing pauses
  (`countLocaleSetupSearchMatches`). Focus after a Prayer Wall delete still moves
  with the removed card; check that on a device.
- The translator passcode field (`secureTextEntry`, not editable) relies on the
  platform to read the digit count.
- The locale files were already not Prettier-formatted on `main` (`tr.ts` and others
  fail `prettier --check` at HEAD). New lines follow each file's existing style, and
  I did not reformat whole locale files.

## Device QA still needed

Check these under VoiceOver and TalkBack:

- The Prayer Wall card, its custom actions and the toggle announcements.
- Custom actions on plan day rows and on feedback cards.
- Onboarding radio rows and the downloading row.
- The chapter announcement when the plan bar arrows are used while audio is playing.
- The search count announcement when typing quickly (announcements can interrupt
  each other).
- The error-boundary announcement arriving together with the screen change.
