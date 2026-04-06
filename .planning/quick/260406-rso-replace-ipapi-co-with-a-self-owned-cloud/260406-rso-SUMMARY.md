---
phase: quick
plan: 260406-rso
subsystem: analytics/geo
tags: [cloudflare-worker, geo-enrichment, analytics, runtime-config]
dependency_graph:
  requires: []
  provides: [workers/geo/src/index.ts, EXPO_PUBLIC_GEO_WORKER_URL runtime config key]
  affects: [src/services/analytics/geoContext.ts, src/services/startup/publicRuntimeConfig.ts, app.config.js]
tech_stack:
  added: [Cloudflare Workers, @cloudflare/workers-types, wrangler]
  patterns: [ExportedHandler, IncomingRequestCfProperties, runtime config env var pattern]
key_files:
  created:
    - workers/geo/src/index.ts
    - workers/geo/wrangler.toml
    - workers/geo/package.json
    - workers/geo/tsconfig.json
  modified:
    - src/services/analytics/geoContext.ts
    - src/services/startup/publicRuntimeConfig.ts
    - app.config.js
    - .env.example
    - src/services/startup/runtimeConfig.test.ts
    - tsconfig.json
decisions:
  - Use tsconfig.json exclude for workers/ so Cloudflare Workers types do not pollute app TypeScript compile
  - geo_source changes from "ipapi" to "cf-worker" to reflect the new provider
metrics:
  duration: ~10 minutes
  completed: "2026-04-06T14:21:00Z"
  tasks_completed: 2
  files_changed: 10
---

# Quick Task 260406-rso: Replace ipapi.co with Self-Hosted Cloudflare Worker Summary

**One-liner:** Replaced third-party ipapi.co geolocation with a self-owned Cloudflare Worker (`workers/geo/`) that maps `request.cf` fields to the same JSON shape, controlled via `EXPO_PUBLIC_GEO_WORKER_URL` runtime config.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create Cloudflare Worker at workers/geo/ | a5f31a5 | workers/geo/src/index.ts, wrangler.toml, package.json, tsconfig.json |
| 2 | Wire EXPO_PUBLIC_GEO_WORKER_URL and update geoContext.ts | fdc2d0f | geoContext.ts, publicRuntimeConfig.ts, app.config.js, .env.example, runtimeConfig.test.ts, tsconfig.json |

## What Was Built

### Cloudflare Worker (`workers/geo/`)

A minimal Cloudflare Worker deployed at `everybible-geo.your-subdomain.workers.dev` that:
- Handles `GET` requests by reading free `request.cf` fields (country, latitude, longitude, timezone, city, region, regionCode) and returning ipapi.co-compatible JSON
- Handles `OPTIONS` preflight with full CORS headers (Access-Control-Allow-Origin: `*`)
- Returns `405` for any other HTTP method
- Gracefully returns all-null payload when `request.cf` is undefined (local `wrangler dev`)
- Sets `Cache-Control: no-store` to prevent stale geo data

### Runtime Config Plumbing

`EXPO_PUBLIC_GEO_WORKER_URL` added to all three config locations:
- `publicRuntimeConfig.ts` (TypeScript keys + default undefined)
- `app.config.js` (CJS mirror for build-time injection)
- `.env.example` (documentation with placeholder URL)

### Updated geoContext.ts

- Reads worker URL from `publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL`
- Returns `null` with `console.warn` when URL is not configured (no crash)
- `geo_source` changed from `'ipapi'` to `'cf-worker'`
- Response parsing logic unchanged (same field names from worker)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Root tsconfig picked up workers/ TypeScript files**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** Root `tsconfig.json` included `workers/geo/src/index.ts`, which uses `@cloudflare/workers-types` types not installed at repo root (`IncomingRequestCfProperties`, `ExportedHandler` unknown)
- **Fix:** Added `"workers"` to the `exclude` array in `tsconfig.json`
- **Files modified:** `tsconfig.json`
- **Commit:** fdc2d0f

## Verification Results

- `npx tsc --noEmit` — passes (0 errors)
- `npm run lint` — passes
- `node --test --import tsx src/services/startup/runtimeConfig.test.ts` — 6/6 pass
- `npm run test:release` — 446/446 pass
- `geoContext.ts` contains no reference to `ipapi.co`
- `workers/geo/src/index.ts` handles GET, OPTIONS, missing request.cf

## Known Stubs

None. The worker is fully implemented and geoContext is fully wired. The worker requires deployment to Cloudflare and setting `EXPO_PUBLIC_GEO_WORKER_URL` in the production environment before geo enrichment activates in production. This is an operator action, not a code stub.

## Self-Check: PASSED

- workers/geo/src/index.ts: FOUND
- workers/geo/wrangler.toml: FOUND
- workers/geo/package.json: FOUND
- workers/geo/tsconfig.json: FOUND
- geoContext.ts: no ipapi.co reference
- Commits a5f31a5, fdc2d0f: FOUND
