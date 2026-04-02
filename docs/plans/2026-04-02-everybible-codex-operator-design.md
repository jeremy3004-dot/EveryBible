# EveryBible OpenClaw Operator Design

**Date:** 2026-04-02
**Status:** Draft for GSD Phase 10 planning and execution
**Scope:** OpenClaw control plane, Telegram access, persistent memory, `apps/site` content contracts, audited EveryBible content/data tools

## Problem

The EveryBible team now has a credible public website and an internal admin platform, but important site and content updates still require direct code edits or manual admin workflows. The requested next step is an OpenClaw-powered operator that can:

- be messaged from Telegram
- retain durable memory across sessions
- use Codex/GPT-5.4-grade reasoning and coding capabilities
- understand the current site and operational data context
- make approved changes to the website and admin-managed data from within the website/admin experience

This should not become a public, unconstrained agent that can arbitrarily mutate production code or the database. The right shape is an OpenClaw agent with narrow, audited EveryBible tools and a Git-backed escalation path for real code changes.

## Product Shape

Phase 10 should make OpenClaw the control plane for the EveryBible operator.

The operator should support four classes of work:

1. Guided analysis
   - answer questions about the current site/admin state
   - explain what can be changed safely
   - prepare proposed changes before mutating anything

2. Telegram access
   - let Jeremy message the EveryBible operator over Telegram
   - keep the same agent identity and memory across sessions

3. Safe live mutations
   - update approved, admin-owned content and operational data through explicit server tools
   - keep all mutations authenticated, validated, and audit-logged
   - start with the public homepage content contract so the team can "change the site from the site"

4. Code-change routing
   - when a request requires source-code edits, route through Codex/ACP or a reviewable Git/GitHub-backed change request instead of pretending the agent can safely hot-edit production code without guardrails
   - preserve the existing repo-centered review and deployment workflow

## Non-Goals

- no public-site AI operator
- no arbitrary SQL execution from prompts
- no arbitrary file editing from a browser session
- no bypass of existing admin auth or audit rails
- no silent production code mutation outside Git-backed review
- no attempt to replace the existing admin modules for translations, verse of the day, images, health, support, or analytics

## Recommended Architecture

## Recommended Architecture

### 1. OpenClaw as the agent runtime

Use OpenClaw as the outer runtime because it already gives us:

- Telegram channel support
- durable session/memory patterns
- agent tooling/plugin surfaces
- ACP-based coding-agent interoperability

This lets the EveryBible operator live beyond a single admin browser session while still calling into EveryBible-specific tools.

### 2. Telegram as the primary human interface

Telegram becomes the primary operator interface for Jeremy.

The Telegram-connected OpenClaw agent should:

- capture the operator request
- show a structured assistant response
- surface proposed actions before execution
- show tool execution results
- show guardrails when a request is outside the safe tool set

An admin page can still be added later for visibility and status, but Telegram is the first-class interface.

### 3. Underlying reasoning/coding engine

OpenClaw is the control plane, not the underlying model.

The underlying reasoning/coding capability should remain Codex/GPT-5.4 class through the provider or ACP path that OpenClaw supports.

Why:

- this preserves the "deep codex 5.4" requirement
- OpenClaw gives Telegram and memory
- Codex/GPT-5.4 gives the strong reasoning and coding behavior

### 4. Safe EveryBible tool boundary

The agent should not directly "have database access." It should only be able to call approved EveryBible tools implemented by us.

Initial tool set for MVP:

- `get_homepage_content`
- `update_homepage_content`
- `list_recent_admin_actions`
- `get_translation_summary`
- `get_content_health_summary`

Potential second-wave tools after MVP:

- controlled verse-of-the-day draft creation/update
- controlled image metadata updates
- controlled translation status notes/local metadata updates

### 5. Site content override contract

The public site homepage is currently code-managed in `apps/site/lib/site-content.ts`.

Phase 10 should preserve that fallback while adding a remote content contract:

- keep the current static content as the deterministic fallback
- store optional admin-managed homepage content in Supabase
- have `apps/site` read the live override on the server and fall back to the code-managed content if no live payload exists

This gives the team a safe first version of "change the site from the site" without handing the model arbitrary repo write access.

### 6. Persistent memory

Use OpenClaw's durable memory path so the operator retains context across Telegram conversations.

The safest default is:

- OpenClaw session memory enabled
- Honcho-backed cross-session memory if OpenClaw recommends it for long-lived assistants
- concise memory content centered on preferences, repeated workflows, and trusted operating context

The agent should not store raw secrets in memory.

### 7. Auditability

Every operator-triggered mutation should write to EveryBible audit records with:

- actor identity
- action type
- target entity
- summarized user intent
- tool name
- changed fields

### 8. Code-change escalation path

If the operator is asked to make a real source-code change that falls outside the safe content/data tool set, it should:

- explain that the request requires a code workflow
- route into Codex/ACP or create a structured change request artifact
- optionally prepare a GitHub issue/PR draft path later

Phase 10 does not need fully autonomous, unaudited code editing from a browser prompt. The important behavior is honest routing with strong tooling, not magical overreach.

## Data Model Direction

Introduce a small, explicit homepage content contract in Supabase. One reasonable shape:

- `site_content_entries`
  - `id`
  - `slug` (start with `homepage`)
  - `status` (`draft`, `live`, `archived`)
  - `content` jsonb
  - `updated_by`
  - `updated_at`
  - `published_at`

Optional follow-up:

- `admin_ai_sessions`
- `admin_ai_messages`
- `admin_ai_tool_calls`

Those tables are helpful, but OpenClaw will own much of the conversational/session layer. They are not required for the first delivery if audit logging plus OpenClaw memory cover the primary traceability need.

## Delivery Strategy

### MVP

- add Phase 10 planning artifacts
- add OpenClaw workspace/bootstrap docs pinned to the latest stable release
- add Telegram and memory setup artifacts
- add an EveryBible OpenClaw plugin/tool package in-repo
- add homepage content table + migration
- add site-side remote homepage reader with safe fallback
- add EveryBible-safe mutation/read tools that OpenClaw can call
- add audit logging for operator mutations
- add basic tests for content normalization and tool execution

### Later

- admin-side operator UI/status surface
- broader tool coverage across translation/content modules
- GitHub issue or PR creation helpers for code-change requests
- approval workflow for higher-risk mutations

## Why this is the right cut

This gives the user what they asked for in a production-friendly way:

- an OpenClaw-based operator reachable from Telegram
- durable memory across sessions
- Codex/GPT-5.4-grade reasoning routed through the OpenClaw runtime
- real ability to change site content and approved data from the UI
- a credible path to broader operations
- guardrails that fit EveryBible's current architecture instead of fighting it
