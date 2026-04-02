# Phase 10: admin-codex-operator-for-guided-site-and-data-changes - Research

**Researched:** 2026-04-02
**Domain:** OpenClaw operator runtime, Telegram routing, durable memory, audited EveryBible mutation tools, ACP/Codex escalation
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Operator scope
- OpenClaw is the runtime/control plane for the operator.
- Telegram is the primary human-facing interface.
- The operator acts as a guide first and an executor second.

### Model and API boundary
- OpenClaw should host the assistant identity, channel routing, and memory.
- The underlying reasoning/coding capability should remain Codex/GPT-5.4 class through the provider or ACP path OpenClaw supports.
- Tool/function calling should be explicit and server-defined through EveryBible tools/plugins.

### Mutation boundary
- The model must not receive arbitrary SQL or filesystem authority.
- All live mutations must go through explicit EveryBible tools implemented in-repo.
- Every mutation must be audit-logged with actor identity and change metadata.

### Site mutation strategy
- Preserve current code-managed homepage content as the fallback source of truth.
- Add a remote homepage content contract in Supabase for live overrides.
- Have `apps/site` read the live homepage payload server-side and fall back safely when unset or invalid.

### Code change handling
- Requests that require source-code changes should be routed into Codex/ACP or a Git/GitHub-backed change-request path instead of pretending to hot-edit production code.
- Honesty about safe limits is part of the feature.

### Memory expectations
- The assistant should retain useful context across Telegram sessions.
- Cross-session memory should be enabled through the current OpenClaw memory mechanism, with Honcho used if that is the recommended up-to-date path.
- Secrets should not be stored in memory.

### Initial tool surface
- Start with homepage content read/update plus a small set of operational summary tools that ground the assistant in current admin state.
- Do not broaden into unrestricted content or support mutations in the first cut.

### Claude's Discretion
None specified in `10-CONTEXT.md`.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- public-site anonymous agent access
- arbitrary code editing from browser prompts
- arbitrary SQL tools
- broad autonomous GitHub PR generation without approval
- multi-role approval workflows
- fully custom memory infrastructure if OpenClaw's current memory path is sufficient for MVP
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COPILOT-01 | Jeremy can message an EveryBible OpenClaw operator from Telegram and keep a durable assistant identity across sessions | Telegram allowlist config, OpenClaw session binding guidance, memory plugin recommendations |
| COPILOT-02 | The OpenClaw operator uses Codex/GPT-5.4-class reasoning or coding capability underneath the OpenClaw runtime rather than a weak generic assistant configuration | OpenAI guidance on `gpt-5.4` for Codex plus OpenClaw ACP/acpx support for `codex` harnesses |
| COPILOT-03 | The operator can read and safely mutate approved EveryBible site/data surfaces only through explicit audited tools | Native OpenClaw plugin tool registration, allowlist policy, existing `admin_audit_logs` seam, narrow Supabase-backed tool design |
| COPILOT-04 | The public website homepage can consume admin-managed or agent-managed live content overrides while preserving deterministic code-managed fallback content | Server-side homepage override contract layered on top of `apps/site/lib/site-content.ts` fallback |
| COPILOT-05 | Operator-triggered changes leave clear audit evidence of actor, action, target, and changed fields | Reuse `apps/admin/lib/audit-log.ts` and keep each tool mutation audit-first |
| COPILOT-06 | Requests that require real source-code edits are routed into a Git/Codex/GitHub-backed workflow instead of hidden direct production mutation | ACP/Codex escalation path, separate code-session boundary, no live filesystem or SQL tools on the operator |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode is enabled.
- Never commit `.env`.
- Use barrel exports (`index.ts`) for shared code paths.
- Use theme context for colors in the mobile app; do not introduce hardcoded mobile colors.
- Use translation keys for all mobile user-facing text.
- Use Zustand stores for mobile global state.
- Preserve offline-first mobile architecture.
- Test on both iOS and Android when mobile behavior is touched.
- Use Expo native modules rather than custom native modules.
- Follow React Navigation v7 patterns on mobile.
- Do not forget the database-version triple bump rule when rebuilding `bible-bsb-v2.db`.
- Prefer local iOS EAS production builds with Expo-managed credentials.
- Use the repo package manager/runtime already in place (`npm`, Node, Turbo workspaces).
- Run relevant verification gates before handoff.

