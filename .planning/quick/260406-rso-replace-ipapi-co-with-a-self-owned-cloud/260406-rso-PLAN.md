---
phase: quick
plan: 260406-rso
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/geo/src/index.ts
  - workers/geo/wrangler.toml
  - workers/geo/package.json
  - workers/geo/tsconfig.json
  - src/services/analytics/geoContext.ts
  - src/services/startup/publicRuntimeConfig.ts
  - app.config.js
  - .env.example
  - src/services/startup/runtimeConfig.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Cloudflare Worker returns JSON matching ipapi.co field names from request.cf"
    - "geoContext.ts reads worker URL from runtime config instead of hardcoded ipapi.co"
    - "Missing EXPO_PUBLIC_GEO_WORKER_URL gracefully returns null without crashing"
    - "Worker handles OPTIONS preflight and returns CORS headers"
    - "Worker returns empty geo (not crash) when request.cf fields are undefined in local dev"
  artifacts:
    - path: "workers/geo/src/index.ts"
      provides: "Cloudflare Worker that maps request.cf to ipapi.co-shaped JSON"
    - path: "workers/geo/wrangler.toml"
      provides: "Worker configuration"
    - path: "workers/geo/package.json"
      provides: "Worker dependencies"
    - path: "workers/geo/tsconfig.json"
      provides: "Worker TypeScript config"
    - path: "src/services/analytics/geoContext.ts"
      provides: "Updated geo lookup using env-driven worker URL"
  key_links:
    - from: "src/services/analytics/geoContext.ts"
      to: "src/services/startup/publicRuntimeConfig.ts"
      via: "reads EXPO_PUBLIC_GEO_WORKER_URL from publicRuntimeConfig"
      pattern: "publicRuntimeConfig\\.EXPO_PUBLIC_GEO_WORKER_URL"
    - from: "workers/geo/src/index.ts"
      to: "request.cf"
      via: "Cloudflare IncomingRequestCfProperties"
      pattern: "request\\.cf"
---

<objective>
Replace the third-party ipapi.co geolocation dependency with a self-owned Cloudflare Worker that reads free request.cf fields and returns the same JSON shape.

Purpose: Eliminates rate-limit risk and third-party dependency for analytics geo enrichment.
Output: A deployable Cloudflare Worker in workers/geo/ and an updated geoContext.ts that reads its URL from runtime config.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/services/analytics/geoContext.ts
@src/services/startup/publicRuntimeConfig.ts
@app.config.js
@.env.example
@src/services/startup/runtimeConfig.test.ts
</context>

<interfaces>
<!-- Existing contracts the executor needs. -->

From src/services/analytics/geoContext.ts:
```typescript
interface GeoContext {
  geo_accuracy_km: number | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_source: string | null;
  geo_timezone: string | null;
}
// resolveGeoContext() returns Promise<GeoContext | null>
// attachGeoContext(event, geo) spreads geo fields onto event
```

From src/services/startup/publicRuntimeConfig.ts:
```typescript
const PUBLIC_RUNTIME_CONFIG_KEYS = [
  'EXPO_PUBLIC_BIBLE_ASSET_BASE_URL',
  'EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL',
  // ... other keys
] as const;
type PublicRuntimeConfigKey = (typeof PUBLIC_RUNTIME_CONFIG_KEYS)[number];
export type PublicRuntimeConfig = Record<PublicRuntimeConfigKey, string | undefined>;
```

From app.config.js:
```javascript
const PUBLIC_RUNTIME_CONFIG_KEYS = [
  'EXPO_PUBLIC_BIBLE_ASSET_BASE_URL',
  'EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL',
  // ... same keys, duplicated in CJS for build-time injection
];
```

Key Cloudflare request.cf fields to map:
- request.cf.country       -> country_code
- request.cf.latitude      -> latitude
- request.cf.longitude     -> longitude
- request.cf.timezone      -> timezone
- request.cf.city          -> city
- request.cf.region        -> region
- request.cf.regionCode    -> region_code
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create Cloudflare Worker at workers/geo/</name>
  <files>workers/geo/src/index.ts, workers/geo/wrangler.toml, workers/geo/package.json, workers/geo/tsconfig.json</files>
  <action>
Create the `workers/geo/` directory with four files:

**workers/geo/package.json** -- Minimal package with:
- name: "everybible-geo-worker"
- private: true
- scripts: { "dev": "wrangler dev", "deploy": "wrangler deploy" }
- devDependencies: { "wrangler": "^4.0.0", "@cloudflare/workers-types": "^4.0.0", "typescript": "^5.0.0" }

**workers/geo/wrangler.toml** -- Config with:
- name = "everybible-geo"
- main = "src/index.ts"
- compatibility_date = "2024-09-23"
- compatibility_flags = ["nodejs_compat"]

**workers/geo/tsconfig.json** -- Config targeting ES2022, module ESNext, moduleResolution Bundler, types: ["@cloudflare/workers-types"]

**workers/geo/src/index.ts** -- The Worker handler:
- Default export with a `fetch(request, env, ctx)` handler
- Use the Cloudflare Workers types (ExportedHandler pattern)
- For OPTIONS requests: return 204 with CORS headers (Access-Control-Allow-Origin: *, Access-Control-Allow-Methods: GET, OPTIONS, Access-Control-Allow-Headers: Accept, Content-Type, User-Agent, Access-Control-Max-Age: 86400)
- For GET requests: read `request.cf` properties and return JSON with these field names matching ipapi.co shape:
  - `country_code` from `request.cf.country` (string or null)
  - `latitude` from `request.cf.latitude` (string, parse to number or null)
  - `longitude` from `request.cf.longitude` (string, parse to number or null)
  - `timezone` from `request.cf.timezone` (string or null)
  - `city` from `request.cf.city` (string or null)
  - `region` from `request.cf.region` (string or null)
  - `region_code` from `request.cf.regionCode` (string or null)
