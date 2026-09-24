# Large-text layout audit (2026-09-24)

Scope: every screen in `src/screens` and shared component in `src/components`
(plus the tab bar in `src/navigation/TabNavigator.tsx`), read for behaviour at
OS text scales up to about 2.0 (iOS AX2, Android 14's maximum) and at the app's
own reading-size setting (`FONT_SIZE_SCALES`, 0.85 to 1.2).

Method: code reading only. No simulator or device runs were done, so every
finding below is inferred from the layout code, and every fix still needs a
look on a device (see "Device QA" at the end).

## How the two scales combine

- The **OS scale** (`useWindowDimensions().fontScale`) applies to every `Text`
  unless `maxFontSizeMultiplier` caps it.
- The **app setting** only multiplies reading surfaces: reader verses, the Home
  verse hero (`getHomeScreenLayout`), and lesson body text. RN applies the OS
  scale on top, so a verse can reach 1.2 × 2.0 = 2.4× its base size. None of
  the chrome or layout rows audited here read the app setting, so the new
  large-text threshold uses the OS scale alone.

## Shared decision

`src/design/largeTextLayout.ts` (pure, unit-tested in `largeTextLayout.test.ts`)
holds the one threshold, `LARGE_TEXT_FONT_SCALE = 1.3`: Android's "Largest"
step, just under iOS xxxLarge (1.35). Every iOS accessibility size and Android
14's 1.5 to 2.0 steps are above it. `useLargeText()` (`src/hooks/useLargeText.ts`,
tested) exposes `{ fontScale, isLargeText, rowDirection }` and re-renders when
the user changes their text size. `AnnotationActionSheet` had its own copy of
the same 1.3 constant and now uses the shared hook.

## Fixed (top 20)

