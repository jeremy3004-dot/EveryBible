# Optimization candidate device checks

Applies to the isolated follow-up candidate101–113. These changes have not been published to TestFlight by this chat. Confirm a future installed build includes this candidate before attributing results to it. The separate release/recovery chat owns production and physical-phone data recovery.

## Highest-value checks

1. **Home during a download:** start a Bible audio download, return Home, and read the daily verse while progress changes. The verse should stay still and remain readable. When a downloaded chapter becomes available offline, Listen should become available without restarting. Repeat with borrowed Scripture and check its source label/font.
2. **Gather playback:** open a lesson, play its story, and scroll between Story and questions. Verse highlighting should advance, Pause should work, and Replay should play the current lesson. Change reading size/theme, then confirm both text and questions update. Share should use the current interface language.
3. **Translation picker:** change the language preference, search, and switch Bibles. The selection checkmark and results should update immediately, including while downloads run.
4. **Audio availability:** a text-only Bible should keep previous/next chapter navigation without offering an unusable Play button. An audio-enabled Bible should Play/Pause normally.
5. **Sleep/Pause:** set a timed sleep, leave the reader, and allow the timer to expire. Narration should remain stopped. Pause during loading, restore network access, and confirm playback waits for an explicit Play.
6. **Android metadata:** while playing, switch to discreet metadata or stop/reset playback. Old titles/artwork should not reappear later. This is Android-specific; race prevention also has controlled coroutine evidence.
7. **Prayer Wall, when enabled:** submit a prayer and type a new draft before completion; retain the new draft. Refresh while submitting and ensure the confirmed prayer appears once. Reopen a report form while an earlier report finishes; preserve the new form. A refresh must not undo confirmed edits/interactions/deletions.

## Evidence to record for a failure

Installed version/build, device/OS, exact steps, expected and actual result, network state, and a screenshot or recording. Use disposable test content. Preserve existing notes and account data; do not reinstall or clear storage to test this candidate.

## Current proof limits

Full repository gates and controlled render/coroutine tests are separate from installed-app proof. The task uses an isolated Android emulator with a local QA-signed APK and backend disabled. It does not establish physical iPhone behavior, live Prayer Wall/server state, real OS sleep suspension timing, or TestFlight distribution. See the adjacent continuation verification report for the latest installed build and completed checks.
