# ADR-001: Workflow Plane

## Decision

Use Trigger.dev as the primary workflow plane. Keep Graphile Worker as the fallback if Trigger.dev deployment or operating constraints become unacceptable.

## Rationale

EveryBible already runs as Vercel apps, Supabase Edge Functions, Cloudflare Workers, and local scripts. There is no always-on Node worker host or direct Postgres queue runtime in the repo. Trigger.dev fits the current shape better than introducing persistent worker infrastructure.

## Consequences

- Add a dedicated `apps/workflows` workspace.
- Keep framework-neutral job logic in shared packages.
- Admin server actions enqueue jobs rather than performing long-running work.
- Store Trigger task/run ids in Supabase workflow run records.
- Keep Edge Functions/manual scripts temporarily as rollback where they already exist.

## Fallback

If Trigger.dev fails deployment, cost, or control requirements, adopt Graphile Worker with an explicit hosting plan and direct Postgres connection strategy.
