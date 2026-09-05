# Admin data authorization

Dashboard layouts and child server components can execute in parallel. A layout redirect does not prevent a child component from starting its data reads. Every asynchronous reader in `apps/admin/lib/admin-data.ts` therefore authorizes at the data boundary, before creating its service-role client or accessing queries, RPCs, or signed storage URLs.

The shared helper awaits `requireAdminIdentity`, which requires an authenticated user with the trusted profile role `super_admin`. Authentication failure or a rejected role prevents the data loader from creating a privileged client. The existing identity resolver may read the authenticated user's own trusted profile to establish that role; this is separate from protected dashboard data reads.

The helper uses React `cache`, whose memoized values belong to the current server-render request. Concurrent and nested readers share that request's authorization and client. No identity or authorization promise is stored in a process-global cache. Outside a server-render cache context, including operator route calls, the helper still verifies identity before access rather than bypassing authorization. Pure formatting helpers remain callable without a user session.

This change is local to the admin data-access module. Shared service-client creation, cron jobs, and backend ingestion retain their existing authorization contracts. Query shapes, return values, feedback filters, and signed audio URL expiry remain unchanged.

Behavioral regressions execute the actual data module with identity, request-cache, and database/storage boundaries replaced. They cover every async export, denied callers, authorized results, audio signing, concurrent readers, and cache isolation between requests:

```bash
node --test --import tsx apps/admin/lib/admin-data-auth.test.ts
```

React cache semantics: [official React cache reference](https://react.dev/reference/react/cache).
