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

## Not fixed (lower priority, listed for follow-up)

| Screen / component                                     | Element                                                                        | Issue                                                           | Suggested fix                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| `home/HomeScreen`                                      | Streak unit label (`maxWidth: 54`, two lines)                                  | At about 2.0 "day streak" in longer languages needs three lines | Drop `maxWidth` at large text                       |
| `bible/BibleReaderScreen`                              | Listen-feedback identity pill (`maxWidth: 110`, one line)                      | "Name • Role" truncates early                                   | Two lines, or move the role to its own line         |
| `bible/BibleReaderScreen`                              | Theme tile labels, verse-image sheet reference (one line)                      | Truncate in long languages                                      | Two lines                                           |
| `learn/FoundationDetailScreen`                         | Header title (one line, 32pt controls)                                         | Truncates; check whether the hero repeats the full title        | Two lines if the hero does not show it              |
| `more/SettingsScreen`                                  | Font-size value (`minWidth: 58`, one line), "Available", language hint         | Short strings; long translations could truncate                 | Two lines                                           |
| `more/MoreScreen`                                      | Account name, email, sync label (one line)                                     | Truncate; the full values are on Profile                        | Keep, or allow two lines for the sync label         |
| `plans/PlansHomeScreen`                                | Soft chip, header eyebrow, session summary, day-of and completed-date eyebrows | One-line metadata                                               | Two lines where the value is not repeated elsewhere |
| `plans/PlanDetailScreen`                               | Compact header title, ledger day label                                         | One line (the full title is in the hero)                        | Keep                                                |
| `plans/RhythmDetailScreen`                             | Pill labels                                                                    | One line                                                        | Wrap the pill row                                   |
| `onboarding/LocaleSetupFlow`                           | Suggested-country subtitle                                                     | One line                                                        | Two lines                                           |
| `learn/PrayerWallScreen`                               | Header group name                                                              | One line                                                        | Two lines                                           |
| `learn/GroupSessionScreen`                             | Previous / Next footer row                                                     | Does not wrap; labels are short                                 | Stack with `useLargeText` if translations run long  |
| `more/ProfileScreen`                                   | Two-up stats grid                                                              | Labels wrap inside each half and stay readable at 2.0           | None needed yet                                     |
| `bible/CompanionCard`, `feedback/FeedbackResponseCard` | One-line meta                                                                  | Minor truncation                                                | Two lines                                           |
| `audio/PlaybackControls`, `audio/ReaderPlaybackDock`   | Fixed-size buttons                                                             | Icon-only, so text size does not apply                          | None                                                |

## Absolutely positioned elements over text

- Reader top chrome and bottom dock: the verse column is padded by the chrome's
  fixed size, so capping the pill labels (fix 18) keeps the padding correct.
  The dock is icon-only.
- Plan-session strip: grows upward from the bottom edge when needed (fix 17).
  When it hides, it fades to opacity 0, so a few extra points of height never
  show while it is hidden.
- `AudioReturnTab`: capped (see above).
- Not checked in this pass: the `AnnotationActionSheet` close button, which is
  absolutely positioned beside the sheet title.

## Device QA still needed

Check each fixed surface at iOS AX2/AX3 and Android 2.0 in English and German:
Home, Plans (all three tabs), Plan detail (Today card), the translation picker
and its manage sheet, Lesson detail, reader plan-session mode (strip and pill),
sign-in, and the Settings modals.
