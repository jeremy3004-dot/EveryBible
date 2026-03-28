# Chapter Feedback Ops

## Source Of Truth

`public.chapter_feedback_submissions` in Supabase is the durable system of record.

Google Sheets is an operator-facing review sink. If Sheets is unavailable, feedback is still stored in Supabase and the row remains actionable through `export_status`.

## Required Secrets

Set these secrets for the `submit-chapter-feedback` Edge Function in Supabase:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The private key must be stored with escaped newlines exactly as Supabase expects. The function normalizes `\\n` into real line breaks at runtime.

## Spreadsheet Layout

- One tab per normalized `translationLanguage`
- Example tabs: `English`, `Spanish`, `Nepali`, `Hindi`
- Invalid sheet-name characters are stripped before tab creation

Header order is fixed and must remain:

1. `submission_id`
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

## Export States

- `pending`: saved in Supabase, export attempt not finished yet
- `exported`: saved in Supabase and appended to Google Sheets
- `failed`: saved in Supabase but Sheets append failed

## How To Find Failed Exports

Use SQL in Supabase:

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
  export_error
from public.chapter_feedback_submissions
where export_status = 'failed'
order by created_at asc;
```

## Manual Retry Workflow

This phase ships without an automated replay job. Use the manual recovery path below:

1. Query the failed rows from Supabase.
2. Open the tab that matches `translation_language`.
3. Append the missing row manually using the fixed header order above.
4. Double-check that `submission_id`, `book_id`, `chapter`, and `sentiment` in Sheets match the Supabase row.
5. Mark the row exported in Supabase after the append succeeds:

```sql
update public.chapter_feedback_submissions
set
  export_status = 'exported',
  exported_at = now(),
  export_error = null
where id = '<submission-id>';
```

If Sheets is still unavailable, leave the row as `failed`. Do not delete it.

## Support Expectations

- A reader-facing degraded success is expected when Supabase save succeeds but Sheets export fails.
- Support should reassure the user that the feedback was saved if the client reports a saved-but-not-exported result.
- Operators should use Supabase first when reconciling missing spreadsheet rows.

## Manual QA Checklist

1. Enable chapter feedback in Settings, submit thumbs up only, and confirm:
   - the chapter action appears in the reader
   - a new Supabase row is created
   - the row exports to the correct translation tab in Sheets
2. Submit thumbs down plus comment and confirm:
   - the comment persists in Supabase
   - the reviewer name, role, and id number persist in Supabase and Sheets
   - the same comment text appears in the spreadsheet row
3. Disable the feature in Settings and confirm the reader action disappears.
4. Remove or break one Sheets secret and confirm:
   - the client still reports a saved-but-not-exported success
   - Supabase records `export_status = 'failed'`
   - the row can be replayed manually with the workflow above
