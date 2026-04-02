# EveryBible OpenClaw Operator Setup

This runbook matches the Phase 10 OpenClaw operator plan: Telegram as the human-facing surface, durable memory, Codex-backed ACP escalation, and a narrow EveryBible tool boundary.

Bible delivery note: the mobile app now expects Bible text/audio assets to be published from the Cloudflare R2 asset base configured through `EXPO_PUBLIC_BIBLE_ASSET_BASE_URL`. Listening analytics and download analytics still land in Supabase for reporting, but the app now sends them through a Cloudflare collector that adds coarse IP-derived location before storage.

The example config in [config/openclaw/everybible-gateway.example.json](/Users/dev/Projects/EveryBible/config/openclaw/everybible-gateway.example.json) is JSON5 even though the file extension is `.json`.

## What You Need

- OpenClaw `2026.4.1`
- A Telegram bot token from `@BotFather`
- A local or managed OpenAI-compatible provider key for `openai/gpt-5.4`
- Optional Honcho API access if you want the extra cross-session memory layer
- The repo checkout that contains the EveryBible OpenClaw plugin package

## Install Or Upgrade

Use the current stable OpenClaw release:

```bash
npm i -g openclaw@2026.4.1
openclaw --version
```

If you prefer the interactive wizard, `openclaw onboard` works too. This runbook assumes you want a pinned, reviewable config file instead of a black-box setup flow.

Install the operator runtime pieces from the repo root:

```bash
openclaw plugins install acpx
openclaw plugins install -l ./packages/openclaw-everybible
```

If you want Honcho memory, install it too:

```bash
openclaw plugins install @honcho-ai/openclaw-honcho
```

## Configure Env Vars

Set these in your shell, `.env`, or whatever secret manager you use on the host:

- `EVERYBIBLE_OPERATOR_PROFILE` - optional, defaults to `everybible`
- `EVERYBIBLE_OPERATOR_GATEWAY_PORT` - optional, defaults to `18791`
- `EVERYBIBLE_OPERATOR_PLUGIN_ROOT` - optional, points the bootstrap at a persistent repo checkout when you are running it from a temporary worktree
- `OPENCLAW_GATEWAY_TOKEN` - the Gateway auth token used by the example config
- `OPENAI_API_KEY` - the key used for the main `openai/gpt-5.4` agent model
- `EVERYBIBLE_OPERATOR_MODEL_ID` - defaults to `openai-codex/gpt-5.4` when you reuse local Codex OAuth instead of an OpenAI API key
- `EVERYBIBLE_OPERATOR_TELEGRAM_BOT_TOKEN` - the Telegram BotFather token
- `EVERYBIBLE_OPERATOR_TELEGRAM_ALLOW_FROM` - the allowlisted Telegram sender as a plain numeric Telegram user ID
- `HONCHO_API_KEY` - optional, only if you use managed Honcho
- `HONCHO_BASE_URL` - optional, defaults to the managed Honcho URL or your self-hosted endpoint

OpenClaw also accepts env substitution directly in config strings, so the example file can stay pinned while secrets stay out of git.

If the host already has a working local Codex/OpenClaw OAuth setup and you do not want to add `OPENAI_API_KEY` on day one, the local bootstrap script will copy the existing auth profile into the isolated EveryBible profile and use `openai-codex/gpt-5.4` as the model ID. That is the path used on the local EveryBible host bring-up.

## Local Host Bootstrap

The repo now includes a repeatable local-host bootstrap:

```bash
bash scripts/openclaw/bootstrap-local-host.sh
```

Useful modes:

```bash
# Force first-run pairing mode if you still need to capture the Telegram sender ID.
bash scripts/openclaw/bootstrap-local-host.sh --pairing

# Or pin the numeric allowlist directly.
bash scripts/openclaw/bootstrap-local-host.sh --allowlist 8533856850
```

The script will:

1. verify the installed OpenClaw version
2. create an isolated `~/.openclaw-everybible` profile
3. install `acpx` and the local EveryBible plugin
4. reuse local Codex auth when `OPENAI_API_KEY` is not present
5. write a dedicated Telegram token file outside git
6. install/restart the profile-specific gateway service

## Configure Telegram

1. Create the bot in `@BotFather` with `/newbot` and copy the token.
2. Copy the example config to your OpenClaw config location:

```bash
cp config/openclaw/everybible-gateway.example.json ~/.openclaw/openclaw.json
```

3. Replace the placeholder Telegram sender ID in `channels.telegram.allowFrom` with your real numeric Telegram user ID.
4. Confirm `plugins.entries.everybible.enabled` stays `true`, because local workspace plugins are not auto-enabled.
5. Start with `dmPolicy: "pairing"` only if you still need to capture the sender ID once. After pairing, move back to the allowlist config in the example.
6. Restart the Gateway after each config change.

Telegram setup notes:

- `allowlist` is the steady-state operator mode for Jeremy.
- `pairing` is a bootstrap mode for first contact and approval.
- Group chats are intentionally disabled in the example so the first cut stays DM-only and easy to audit.

## Memory Baseline

Phase 10 go-live uses the bundled `memory-core` path by default.