## Summary

OpenClaw is the right outer runtime for this phase, but the local machine is one release behind the latest official build. The installed CLI is `2026.3.13`; the latest official OpenClaw release is `2026.4.1`, published on 2026-04-01. That matters because the current docs and recent release notes include ACP/Telegram behavior that this phase depends on, and the local CLI already shows drift from the docs (`openclaw plugins inspect` exists in the docs but not in the installed CLI). Upgrade OpenClaw first, then enable the ACPX backend and Telegram channel against a locked-down config.

For EveryBible specifically, the clean MVP is a split architecture: use OpenClaw as the always-on Telegram gateway and reasoning shell, run the main operator on the bundled OpenAI provider with `gpt-5.4`, expose only narrow EveryBible-native tools for live data/content changes, and route actual source-code change requests into a separate ACP/Codex session. That keeps day-to-day mutations safe and auditable while preserving a reviewable Git workflow for real code edits.

For memory, current OpenClaw gives three realistic paths: `memory-core` (already loaded locally), `memory-lancedb` (bundled long-term memory with auto-recall/capture), and the Honcho plugin (`@honcho-ai/openclaw-honcho`). I do not see official evidence that Honcho has replaced the built-in memory slot as the default recommendation. For this phase, the least-risk MVP is: keep OpenClaw memory local, start with `memory-lancedb` if automatic recall is needed, and only add Honcho if Jeremy wants richer user/project memory beyond local gateway storage or expects multi-host continuity.

**Primary recommendation:** Upgrade OpenClaw to `2026.4.1`, run a Telegram-allowlisted `gpt-5.4` operator with a linked native EveryBible plugin for audited homepage/data tools, and use ACP/Codex only for reviewable code-change escalation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openclaw` | `2026.4.1` | Gateway runtime, Telegram channel, plugin loading, session/memory control plane | Official runtime for channels, tools, bindings, and agent orchestration |
| `acpx` | `0.4.0` | ACP backend for Codex and other coding harnesses | Official OpenClaw ACP backend with built-in `codex` alias and session controls |
| OpenAI `gpt-5.4` | current OpenAI model | Main reasoning/coding model for the operator | Official OpenAI guidance says Codex now defaults to `gpt-5.4` for most coding tasks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@honcho-ai/openclaw-honcho` | `1.2.2` | Honcho-backed persistent memory plugin | Use only if local memory is insufficient and you want richer cross-session user/project memory |
| `memory-lancedb` | bundled with OpenClaw | Local long-term memory with auto-recall/capture | Best first durable-memory upgrade before adding a separate memory service |
| `@supabase/supabase-js` | repo pin `2.91.0` | Server-side data access for EveryBible tools | Reuse the existing site/admin service-client pattern; do not upgrade Supabase in this phase |
| `next` | repo pin `15.4.5` | Homepage server rendering and fallback contract | Reuse the current site app deployment/runtime as-is |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenClaw ACP escalation for code changes | Direct Codex MCP server only | Works, but OpenClaw ACP has native session/thread binding and clearer routing inside Telegram |
| Native OpenClaw plugin for EveryBible tools | Codex/Claude-compatible bundle only | Bundles are fine for metadata/content packs, but native plugins are the correct surface for audited runtime tools |
| `memory-lancedb` MVP | Honcho first | Honcho adds another service/dependency; use it when you need more than local durable recall |
| OpenAI `gpt-5.4` main agent | `gpt-5.3-codex` or `gpt-5-codex` | Official OpenAI guidance now prefers `gpt-5.4` for most code generation and agentic coding tasks |

**Installation:**
```bash
npm install -g openclaw@2026.4.1
openclaw plugins install acpx --pin
openclaw plugins install @honcho-ai/openclaw-honcho@1.2.2 --pin
openclaw plugins install -l ./plugins/everybible-operator
```

