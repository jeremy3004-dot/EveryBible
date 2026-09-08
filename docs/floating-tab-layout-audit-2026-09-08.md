# Floating tab layout audit — 2026-09-08

## Cause and shared fix

The root tab bar uses absolute positioning: its footprint includes a 60-point capsule plus the gap below it. Most child screens only reserved a normal content gutter or the device safe area. Neither clears the floating bar. Extra scroll padding also cannot protect a fixed footer.

Every native stack under the five root tabs now uses `renderTabScreenLayout`. The wrapper reserves the complete `useTabBarHeight()` footprint with an outer bottom margin. This reduces the actual screen bounds, so scroll views, lists, loading/error states and absolute footers all end above the capsule. Newly added stack screens inherit this behavior without needing to remember a padding formula.

`getTabScreenBottomInset` shares the existing hidden-tab predicate. Modal presentations and hidden-tab screens keep their full viewport. Home, Settings and the Bible reader explicitly own their clearance because they draw under the capsule. Home now uses the complete floating footprint instead of React Navigation's bar-only height. The locale flow no longer needs its own tab-bar padding. Plans Home no longer adds a second bar-sized content spacer.

## Route inventory

All 29 routes registered in the five root tab stacks were reviewed in source. “Shared” means the navigation wrapper now protects all content states on that route; this is not a claim that every account-dependent state was populated on a device.

| Stack | Route | Finding / treatment |
| --- | --- | --- |
| Home | HomeScreen | Existing scroll clearance used bar-only height; corrected to full footprint. |
| Bible | BibleBrowser | Book and search result lists lacked tab clearance; shared. |
| Bible | BiblePicker | Native modal with hidden tabs; no shared inset. |
| Bible | ChapterSelector | Chapter list ended with a regular gutter; shared. |
| Bible | BibleReader | Existing stable content padding and animated dock account for tabs; retained. Plan sessions hide tabs. |
| Bible | TranslatorQueue | Review list ended with a regular gutter; shared. |
| Gather | GatherHome | Both scroll panels lacked full clearance; shared. |
| Gather | FoundationDetail | Lessons / final next-foundation action used fixed content padding; shared. |
| Gather | LessonDetail | Tabs intentionally hidden; retained full viewport and existing lesson dock. |
| Gather | PrayerWall | Prayer list and empty states lacked full clearance; shared. |
| Gather | GroupList | Final group / create and join content lacked clearance; shared. |
| Gather | GroupDetail | Bottom group management content lacked clearance; shared. |
| Gather | GroupSession | Absolute phase-navigation / completion footer occupied the tab region; shared screen bounds now lift it. |
| Plans | PlansHome | Hardcoded bar spacer replaced by shared screen bounds plus ordinary content gutter. |
| Plans | PlanDetail | Tabs intentionally hidden; retained full viewport. |
| Plans | RhythmDetail | Bottom controls used only safe-area clearance; shared. |
| Plans | RhythmComposer | Save action used only safe-area clearance; shared. |
| More | MoreScreen | Final rows / footer lacked full clearance; shared. |
| More | Settings | Existing full-footprint scroll padding retained. |
| More | LocalePreferences | Nation and language lists plus Continue/Finish protected by shared bounds; first-run onboarding remains outside tab navigation. |
| More | PrivacyPreferences | Form content lacked tab clearance; shared. |
| More | Profile | Final profile/account actions lacked clearance; shared. |
| More | ReadingActivity | Final activity content lacked clearance; shared. |
| More | Annotations | Final annotation row lacked full clearance; shared. |
| More | MyFeedback | Final feedback row lacked full clearance; shared. |
| More | TranslationBrowser | Both translation list and nested language list lacked clearance; shared. |
| More | About | Final links used a regular gutter; shared. |
| More | Diagnostics | Bottom Share/Clear action bar lacked clearance; shared. |
| More | Auth | Native modal; auth and password-reset screens retain their own safe-area/keyboard handling. |

Native React Native modals (including Settings' interface-language picker and the Bible translation sheet) render above the tab navigator. They retain their existing modal bounds. The narrow audio-return edge tab is separate from the bottom capsule; the reader's audio dock keeps its existing geometry.

## Regression coverage

- Every root tab stack must install the shared layout, including stacks discovered from TabNavigator imports.
- All 22 ordinary routes reserve the complete supplied footprint; unknown future routes are protected by default.
- Hidden-tab route parameters, native modal presentations and the three explicitly managed screens avoid duplicate clearance.
- The wrapper must reduce screen bounds (margin), not merely pad scroll content; this protects absolute footers as well as lists.
- Locale first-run safe-area behavior is retained, and Home must use the shared footprint measurement.

## Validation

- Final workspace tests: 1,968 passed, zero failures/skips.
- Mobile lint and typecheck passed after correcting the new test's Node URL typing.
- Current checkout exported successfully as an iOS production JavaScript bundle for simulator verification, using an isolated copy of the existing compatible native simulator shell (build 422). This is not an App Store/TestFlight build.
- Simulator: iPhone 17, iOS 26.5, 402 × 874 points. Separate audit app identity and simulator; existing user app was not replaced.
- No Android device/emulator was connected during the availability check; Android geometry is covered by the shared model tests, but Android visual verification remains a device gate.

## Runtime observations

- Nation selection: Continue fully visible above the capsule and successfully advances to the language step. After filtering by `z`, scrolling dismissed the keyboard and exposed the complete final Zimbabwe row above the footer; that row was tapped.
- Language selection: Back and Finish fully visible above the capsule; Finish successfully returns to Settings.
- Translation browser: translation list and nested bundled-language picker exercised. The remote catalog was not available in the isolated shell; full remote-language/Yoy coverage is pending.
- Gather: scrolled to the final “Sharing the Good News” card, verified it clears the tabs, and opened it.
- Foundation detail: scrolled to the final “All nations will praise God” lesson; the complete card clears the capsule.
- Profile: final “Sign In or Create Account” button fully visible above tabs in the guest state.
- Reading Activity: final Selected Day panel visible above tabs after scrolling.
- Notes & Highlights: guest empty state displayed within the protected viewport; populated account data not seeded.
- About: final resource links and footer visible after scrolling.
- Settings: bottom Clear Cache row visible above tabs; no cache was cleared.
- Diagnostics: empty state verified; Share/Clear footer conditional on recorded entries was source-reviewed, not populated artificially.
- Plans Home: empty-state action visible and tabs accessible. Rhythm routes and group/prayer routes have source/model coverage but were not reached through the current guest UI.
- Bible reader and native Bible picker: exercised the existing reader dock and full-screen picker; tab navigation restored on return to More.

The audit also found the locale search keyboard remaining over the footer while scrolling. `keyboardDismissMode="on-drag"` now dismisses it when the user scrolls, matching the translation picker. A failing-first regression test covers this behavior, and it passed on the updated simulator bundle.

Several simulator accessibility targets returned stale coordinates after scrolling. Screenshots were used to confirm the visible target before coordinate fallback; failed/no-op presses were not counted as successful verification.

Automatic approval review rejected injecting private `.env` API configuration into the audit shell for remote-catalog loading. No workaround was used after that rejection. User approval is required to complete that configuration-dependent check. Android runtime verification and populated authenticated states also remain device gates.

Audit session closed and its dedicated simulator shut down. The temporary audit app installed on the other simulator was removed; the user app and the other task session were preserved. Selected screenshots were saved in this task’s `layout-audit` artifacts folder. The isolated audit build remains available for the pending approved catalog check.