| #   | Screen / component            | Element                                              | Issue                                                                                                                | Fix                                                                                                                   |
| --- | ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `ui/AppButton`                | Label beside a leading/trailing icon                 | A `Text` in a row does not shrink by default, so a wrapped label ran past the pill instead of taking its second line | `flexShrink: 1`, centred text                                                                                         |
| 2   | `ui/SectionHeader`            | Title + eyebrow/action row                           | A two-line title took the whole row and pushed the action or eyebrow off the right edge                              | Title `flexShrink: 1`; trailing `flexShrink: 0`                                                                       |
| 3   | `ui/ListRow`                  | Trailing `value` (streak, native language name)      | The value kept its full width and squeezed the title column to a sliver                                              | At large text the value moves under the title, with no line limit                                                     |
| 4   | `ui/TabSwitch`                | Segment labels (full-width 3-up switches)            | `numberOfLines={1}` in a third of the row cut "Foundations" to "Found…"                                              | Two lines, centred, shrinkable; the thumb is inset top/bottom so it grows with the row                                |
| 5   | `bible/TranslationPickerList` | Row name and meta                                    | One line cut names to "Bible in O…", and the name is the only thing that tells rows apart                            | Two lines each (source test updated to match)                                                                         |
| 6   | `bible/TranslationPickerList` | Manage sheet title                                   | Same truncation in the per-Bible sheet header                                                                        | Two lines                                                                                                             |
| 7   | `home/HomeScreen`             | Continue + Plan cards side by side                   | Half-width cards left one word per line under the numeral                                                            | Stack vertically at large text (`useLargeText().rowDirection`)                                                        |
| 8   | `home/HomeScreen`             | Continue card book name and translation footer       | "1 Thessalonians" and long translation names truncated                                                               | Two lines                                                                                                             |
| 9   | `home/HomeScreen`             | Gather card header, title, next lesson               | Eyebrow and count shared one row; title and subtitle were one line                                                   | Header wraps; title and subtitle two lines                                                                            |
| 10  | `home/HomeScreen`             | Ledger header (streak + period switch), next-up line | The switch and streak competed for one row; next-up truncated                                                        | Header wraps; next-up two lines                                                                                       |
| 11  | `plans/PlansHomeScreen`       | My Plans card footer (percent + CTA)                 | CTA was unshrinkable and one line, so it ran past the card edge                                                      | Footer wraps; CTA shrinks and takes two lines                                                                         |
| 12  | `plans/PlansHomeScreen`       | Find Plans search strip                              | Fixed `height: 44` clipped the typed query                                                                           | `minHeight: 44`                                                                                                       |
| 13  | `plans/PlansHomeScreen`       | Daily-rhythm cards (two-up) and catalog meta         | About 150pt per title at large text; meta line truncated                                                             | Cards take the full row at large text; meta two lines                                                                 |
| 14  | `plans/PlanDetailScreen`      | Today card: references beside Read + Listen          | References squeezed to a word per line; subtitle one line                                                            | Actions drop under the references at large text; subtitle two lines                                                   |
| 15  | `learn/LessonDetailScreen`    | Complete toggle                                      | Fixed 40pt `height` with a one-line label clipped "Completed" in longer languages                                    | `minHeight`, vertical padding, two-line shrinkable label                                                              |
| 16  | `learn/LessonDetailScreen`    | "Story · reference" eyebrow                          | The passage reference, shown nowhere else, was cut off                                                               | Two lines                                                                                                             |
| 17  | `bible/BibleReaderScreen`     | Plan-session strip (replaces the tab bar)            | Fixed height = tab-bar footprint; title plus meta overflowed it at large text                                        | `minHeight` plus a 1.3 cap on the strip's two labels (chrome)                                                         |
| 18  | `bible/BibleReaderScreen`     | Floating reference pill (book/chapter, translation)  | 44pt pill over the verses; uncapped labels clipped, and the verse column's top padding assumes the pill's fixed size | 1.4 cap on both labels. Each control opens a picker that names the full reference, and VoiceOver reads the full label |
| 19  | `auth/AuthScreen`             | Email and password fields                            | Fixed 48pt `height` clipped typed text                                                                               | `minHeight`                                                                                                           |
| 20  | `more/SettingsScreen`         | Cancel/Save pairs in 5 modals                        | Each half of a ~300pt modal wrapped its label                                                                        | Stack at large text, `column-reverse` so Cancel stays at the bottom like system alerts                                |

Smaller fixes made at the same time:

- `learn/GatherScreen`: the path numeral was a fixed `width: 34`, so "10" broke onto two lines at large sizes. It is now `minWidth`.
- `bible/ChapterFeedbackReviewScreen` title, `gather/LessonBottomSheet` reference and `feedback/FeedbackFocusedReview` header label now allow two lines.
- `learn/PrayerWallScreen`: the action pills row now wraps.

## Kept on purpose (capped chrome)

| Element                                 | Cap            | Why it stays                                                                                             |
| --------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| Tab bar labels (`TabNavigator`)         | 1.6, one line  | Fixed 64pt capsule shared by every screen's bottom clearance; icon + label measure about 47pt at the cap |
| `AppButton` label                       | 1.6, two lines | CTA would otherwise fill the screen; the pill grows (`minHeight`)                                        |
| Google sign-in label (`AuthScreen`)     | 1.6            | Same reason as `AppButton`                                                                               |
| Chapter tiles (`BibleBrowserScreen`)    | 1.6            | Tiles widen with the scale up to the same cap (`chapterTileLayout`)                                      |
| `AudioReturnTab`                        | 1.5, one line  | A rotated tab pinned by its 30pt thickness; its accessibility label carries the full reference           |
| Plan cover eyebrow (`PlanDetailScreen`) | 1.4, one line  | Sits over a photo inside a fixed 360pt hero, above a two-line title                                      |
| Reader font preview specimen            | 1.4            | A preview sample in a fixed card, not content                                                            |

## Follow-up pass (same day): lower-priority items and new screens

