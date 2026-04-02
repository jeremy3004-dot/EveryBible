---
phase: 10-admin-codex-operator-for-guided-site-and-data-changes
generated: 2026-04-02
status: active
---

# Phase 10 Validation Strategy

## Validation Architecture

Phase 10 needs proof across five dimensions:

1. Content contract safety
2. Public site fallback behavior
3. OpenClaw plugin/tool safety
4. Operator bootstrap honesty
5. Real host activation plus public launcher behavior

Mobile asset-delivery guardrail for this execution pass:

- Bible text/audio payloads should resolve from the configured Cloudflare R2 asset base, while listening and download analytics remain on the existing reporting rails so the website/admin dashboards stay intact.

The phase should pass only if the site can be changed through explicit audited tools, the public homepage remains deterministic when the live contract is absent or malformed, and operator runtime docs/config really describe a Telegram plus memory plus Codex-capable setup rather than a vague future state.

## Scope Under Test

### Plan 10-01

Validate:

- Supabase homepage override schema exists and is narrow in scope
- a live homepage payload can be read safely
- invalid or missing payloads fall back to the current code-managed homepage
- operator audit metadata lands in the existing `admin_audit_logs` path
- admin settings can surface recent operator actions

### Plan 10-02

Validate:

- the repo contains a native OpenClaw plugin package, not just prompt files
- tool handlers stay narrow and explicit
- code-change requests become reviewable artifacts rather than direct repo mutation
- the setup/runbook covers Telegram, memory, and ACP Codex realistically
- required operator env/config fields are discoverable

### Plan 10-03

Validate:

- the repo contains a concrete local-host bootstrap and verification path, not just prose
- the Telegram pairing flow is explicitly temporary and steady-state access returns to allowlist mode
- the memory decision is explicit (`memory-core` by default on the live host, Honcho only when chosen)
- the public site renders a persistent bottom-right launcher across pages
- the launcher opens the approved operator chat target without becoming an unrestricted anonymous agent surface

## Automated Checks

Run:

```bash
node --test --import tsx src/services/bible/bibleAssetBaseUrl.test.ts
node --test --import tsx src/services/bible/cloudTranslationService.test.ts
node --test --import tsx apps/site/lib/homepage-content.test.ts
npm run site:typecheck
npm run admin:typecheck
npm run operator:typecheck
npm run operator:test
node --test --import tsx apps/site/lib/operator-launcher.test.ts
```

## Manual Checks

1. Review the gateway example config and confirm it includes:
   - Telegram bot token and allowlist wiring
   - plugin enablement
   - ACP backend with Codex as the default escalation agent
   - memory guidance that starts simple and explains Honcho clearly
2. Review the setup doc and confirm it includes:
   - installation or upgrade to the current OpenClaw release
   - Telegram pairing steps
   - a memory persistence smoke test
   - a Codex escalation smoke test
3. Review the code-change request tool output and confirm it creates an artifact instead of editing source code directly.
4. Run the local-host bring-up flow and confirm:
   - `openclaw doctor`, `openclaw health`, and `openclaw status` pass
   - the real Telegram bot can be paired once and then locked back to allowlist mode
   - `/acp status` reports the expected backend and default agent
5. Open the public site and confirm the launcher:
   - is visible in the bottom-right on homepage and static pages
   - opens the configured operator chat target
   - does not overlap or break the existing mobile download CTA area
6. Review a runtime translation that uses `catalog.text.downloadUrl` and confirm:
   - absolute URLs continue downloading directly
   - relative pack paths resolve against `EXPO_PUBLIC_BIBLE_ASSET_BASE_URL`
   - analytics/reporting requirements do not require changes to the existing listening/download dashboards

## Pass Criteria

- Homepage override reads are typed and tested.
- The public homepage remains stable when the live contract is empty or malformed.
- Operator mutation paths are auditable.
- OpenClaw runtime assets are concrete enough to bootstrap on a trusted host.
- The plugin does not claim arbitrary production authority.
- Code-change escalation is explicit and reviewable.
- The real local host can reach a verified Telegram-ready state.
- The public site launcher provides a controlled operator entrypoint without violating the deferred anonymous-agent boundary.
- Bible asset delivery can move to Cloudflare R2 without breaking runtime translation installs or the existing admin reporting surfaces.
