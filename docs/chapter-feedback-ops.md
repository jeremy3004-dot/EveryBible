# Chapter Feedback Ops

## Source Of Truth

`public.chapter_feedback_submissions` in Supabase is the durable system of record and the admin backend review source.

The old Google Sheets export path is retired. Operators review new submissions in the admin app at `/feedback`.

## Admin Review Fields

The admin backend shows the fixed submission contract:

1. `id`
2. `created_at`
3. `translation_language`
4. `translation_id`
5. `book_id`
6. `chapter`
7. `sentiment`
8. `comment`
9. `participant_name`
10. `participant_role`
11. `participant_id_number`
12. `interface_language`
13. `content_language_code`
14. `content_language_name`
15. `source_screen`
16. `app_platform`
17. `app_version`
18. `user_id`
19. `audio_response_bucket`
20. `audio_response_path`
21. `audio_response_mime_type`
22. `audio_response_size_bytes`
23. `audio_response_duration_ms`
24. `audio_response_created_at`
25. `scripture_council_fixed_at`
26. `scripture_council_fixed_by`
27. `scripture_council_fixed_note`

`participant_id_number` is not user-entered. When the app has an authenticated Supabase session, the Edge Function fills `user_id` and `participant_id_number` from that user UUID. Anonymous submissions are allowed and store those fields as `null`; reviewer name and role are also optional.

Audio-message responses are stored in the private Supabase Storage bucket `chapter-feedback-audio`. The mobile app accepts M4A audio (`audio/mp4`) with a 2 minute and 5 MB limit. Authenticated submissions upload to a user-scoped path (`{user_id}/...`) before submitting the feedback row. Anonymous submissions send the encoded recording to the Edge Function, which uploads it with the service-role client under an `anonymous/...` path before saving the row. The admin backend creates short-lived signed playback URLs so reviewers can listen from `/feedback` without using the mobile app.

## How To Review Feedback

Use the admin backend feedback page at `/feedback`, or query Supabase directly.

Translator reviewers can also use the hidden mobile review mode for chapter-level checks:

1. Open Settings.
2. Tap `Translator Access` directly below `Chapter Feedback`.
3. Enter the translator passcode.
4. Open a chapter to review that chapter's submitted feedback, including text, sentiment, submitter identity when available, and signed audio playback.

The mobile review mode stores the unlock flag and read/listened markers locally on the device. It does not sync reviewer state across devices. The feedback rows and private audio URLs still come from Supabase through the `review-chapter-feedback` Edge Function.

The admin page is organized for review by:

- language
- translation
- book
- chapter
- sentiment
- response type, including audio-only submissions
- Scripture Council fix status

The coverage table summarizes the recent feedback volume by language, including how many books,
chapters, and audio responses are represented. Click a language in that table to jump into the
filtered review list.

The feedback-by-translation table highlights open Scripture Council fixes for thumbs-down feedback.
When a translator has applied the requested fix, an admin can mark the feedback fixed from `/feedback`.
That writes `scripture_council_fixed_at`, `scripture_council_fixed_by`, and an optional
`scripture_council_fixed_note` on the original feedback row so the backend shows when the fix was
completed and who recorded it.

```sql
select
  id,
  created_at,
  translation_language,
  translation_id,
  book_id,
  chapter,
  sentiment,
  comment,
  scripture_council_fixed_at,
  scripture_council_fixed_by,
  audio_response_path,
  audio_response_duration_ms
from public.chapter_feedback_submissions
order by created_at desc;
```

## Support Expectations

- A successful submit means the row was saved in Supabase.
- Support should reassure the user that feedback is available for admin review when the client reports a saved result.
- Operators should use the admin backend first and Supabase SQL for deeper audits.

## Manual QA Checklist

1. Enable chapter feedback in Settings, submit thumbs up while signed out, and confirm:
   - the chapter action appears in the reader
   - a new Supabase row is created
   - `user_id` and `participant_id_number` are `null`
   - the row appears in the admin backend feedback page
2. Submit thumbs down plus comment with reviewer name and role saved and confirm:
   - the comment persists in Supabase
   - the reviewer name and role persist in Supabase and the admin backend
   - `participant_id_number` matches the authenticated Supabase user UUID when signed in, or remains `null` when signed out
   - the same comment text appears in the admin backend row
3. Disable the feature in Settings and confirm the reader action disappears.
4. Confirm the feedback page filters find rows by language, translation, book, chapter, reviewer,
   comment, sentiment, and audio/text response type.
5. While signed out, record an audio-only response and confirm:
   - microphone permission prompts gracefully
   - stop, preview, re-record, and submit all work
   - upload failure leaves the recording available to retry
   - the Supabase row includes audio bucket/path/duration/mime/created metadata
   - `user_id` and `participant_id_number` remain `null`
   - the audio path starts with `anonymous/`
   - the admin backend `/feedback` row plays the audio in the browser
6. While signed in, record an audio-only response and confirm:
   - upload failure leaves the recording available to retry
   - the Supabase row includes audio bucket/path/duration/mime/created metadata
   - `participant_id_number` matches the authenticated Supabase user UUID
   - the admin backend `/feedback` row plays the audio in the browser
7. Deny microphone permission and confirm typed feedback can still be submitted.
8. From `/feedback`, filter to `Open council fixes`, mark a thumbs-down feedback item fixed, and confirm:
   - the row shows `Fixed` with a timestamp
   - the feedback-by-translation table moves that item out of open council fixes
   - `scripture_council_fixed_at` and `scripture_council_fixed_by` are saved in Supabase
