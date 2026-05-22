---
status: resolved
trigger: "Signed-out audio chapter feedback was blocked by a sign-in requirement and then failed because production was missing the audio storage bucket."
created: 2026-05-22
updated: 2026-05-22
---

## Current Focus
- hypothesis: the mobile audio upload helper and Edge Function still assumed audio feedback must be authenticated even though chapter feedback is allowed anonymously.
- test: submit real signed-out audio feedback in a Release simulator build after deploying the Edge Function and applying the storage migration.
- expecting: signed-out audio feedback saves successfully and shows the normal feedback confirmation.
- next_action: complete

## Evidence
- timestamp: 2026-05-22
  observation: Signed-out simulator flow reached `Audio response ready`, then showed `Please sign in before sending an audio response.`
- timestamp: 2026-05-22
  observation: `uploadChapterFeedbackAudio` returned a sign-in error before reading/uploading the audio file when `getCurrentUserId()` returned null.
- timestamp: 2026-05-22
  observation: `submit-chapter-feedback` rejected any `audioResponse` without `userId`.
- timestamp: 2026-05-22
  observation: After the anonymous upload fix was deployed, the simulator hit the real backend path and showed `Bucket not found`; migration history showed `20260521120000_add_chapter_feedback_audio_responses.sql` had not been applied remotely.

## Eliminated
- hypothesis: the previous Expo FileSystem import fix was still failing
  reason: simulator logs and UI no longer showed the `getInfoAsync` deprecation error after the legacy import patch.

## Resolution
- root_cause: audio chapter feedback had two hidden authenticated-only assumptions: the mobile helper required a Supabase user before preparing upload metadata, and the Edge Function only accepted user-scoped storage paths. The production backend was also missing the private audio bucket migration.
- fix: signed-out mobile audio feedback now reads the M4A as base64 and sends it with feedback metadata. The Edge Function validates anonymous audio, uploads it to the private `chapter-feedback-audio` bucket with the service-role client under `anonymous/...`, and then saves the row with null user fields. Production migrations were pushed and the Edge Function was redeployed.
- verification: focused feedback tests; `npm run typecheck`; focused eslint; Release simulator build on iPhone 17 Pro Max Fresh; signed-out audio feedback recorded and submitted successfully with the confirmation dialog.
- files_changed: `src/services/feedback/chapterFeedbackAudio.ts`, `src/services/feedback/chapterFeedbackService.ts`, `supabase/functions/submit-chapter-feedback/index.ts`, `src/services/feedback/chapterFeedbackAudioSource.test.ts`, `src/services/feedback/chapterFeedbackFunctionSource.test.ts`, `src/services/feedback/chapterFeedbackBackendSource.test.ts`, `docs/chapter-feedback-ops.md`
