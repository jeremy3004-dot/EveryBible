---
phase: 10-admin-codex-operator-for-guided-site-and-data-changes
generated: 2026-04-02
status: active
---

# Phase 10 Validation Strategy

## Validation Architecture

Phase 10 needs proof across four dimensions:

1. Content contract safety
2. Public site fallback behavior
3. OpenClaw plugin/tool safety
4. Operator bootstrap honesty

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

## Automated Checks

Run:

```bash
node --test --import tsx apps/site/lib/homepage-content.test.ts
npm run site:typecheck
npm run admin:typecheck
npm run operator:typecheck
npm run operator:test
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

## Pass Criteria

- Homepage override reads are typed and tested.
- The public homepage remains stable when the live contract is empty or malformed.
- Operator mutation paths are auditable.
- OpenClaw runtime assets are concrete enough to bootstrap on a trusted host.
- The plugin does not claim arbitrary production authority.
- Code-change escalation is explicit and reviewable.