**Version verification:** Verified on 2026-04-02.

- `openclaw@2026.4.1` — published 2026-04-01T17:29:53Z via `npm view openclaw time --json`
- `acpx@0.4.0` — published 2026-03-29T15:22:06Z via `npm view acpx time --json`
- `@honcho-ai/openclaw-honcho@1.2.2` — published 2026-03-31T16:28:54Z via `npm view @honcho-ai/openclaw-honcho time`

## Architecture Patterns

### Recommended Project Structure
```text
plugins/
└── everybible-operator/          # Native OpenClaw plugin linked into the gateway
    ├── openclaw.plugin.json      # Plugin manifest + config schema
    ├── index.ts                  # Tool registration + config wiring
    └── skills/                   # Optional operator usage notes

packages/
└── everybible-operator-tools/
    ├── src/
    │   ├── homepage.ts           # Homepage read/update validators + DTOs
    │   ├── summaries.ts          # Translation/content health summary fetchers
    │   ├── audit.ts              # Shared audit payload builders
    │   └── escalation.ts         # Code-change escalation classifier
    └── *.test.ts

apps/site/
└── lib/homepage-override.ts      # Server-side fetch/validate/fallback wrapper

supabase/migrations/
└── 2026xxxxxx_phase10_*.sql      # Homepage override table/RPC additions
```

### Pattern 1: Split the operator into “safe live tools” and “code-change escalation”
**What:** Keep the main OpenClaw operator narrow and auditable. Let it mutate only approved Supabase-backed EveryBible surfaces. Route source edits into ACP/Codex instead of pretending the live operator can patch production code.
**When to use:** Always. This is the core trust boundary for Phase 10.
**Example:**
```json
{
  "acp": {
    "enabled": true,
    "dispatch": { "enabled": true },
    "backend": "acpx",
    "defaultAgent": "codex",
    "allowedAgents": ["codex"],
    "maxConcurrentSessions": 2
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "allowFrom": ["<jeremy-telegram-user-id>"]
    }
  }
}
```
// Source: https://docs.openclaw.ai/tools/acp-agents, https://docs.openclaw.ai/channels/telegram

### Pattern 2: Implement EveryBible mutations as native OpenClaw tools, not prompt conventions
**What:** Register JSON-schema tools in a native plugin. Keep side-effecting tools optional and allowlisted.
**When to use:** For homepage override reads/updates and operational summary tools.
**Example:**
```ts
import { Type } from '@sinclair/typebox';

export default function register(api: any) {
  api.registerTool(
    {
      name: 'everybible_update_homepage',
      description: 'Update the live homepage override after validation and audit logging.',
      parameters: Type.Object({
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        actorUserId: Type.String(),
      }),
      async execute(_id: string, params: { actorUserId: string; title?: string; description?: string }) {
        return updateHomepageOverrideWithAudit(api, params);
      },
    },
    { optional: true },
  );
}
```
// Source pattern: https://docs.openclaw.ai/plugins/agent-tools

### Pattern 3: Validate remote homepage content server-side and fall back deterministically
**What:** Add a server-only helper that fetches the live homepage payload, validates shape/fields, and falls back to `apps/site/lib/site-content.ts` when the payload is missing or invalid.
**When to use:** For every public homepage render.
**Example:**
```ts
import { heroContent as fallbackHero } from './site-content';

export async function getHomepageHero() {
  const override = await getLiveHomepageOverride();
  if (!override || !isValidHomepageOverride(override)) {
    return fallbackHero;
  }
  return mergeHomepageOverride(fallbackHero, override);
}
```
// Source pattern: local repo seams in `apps/site/lib/site-content.ts` and `apps/site/app/api/mobile/content/route.ts`

