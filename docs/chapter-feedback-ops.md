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

`participant_id_number` is not user-entered. The Edge Function fills it from the authenticated Supabase user UUID so reviewers only need to save their name and role in the app.

## How To Review Feedback

Use the admin backend feedback page, or query Supabase directly:

```sql
select
  id,
  created_at,
  translation_language,
  translation_id,
  book_id,
  chapter,
  sentiment,
  comment
from public.chapter_feedback_submissions
order by created_at desc;
```

## Support Expectations

- A successful submit means the row was saved in Supabase.
- Support should reassure the user that feedback is available for admin review when the client reports a saved result.
- Operators should use the admin backend first and Supabase SQL for deeper audits.

## Manual QA Checklist

1. Enable chapter feedback in Settings, submit thumbs up only, and confirm:
   - the chapter action appears in the reader
   - a new Supabase row is created
   - the row appears in the admin backend feedback page
2. Submit thumbs down plus comment and confirm:
   - the comment persists in Supabase
   - the reviewer name and role persist in Supabase and the admin backend
   - `participant_id_number` matches the authenticated Supabase user UUID
   - the same comment text appears in the admin backend row
3. Disable the feature in Settings and confirm the reader action disappears.
4. Confirm the feedback page filter finds rows by translation, book, reviewer, and comment.