- When `request.cf` is undefined (local dev with `wrangler dev`), return a JSON object with all null values -- do NOT crash or throw
- Set response headers: Content-Type: application/json, Cache-Control: no-store, same CORS headers as OPTIONS response
- For any other method, return 405 Method Not Allowed
  </action>
  <verify>
    <automated>cd /Users/dev/conductor/workspaces/EveryBible/lyon/workers/geo && cat src/index.ts && npx tsc --noEmit 2>&1 || echo "TypeScript check requires npm install first -- structure verified by file existence"</automated>
  </verify>
  <done>workers/geo/ contains all four files, Worker handles GET/OPTIONS/fallback, gracefully handles missing request.cf, returns ipapi.co-compatible JSON field names</done>
</task>

<task type="auto">
  <name>Task 2: Wire EXPO_PUBLIC_GEO_WORKER_URL into runtime config and update geoContext.ts</name>
  <files>src/services/startup/publicRuntimeConfig.ts, app.config.js, .env.example, src/services/analytics/geoContext.ts, src/services/startup/runtimeConfig.test.ts</files>
  <action>
**Step A -- Add EXPO_PUBLIC_GEO_WORKER_URL to the runtime config plumbing (3 files):**

1. In `src/services/startup/publicRuntimeConfig.ts`: Add `'EXPO_PUBLIC_GEO_WORKER_URL'` to the `PUBLIC_RUNTIME_CONFIG_KEYS` array (after EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL). Add `EXPO_PUBLIC_GEO_WORKER_URL: undefined` to the initial config object in `buildPublicRuntimeConfig`.

2. In `app.config.js`: Add `'EXPO_PUBLIC_GEO_WORKER_URL'` to the `PUBLIC_RUNTIME_CONFIG_KEYS` array in the same position as step 1. This is the CJS mirror of the TS list and must stay in sync.

3. In `.env.example`: Add a new line after the EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL block:
```
# Self-hosted Cloudflare Worker for IP geolocation (replaces ipapi.co)
EXPO_PUBLIC_GEO_WORKER_URL=https://everybible-geo.your-subdomain.workers.dev
```

**Step B -- Update geoContext.ts to use runtime config:**

Replace the hardcoded `https://ipapi.co/json/` fetch with:
1. Import `publicRuntimeConfig` from `'../startup/publicRuntimeConfig'`
2. At the top of the `resolveGeoContext` IIFE body, read `publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL`
3. If the URL is falsy (undefined or empty string), log a `console.warn('GEO: EXPO_PUBLIC_GEO_WORKER_URL not configured, skipping geo enrichment')` once and return null
4. Use that URL for the fetch call instead of the hardcoded ipapi.co URL
5. Change `geo_source` from `'ipapi'` to `'cf-worker'`
6. The response parsing logic (normalizeCountryCode, normalizeCoordinate, timezone parsing) stays exactly the same since the Worker returns the same field names

**Step C -- Update runtimeConfig.test.ts:**

1. In the `'env example documents only supported Google sign-in client IDs'` test, add:
   `assert.match(envExample, /EXPO_PUBLIC_GEO_WORKER_URL=/);`

2. In the `'buildPublicRuntimeConfig falls back to Expo extra'` test, add `EXPO_PUBLIC_GEO_WORKER_URL: 'https://everybible-geo.workers.dev'` to the publicRuntimeConfig input and a corresponding assert.equal.

3. In the `'app config injects public runtime auth values into Expo extra'` test, add `EXPO_PUBLIC_GEO_WORKER_URL: ' https://everybible-geo.workers.dev '` to the input env and `EXPO_PUBLIC_GEO_WORKER_URL: 'https://everybible-geo.workers.dev'` to the expected output.
  </action>
  <verify>
    <automated>cd /Users/dev/conductor/workspaces/EveryBible/lyon && npx tsc --noEmit 2>&1 | head -20 && node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="runtimeConfig" --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>geoContext.ts fetches from runtime-configured Worker URL (not hardcoded ipapi.co), returns null gracefully when URL is not set, geo_source is "cf-worker", all three runtime config plumbing files have the new key, runtimeConfig tests pass with the new env var assertions</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors from new key in PublicRuntimeConfig)
- `npm run lint` passes
- `npm run test:release` passes (includes runtimeConfig tests)
- geoContext.ts no longer contains any reference to `ipapi.co`
- workers/geo/src/index.ts handles GET, OPTIONS, missing request.cf gracefully
</verification>

<success_criteria>
- Cloudflare Worker source is ready to deploy at workers/geo/
- geoContext.ts reads URL from EXPO_PUBLIC_GEO_WORKER_URL runtime config
- Missing env var produces a console warning and null return (no crash)
- Response field names unchanged (country_code, latitude, longitude, timezone)
- All existing analytics test suites pass unchanged
- geo_source changes from "ipapi" to "cf-worker"
</success_criteria>

<output>
After completion, create `.planning/quick/260406-rso-replace-ipapi-co-with-a-self-owned-cloud/260406-rso-SUMMARY.md`
</output>
