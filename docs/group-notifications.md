# Group session notifications

`send-group-notification` accepts POST requests from authenticated members of the requested group. Both ordinary members and leaders can notify the group after recording a session. OPTIONS handles CORS without accessing authentication or data; other methods return 405.

The function verifies the incoming bearer token with Supabase Auth and then queries membership using the verified user ID and requested group UUID. Invalid credentials return 401, nonmembers receive 403, and missing backend configuration returns 503. Authorization or recipient-query errors fail closed. No recipient identities or push tokens are read before membership succeeds.

The existing client payload remains supported:

- `group_id`: UUID of the group.
- `title`: nonblank string, at most 200 characters.
- `body`: nonblank string, at most 2,000 characters.
- `exclude_user_id`: accepted for client compatibility but ignored. Only the verified caller is excluded.

Localized title and body values are delivered unchanged. The function deduplicates nonblank recipient tokens and batches at most 100 messages per Expo request. `sent` counts successful Expo tickets, meaning accepted for delivery rather than confirmed device delivery. Rejected or missing tickets count toward `errors` even when Expo returns HTTP 200.

The endpoint does not verify a specific session record or provide per-session idempotency; authorized members retain the existing ability to supply notification text. Backend errors return a generic response rather than exposing database details.

Local verification executes the real handler with mocked authentication, database, and Expo boundaries, without sending notifications:

```bash
node --test --import tsx supabase/functions/send-group-notification/index.test.ts
deno check --no-config supabase/functions/send-group-notification/index.ts
```

These changes require a separate authorized Edge Function deployment to take effect remotely.