Everything the first pass listed as not fixed, plus the screens added the same
day, was worked through. Render tests now set the OS scale with
`harness.setFontScale(n)` (`src/testing/render.tsx`), so each stacking or
wrapping change below is asserted at 2.0, and at the default size where the
layout differs.

| Screen / component                                       | Element                                                                        | Status | What changed                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home/HomeScreen`                                        | Streak unit label (`maxWidth: 54`, two lines)                                  | Fixed  | At large text the 54pt cap and the line limit drop                                                                                                   |
| `bible/BibleReaderScreen`                                | Listen-feedback identity pill (`maxWidth: 110`, one line)                      | Fixed  | At large text the pill moves under the heading, drops the cap and takes two lines                                                                    |
| `bible/BibleReaderScreen`                                | Theme tile labels, verse-image sheet reference                                 | Fixed  | Two lines                                                                                                                                            |
| `learn/FoundationDetailScreen`                           | Header title (one line, 32pt controls)                                         | Kept   | The hero directly below repeats the full title with no line limit                                                                                    |
| `more/SettingsScreen`                                    | Font-size stepper, "Available" status, language hint                           | Fixed  | New `ListRow` prop `stackTrailingAtLargeText` moves the stepper and the status under the row title; the size name and language hint take two lines   |
| `more/MoreScreen`                                        | Account name, email, sync label                                                | Fixed  | Sync label two lines (shown nowhere else); name and email stay one line because Profile shows them in full                                           |
| `plans/PlansHomeScreen`                                  | Soft chip, header eyebrow, session summary, day-of and completed-date eyebrows | Fixed  | Two lines each; at large text the Enrolled/Completed chip and the Start button move under the row title in Find plans and Completed                  |
| `plans/PlanDetailScreen`                                 | Compact header title, ledger day label                                         | Kept   | The full title is in the hero                                                                                                                        |
| `plans/RhythmDetailScreen`                               | Pill labels, sequence-card status pill                                         | Fixed  | Pill labels two lines and shrinkable (the meta row already wraps); at large text the Next/Completed pill moves under the card title                  |
| `onboarding/LocaleSetupFlow`                             | Suggested-country subtitle and chip; Bible and language row chips              | Fixed  | Subtitle two lines; at large text every status chip (Suggested, Recommended, Download/Continue) moves under the row copy; the chevron or radio stays |
| `onboarding/LocaleSetupFlow` (new)                       | Download queue rows (queued and downloading)                                   | OK     | A queued or downloading row swaps its chip for a spinner or a 72pt progress bar, so only a narrow indicator sits beside the wrapping copy            |
| `learn/PrayerWallScreen`                                 | Header group name                                                              | Fixed  | Two lines, centred                                                                                                                                   |
| `learn/PrayerReportSheet` (new)                          | Reasons, note and Send inside the shared `Sheet`                               | Fixed  | At 2.0 five wrapped reasons, the note and Send outgrew the screen; now covered by the shared `Sheet` cap below (its own 60% scroll view is gone)     |
| `learn/GroupSessionScreen`                               | Previous / Next footer row                                                     | Fixed  | Stacks at large text (`column-reverse`, Next on top); the lesson is padded by the footer's measured height instead of a fixed 140pt                  |
| `auth/ResetPasswordScreen` (new)                         | Fields and buttons                                                             | OK     | Inputs and buttons size by padding, not fixed heights, and every label wraps                                                                         |
| `more/SettingsScreen` blocked-notifications notice (new) | Notice text and Open Settings button                                           | OK     | The text is `flex: 1` beside an 18pt icon and the button sits on its own line                                                                        |
| `bible/TranslatorReviewQueueScreen` (new)                | Header title between Back and a spacer                                         | Fixed  | The title shrinks, wraps and centres instead of pushing the spacer off the row                                                                       |
| `components/ErrorBoundary` fallback (new)                | Icon, message, Try again and Back in a centred column                          | Fixed  | Scrolls (still centred when it fits); the Try again label shrinks beside its icon                                                                    |
| `annotations/AnnotationActionSheet`                      | Title under the absolutely positioned close button                             | Fixed  | The title is inset by the button's width on both sides, so a wrapped title stays clear of it                                                         |
| `bible/CompanionCard`, `feedback/FeedbackResponseCard`   | One-line meta                                                                  | Fixed  | Two lines; the feedback verdict row wraps so the source label can drop under the verdict; the companion action label shrinks                         |
| `more/ProfileScreen`                                     | Two-up stats grid                                                              | Kept   | Labels wrap inside each half and stay readable at 2.0                                                                                                |
| `audio/PlaybackControls`, `audio/ReaderPlaybackDock`     | Fixed-size buttons                                                             | Kept   | Icon-only, so text size does not apply                                                                                                               |

### Shared `ui/Sheet` height cap (same day)

`ui/Sheet` now bounds itself: the surface's `maxHeight` is 90% of the window
below the top safe-area inset, and everything under the handle and title sits
in a `ScrollView` (`keyboardShouldPersistTaps="handled"`, so Send or Save
presses with the keyboard up). The keyboard avoider now fills the modal below
the status bar and the sheet has `flexShrink: 1`, so with the keyboard up the
sheet shrinks and scrolls instead of pushing its title off the top; the avoider's
bottom edge is unchanged, so the keyboard-overlap maths is the same as before.
A caller that sets its own `height` through `contentStyle` gets neither the cap
nor the scroll view. Every current `Sheet` user (prayer report, lesson actions
sheet, lesson playback-and-text sheet, feedback source filter, feedback resolve
sheet) takes the default. Render tests at 2.0: `primitives.render.test.tsx`
(cap, scroll, avoider, own-height opt-out), `PrayerReportSheet`, the feedback
resolve sheet (`ChapterFeedbackReviewScreen`, reason field + Save) and the lesson
playback sheet (`LessonDetailScreen`).

Not on `Sheet`, so not covered by the cap: the reader's verse actions sheet
(`annotations/AnnotationActionSheet`, an in-screen overlay; its note mode with
the keyboard up is the likeliest to overflow on a small phone), the audio speed,
sleep-timer and music dialogs (`audio/PlaybackControls`, centred modals; the
music list with descriptions is the tallest), and the translation picker and
Bible browser modals, which set their own `82%` / `60%` heights.

## Absolutely positioned elements over text

- Reader top chrome and bottom dock: the verse column is padded by the chrome's
  fixed size, so capping the pill labels (fix 18) keeps the padding correct.
  The dock is icon-only.
- Plan-session strip: grows upward from the bottom edge when needed (fix 17).
  When it hides, it fades to opacity 0, so a few extra points of height never
  show while it is hidden.
- `AudioReturnTab`: capped (see above).
- `AnnotationActionSheet` close button: the title is now inset past it
  (follow-up pass).
- `GroupSessionScreen` footer: floats over the lesson, which is now padded by
  the footer's measured height (follow-up pass).

## Device QA still needed

Check each fixed surface at iOS AX2/AX3 and Android 2.0 in English and German:
Home, Plans (all three tabs), Plan detail (Today card), the translation picker
and its manage sheet, Lesson detail, reader plan-session mode (strip and pill),
sign-in, and the Settings modals.

From the follow-up pass: the Settings font-size and offline rows, the
onboarding Bible, language and suggested-nation rows (including a queued
download), the Rhythm detail sequence cards, the group session footer over a
long lesson, the prayer report sheet with the keyboard up, the reader's
listen-feedback composer, the translator queue header, the error fallback, and
the verse actions sheet title.

From the `Sheet` cap: each `Sheet` at AX3 on a small phone (iPhone SE) with and
without the keyboard (feedback resolve reason, prayer report note), on iOS and
Android, checking the title stays on screen and the last button scrolls into
reach.