That choice is intentional on this host: on OpenClaw `2026.4.1`, `memory-lancedb` now requires an explicit embeddings API key configuration, so it is no longer a zero-config default. `memory-core` still gives you file-backed local memory without adding another secret before Telegram + ACP are stable.

If you later want richer semantic recall:

- enable `memory-lancedb` only after you have an embeddings-capable API key available
- enable Honcho only after you have decided you want service-backed memory beyond a single trusted host

If you want Honcho as an extra memory layer:

1. Install the plugin.
2. Run:

```bash
openclaw honcho setup
```

3. Choose managed or self-hosted Honcho.
4. If you use managed Honcho, set `HONCHO_API_KEY` and `HONCHO_BASE_URL=https://api.honcho.dev`.
5. If you self-host Honcho, set only `HONCHO_BASE_URL` and leave the API key empty.
6. Turn the plugin on in `~/.openclaw/openclaw.json` by changing `"openclaw-honcho".enabled` to `true`.
7. Restart the Gateway.

Smoke test for memory:

- Send the operator one stable fact in Telegram.
- Restart the Gateway.
- Ask the same fact back in a new Telegram message.
- If you enabled Honcho, you should still get the remembered context instead of a blank response.

## ACP Codex Setup

The ACP side of the example is already pinned to:

- `acp.enabled: true`
- `acp.backend: "acpx"`
- `acp.defaultAgent: "codex"`
- `acp.allowedAgents: ["codex"]`

That means code-work escalation stays explicit and reviewable instead of mutating files or production data from the Telegram operator itself.

Verify the backend after startup:

```bash
/acp status
/acp doctor
```

Smoke test for Codex escalation:

1. In Telegram DM, send `/acp spawn codex --bind here`.
2. Ask it to summarize the repo state or outline the next safe code change.
3. Confirm that the result is an ACP session or bound chat response, not a direct file edit.

If you later use Telegram forum topics or threaded chats, add the Telegram thread-binding settings from the OpenClaw docs. The DM-only setup here does not need them.

## Pairing And Approval Flow

Use this when you are onboarding the bot for the first time:

1. Set Telegram DM policy to `pairing` temporarily.
2. Restart the Gateway.
3. Send the bot a Telegram DM.
4. Approve the pending request:

```bash
openclaw pairing list telegram
openclaw pairing approve telegram <CODE>
```

5. Read the numeric sender ID from the pairing result.
6. Put that ID into `EVERYBIBLE_OPERATOR_TELEGRAM_ALLOW_FROM` as `tg:<numeric-id>`.
7. Switch the config back to `dmPolicy: "allowlist"`.
8. Restart the Gateway again.

That gives you a one-time bootstrap path and a steady-state allowlist.

## Smoke Tests

Run these after every config change:

```bash
openclaw doctor
openclaw gateway restart
openclaw health
openclaw status
openclaw plugins status
```

Then verify the runtime path in Telegram:

- Send a normal DM from the allowlisted account and confirm the bot replies.
- Send a message that should invoke an EveryBible tool and confirm the operator uses the narrow tool surface instead of claiming raw repo or SQL authority.
- Run `/acp status` and `/acp spawn codex --bind here` to confirm the Codex escalation path is active.
- Visit `https://everybible.app` and confirm the floating AI launcher appears in the bottom-right and opens the configured Telegram chat target.

## Verification

Repo-side verification:

```bash
bash -n scripts/openclaw/bootstrap-local-host.sh scripts/openclaw/verify-local-host.sh
npm run operator:typecheck
npm run operator:test
node --test --import tsx apps/site/lib/operator-launcher.test.ts
npm run site:typecheck
```

Host-side verification:

```bash
bash scripts/openclaw/verify-local-host.sh
```

If a Telegram message is not delivered or the bot does not answer, inspect the logs:

```bash
openclaw logs
```

## Safe Restart And Health Checks

Use the smallest safe loop:

1. Edit `~/.openclaw/openclaw.json`.
2. Run `openclaw doctor` to catch schema or legacy-state problems.
3. Restart with `openclaw gateway restart`.
4. Confirm `openclaw health` passes.
5. Confirm `openclaw status` shows the expected channels, plugins, and ACP backend.

If you need a repair pass, prefer `openclaw doctor --yes` first. Use `--repair --force` only when you intentionally want OpenClaw to overwrite custom supervisor or install state.

## Notes

- Keep the Gateway token private.
- Keep Telegram allowlists explicit and numeric.
- Keep Honcho optional unless you actually want service-backed cross-session memory.
- Keep source-code edits out of the live operator path; the ACP/Codex flow is for reviewable change requests only.

## References

- [Telegram channel docs](https://docs.openclaw.ai/channels/telegram)
- [Pairing docs](https://docs.openclaw.ai/start/pairing)
- [Gateway configuration reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Plugins docs](https://docs.openclaw.ai/tools/plugin)
- [Honcho memory docs](https://docs.openclaw.ai/concepts/memory-honcho)
- [ACP agents docs](https://docs.openclaw.ai/tools/acp-agents)
- [Doctor docs](https://docs.openclaw.ai/gateway/doctor)
