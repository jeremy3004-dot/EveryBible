# Group session notifications

`send-group-notification` tells the other members of a group that a session was recorded. It accepts POST requests from signed-in members. OPTIONS handles CORS without reading authentication or data. Other methods return 405.

The function checks the bearer token with Supabase Auth. It then claims the push through `public.claim_group_session_notification`, a database function that only the service role can call. It reads no recipient identities or push tokens until the claim succeeds. Invalid credentials return 401. Missing backend configuration returns 503. Claim or device-query errors fail closed, with a generic 500 that hides database details.

## Request

- `group_id`: UUID of the group.
- `session_id`: UUID of the `group_sessions` row the caller just recorded.

The function ignores any other field, including the old `title`, `body` and `exclude_user_id`. Callers cannot choose the text that other members receive. A request that sends text without a `session_id` gets a 400.

## What the claim checks

The claim runs in one transaction and locks the group:

| Check                                                                                                 | Result when it fails                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| The session exists, belongs to `group_id` and was made by the caller                                  | 403 (`not_found`)                     |
| The caller is still a member of the group                                                             | 403 (`forbidden`)                     |
| The session was recorded less than 15 minutes ago                                                     | 200, `sent: 0`, `reason: "stale"`     |
| This session, or the same lesson in this group, was not pushed in the last 12 hours                   | 200, `sent: 0`, `reason: "duplicate"` |
| The caller has sent fewer than 5 pushes in the last hour, and the group fewer than 10 in the last day | 429                                   |

The duplicate check means a group sends one push per meeting, even when several members record it. Claims live in `private.group_session_notifications`, which client roles cannot reach. Rows are pruned after two days.

## Message

The server writes the text. It uses the app's `notifications.groupSessionTitle` and `notifications.groupSessionBody` strings, copied into `supabase/functions/send-group-notification/messages.ts`. Each recipient gets the copy in their `user_preferences.language`, or English when no language is saved. The group name is the only text the group chooses. It is flattened to one line and capped at 80 characters. `messages.test.ts` fails if the copy drifts from `src/i18n/locales`.

The function removes duplicate and blank tokens, then sends at most 100 messages per Expo request. `sent` counts tickets that Expo accepted, which does not confirm delivery to a device. Rejected or missing tickets count as `errors`, even when Expo returns HTTP 200.

## App

`recordSyncedGroupSession` calls the function only after the session insert succeeds. It sends only `group_id` and `session_id`. A failed, refused or rate-limited push never fails the saved session.

## Verification

```bash
node --test --import tsx supabase/functions/send-group-notification/index.test.ts \
  supabase/functions/send-group-notification/messages.test.ts
deno check --no-config supabase/functions/send-group-notification/index.ts
PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-group-policies-sql.mjs
```

## Deploy order

1. Apply `supabase/migrations/20260924042319_group_create_rpc_join_throttle_and_push_claims.sql`.
2. Deploy `send-group-notification`. Until the migration is applied, every claim fails and the function returns 500 without sending.
3. Ship the app change. An older app sends `title`/`body` without `session_id` and gets a 400, which it ignores. On 2026-09-24 the function was not deployed, and no screen in the app records synced sessions, so no installed app depends on the old contract.