### Pattern 4: Reuse the existing admin audit seam
**What:** Every tool that mutates data should call the same audit sink already used by admin actions.
**When to use:** Every live data mutation in the operator.
**Example:**
```ts
await writeAdminAuditLog({
  action: 'operator.homepage.update',
  actorEmail,
  actorUserId,
  entityType: 'site_homepage',
  entityId: 'homepage',
  metadata: { changedFields, tool: 'everybible_update_homepage' },
  summary: 'Updated live homepage override from the operator.',
});
```
// Source: `/Users/dev/Projects/EveryBible/apps/admin/lib/audit-log.ts`

### Anti-Patterns to Avoid
- **Direct SQL or filesystem tools:** Do not expose raw SQL, `exec`, or write-capable filesystem tools to the operator for live site/data mutation.
- **Using Telegram pairing as the long-term access control for a single-owner bot:** Official docs recommend `dmPolicy: "allowlist"` with explicit numeric `allowFrom` IDs for one-owner bots.
- **Turning on `pluginToolsMcpBridge` for ACP by default:** That widens the Codex/ACP tool surface and undermines the “code edits go through Git” boundary.
- **Relying on docs without upgrading the local gateway:** The installed `2026.3.13` CLI is already missing documented plugin subcommands.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram transport, allowlists, topic routing | Custom bot gateway | OpenClaw Telegram channel plugin | It already handles DM/group policy, mentions, topics, and bindings |
| Coding-agent orchestration | Custom Codex subprocess manager | OpenClaw ACP + `acpx` | Official path for Codex/Claude/Cursor harness sessions |
| Runtime mutation tools | Ad hoc shell scripts in prompts | Native OpenClaw plugin tools | Typed schema, explicit allowlists, auditable side effects |
| Durable memory | Custom memory tables first | `memory-lancedb` or Honcho | Existing memory plugins cover persistence and recall without custom infra |
| Homepage live overrides | Prompt-generated HTML or repo writes | Supabase override row + server-side validator/fallback | Keeps the public site deterministic and recoverable |
| Audit trail | New agent-only logging system | Existing `admin_audit_logs` table + helper | Already fits EveryBible admin mutations and actor metadata |
| Code-change execution | Hidden production edits | ACP/Codex + Git/GitHub review flow | Satisfies COPILOT-06 and preserves repo reviewability |

**Key insight:** OpenClaw is already opinionated about channels, plugins, tool policy, and ACP. The safe path is to plug EveryBible into those seams, not to tunnel around them.

## Common Pitfalls

### Pitfall 1: ACP sessions fail the first time they try to write
**What goes wrong:** Codex/ACP sessions abort with `AcpRuntimeError` as soon as they hit a write or shell permission prompt.
**Why it happens:** ACP sessions are non-interactive; OpenClaw documents that `permissionMode=approve-reads` and `nonInteractivePermissions=fail` are the defaults.
**How to avoid:** Decide explicitly: use `permissionMode=approve-all` only for the isolated code-change harness, or set `nonInteractivePermissions=deny` so non-approved actions degrade gracefully.
**Warning signs:** Gateway logs mention `Permission prompt unavailable in non-interactive mode`.

### Pitfall 2: Telegram bot access stays broader or narrower than intended
**What goes wrong:** Jeremy cannot reach the bot, or unrelated accounts can.
**Why it happens:** Telegram DM/group policy is split across `dmPolicy`, `allowFrom`, `groupPolicy`, `groups`, and privacy-mode behavior.
**How to avoid:** For MVP, use DM-only with `dmPolicy: "allowlist"` and an explicit numeric `allowFrom` list. Avoid pairing mode as the long-term access policy.
**Warning signs:** `openclaw channels status` warnings, no responses in DM, or unexpected access after pairing.

### Pitfall 3: Workspace plugin code exists in-repo but never loads
**What goes wrong:** The plugin is present, but OpenClaw ignores it.
**Why it happens:** Workspace-origin plugins are disabled by default and require explicit enablement.
**How to avoid:** Use `openclaw plugins install -l ./plugins/everybible-operator`, then enable/configure it under `plugins.entries.everybible-operator`.
**Warning signs:** `openclaw plugins list` shows the plugin as disabled or missing.

### Pitfall 4: Live homepage overrides break the public site
**What goes wrong:** The homepage renders partial or malformed content after a bad agent/admin write.
**Why it happens:** Remote override payloads are not schema-validated before render.
**How to avoid:** Validate every override server-side and merge onto code fallback instead of replacing blindly.
**Warning signs:** Runtime errors on `apps/site/app/page.tsx`, missing hero fields, broken image refs.

### Pitfall 5: Memory captures sensitive configuration
**What goes wrong:** Tokens, API keys, or raw secret-bearing payloads end up in memory or audit metadata.
**Why it happens:** Tool results and operator summaries are stored without redaction rules.
**How to avoid:** Keep secrets in env/config only, redact tool outputs before memory capture, and do not pass secrets as tool-return content.
**Warning signs:** Memory entries or audit metadata containing token-like strings or full config blobs.

## Migration Notes

- Upgrade OpenClaw before implementation. The local host is on `OpenClaw 2026.3.13`; official latest is `2026.4.1`.
- The installed CLI lacks documented `openclaw plugins inspect`, which is a concrete sign that local CLI behavior lags the current docs.
- Local OpenClaw already has `telegram` loaded and `memory-core` loaded, but `acpx` is disabled and Honcho is not installed.
- Keep `pluginToolsMcpBridge` off in MVP. The main operator can call EveryBible tools directly; ACP/Codex should not gain live mutation tools unless you explicitly decide that code sessions may mutate production data.
- Do not upgrade `next` or `@supabase/supabase-js` in this phase. This phase is an operator/system boundary change, not a framework refresh.

## Code Examples

Verified patterns from official sources and local repo seams:

### Telegram DM-only MVP config
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "allowFrom": ["<jeremy-telegram-user-id>"]
    }
  }
}
```
// Source: https://docs.openclaw.ai/channels/telegram

### ACP backend bootstrap for Codex
```bash
openclaw plugins install acpx
openclaw config set plugins.entries.acpx.enabled true
```
```json
{
  "acp": {
    "enabled": true,
    "backend": "acpx",
    "defaultAgent": "codex",
    "allowedAgents": ["codex"]
  }
}
```
// Source: https://docs.openclaw.ai/tools/acp-agents

### Code-change escalation via Codex MCP server
```bash
codex mcp-server
```
Use this when a Git-backed workflow needs Codex outside the main OpenClaw live-mutation path.
// Source: https://developers.openai.com/codex/guides/agents-sdk/#running-codex-as-an-mcp-server

### Safe homepage fallback wrapper
```ts
export async function getHomepageContent() {
  const override = await getLiveHomepageOverride();
  if (!override) {
    return staticHomepageFallback;
  }

  const normalized = normalizeHomepageOverride(override);
  return normalized ?? staticHomepageFallback;
}
```
// Source pattern: local repo seams in `/Users/dev/Projects/EveryBible/apps/site/lib/site-content.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Specialized codex-only model as default for coding agents | `gpt-5.4` as the recommended default for most Codex/code-generation tasks | OpenAI docs current as of 2026-04-02 | Use `gpt-5.4` first; keep specialized Codex variants as fallback |
| Pairing-based Telegram access as the easy default | Explicit numeric `allowFrom` + `dmPolicy: "allowlist"` for durable owner-only bots | OpenClaw Telegram docs current as of 2026-04-02 | Better long-term access control and less hidden state |
| Memory search only | `memory-lancedb` auto-recall/capture and Honcho plugin options | OpenClaw plugin docs current as of 2026-04-02 | Durable memory no longer requires custom first-party infra |
| Ad hoc external coding harness glue | ACP + `acpx` with built-in `codex` alias and thread binding support | OpenClaw ACP docs current as of 2026-04-02 | Stronger code-session routing and less custom process management |

**Deprecated/outdated:**
- Using unpinned pairing-store approvals as the only owner boundary for a single-user Telegram bot: replace with explicit numeric allowlists.
- Letting ACP sessions rely on default permission prompts: current docs explicitly warn this fails in non-interactive ACP mode.

## Open Questions

1. **Should MVP memory be `memory-lancedb` or Honcho-backed?**
   - What we know: OpenClaw officially supports both built-in durable memory options and Honcho via plugin.
   - What's unclear: Whether Jeremy needs richer cross-project/user-profile memory on day one or only persistent operator context for EveryBible.
   - Recommendation: Start with local durable memory (`memory-lancedb`) unless a concrete Honcho-only use case is already known.

2. **Should Telegram be DM-only or topic-aware from day one?**
   - What we know: Telegram topics can route to isolated agents and ACP sessions, but that adds routing complexity.
   - What's unclear: Whether Jeremy wants a private owner DM only, or shared group/forum workflows immediately.
   - Recommendation: DM-only MVP. Add group/topic routing later if operational collaboration appears.

3. **Do code-change requests need automatic GitHub issue/PR creation in Phase 10?**
   - What we know: COPILOT-06 requires reviewable Git/Codex/GitHub-backed routing, not necessarily autonomous PR creation.
   - What's unclear: Whether the MVP should only hand off to Codex/ACP, or also open structured issue/PR artifacts.
   - Recommendation: MVP should classify and hand off honestly; auto-issue/PR creation can be a later tool once trust boundaries are proven.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | OpenClaw, plugin code, site/admin apps | ✓ | `v25.8.1` | — |
| npm | OpenClaw/plugin install, repo scripts | ✓ | `11.11.0` | — |
| OpenClaw CLI | Gateway runtime | ✓ | `2026.3.13` | Upgrade to `2026.4.1` |
| ACPX backend | ACP/Codex orchestration | ✓ | `0.4.0` available in registry; local plugin disabled | Enable via OpenClaw plugin |
| Codex CLI | Code-change escalation | ✓ | `0.115.0-alpha.7` | Codex MCP server or human-run Codex CLI |
| GitHub CLI | Reviewable code-change workflow | ✓ | `2.88.1` | Git only, if needed |
| Supabase CLI | Schema/migration work | ✓ | `2.75.0` | Existing SQL migration flow still works; upgrade later if needed |
| Docker | Local Supabase runtime, if used | ✓ | `29.1.5` | Remote Supabase only |
| Python 3 | Utility scripts | ✓ | `3.12.13` | — |
| Telegram bot token | Telegram channel startup | Not audited | — | Must be created in BotFather |
| OpenAI/Codex auth | `gpt-5.4` operator and Codex sessions | Not audited | — | Must be configured during bootstrap |
| Honcho service/plugin | Optional richer memory | ✗ | — | Use `memory-lancedb` first |

**Missing dependencies with no fallback:**
- Telegram bot token and OpenAI/Codex credentials were not inspected for security reasons; Phase 10 bootstrap must supply them.

**Missing dependencies with fallback:**
- Honcho is not installed locally; `memory-lancedb` is the low-friction fallback.
- Local OpenClaw is behind latest; upgrade before relying on current docs and release-note fixes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `tsx` |
| Config file | none |
| Quick run command | `node --test --import tsx apps/admin/lib/analytics-reporting.test.ts` |
| Full suite command | `npm run site:lint && npm run site:typecheck && npm run admin:lint && npm run admin:typecheck && npm run site:build && npm run admin:build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COPILOT-01 | Telegram DM access is restricted to Jeremy and the session identity persists | integration/manual | `openclaw channels status --probe` plus DM smoke test | ❌ Wave 0 |
| COPILOT-02 | OpenClaw can route code requests to Codex/ACP | integration | `openclaw plugins list` and ACP bootstrap smoke once configured | ❌ Wave 0 |
| COPILOT-03 | Homepage/data mutations go through explicit audited tools only | unit | `node --test --import tsx packages/everybible-operator-tools/src/*.test.ts` | ❌ Wave 0 |
| COPILOT-04 | Homepage override falls back safely when data is absent/invalid | unit | `node --test --import tsx apps/site/lib/homepage-override.test.ts` | ❌ Wave 0 |
| COPILOT-05 | Audit metadata includes actor, action, target, and changed fields | unit | `node --test --import tsx packages/everybible-operator-tools/src/audit.test.ts` | ❌ Wave 0 |
| COPILOT-06 | Source-code edit requests escalate instead of mutating live data | unit/integration | `node --test --import tsx packages/everybible-operator-tools/src/escalation.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** target the new unit tests plus `npm run site:typecheck` or `npm run admin:typecheck` as applicable
- **Per wave merge:** `npm run site:lint && npm run site:typecheck && npm run admin:lint && npm run admin:typecheck`
- **Phase gate:** build both web apps and run operator-specific unit tests before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/site/lib/homepage-override.test.ts` — fallback and payload-normalization coverage for COPILOT-04
- [ ] `packages/everybible-operator-tools/src/homepage.test.ts` — safe mutation validation for COPILOT-03
- [ ] `packages/everybible-operator-tools/src/audit.test.ts` — audit payload coverage for COPILOT-05
- [ ] `packages/everybible-operator-tools/src/escalation.test.ts` — code-change routing coverage for COPILOT-06
- [ ] Add a small operator test script or package-level test command so planner does not rely on ad hoc file paths

## Sources

### Primary (HIGH confidence)
- OpenClaw official docs: https://docs.openclaw.ai/channels/telegram — Telegram access control, policies, topic routing, runtime behavior
- OpenClaw official docs: https://docs.openclaw.ai/tools/acp-agents — ACP/acpx setup, Codex harness aliases, permission model, plugin tool bridge
- OpenClaw official docs: https://docs.openclaw.ai/tools/plugin — plugin discovery, enablement, local install/link workflow, memory slots
- OpenClaw official docs: https://docs.openclaw.ai/plugins/agent-tools — native tool registration and allowlist semantics
- OpenClaw official docs: https://docs.openclaw.ai/concepts/memory-honcho — Honcho memory plugin capabilities and env/config expectations
- OpenClaw official release: https://github.com/openclaw/openclaw/releases/tag/v2026.4.1 — latest official release and 2026-04-01 date
- OpenAI official docs: https://developers.openai.com/api/docs/guides/code-generation/#use-codex — `gpt-5.4` guidance for Codex/code generation
- OpenAI official docs: https://developers.openai.com/api/docs/guides/latest-model/#faq — `gpt-5.4` as newest model powering Codex/Codex CLI
- OpenAI official docs: https://developers.openai.com/codex/guides/agents-sdk/#running-codex-as-an-mcp-server — Codex MCP server path
- Local repo seam: `/Users/dev/Projects/EveryBible/apps/admin/lib/audit-log.ts`
- Local repo seam: `/Users/dev/Projects/EveryBible/apps/admin/app/(dashboard)/actions.ts`
- Local repo seam: `/Users/dev/Projects/EveryBible/apps/site/lib/site-content.ts`
- Local repo seam: `/Users/dev/Projects/EveryBible/apps/site/app/api/mobile/content/route.ts`
- Local repo seam: `/Users/dev/Projects/EveryBible/supabase/migrations/20260401130000_create_web_admin_platform.sql`
- Local repo seam: `/Users/dev/Projects/EveryBible/supabase/migrations/20260402091500_unify_shared_backend_contracts.sql`

### Secondary (MEDIUM confidence)
- `npm view openclaw time --json` on 2026-04-02 — registry version verification
- `npm view acpx time --json` on 2026-04-02 — registry version verification
- `npm view @honcho-ai/openclaw-honcho time` on 2026-04-02 — registry version verification

### Tertiary (LOW confidence)
- None needed for the main recommendations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - official OpenClaw/OpenAI docs plus registry verification
- Architecture: MEDIUM - strong official/runtime evidence, but EveryBible-specific plugin wiring is still an implementation recommendation
- Pitfalls: HIGH - official OpenClaw ACP/Telegram docs explicitly document the risky edges

**Research date:** 2026-04-02
**Valid until:** 2026-04-09
