## Working Preferences

- Default to token-efficient work in every session and chat unless explicitly told otherwise.
- Prefer cheaper/scoped approaches first: `gpt-5.4-mini` style work for exploration, repo scans, status checks, simple edits, and bounded tasks.
- Escalate to heavier reasoning only when the task is ambiguous, risky, cross-cutting, or release-critical.
- Keep responses concise, avoid unnecessary back-and-forth, and minimize tool usage and output volume where possible.
- In EveryBible, support terse workflow shorthands:
  - `polish sim: ...` for a small UI tweak plus simulator update only
  - `sim check: ...` for simulator inspection only
  - `ship main` for safely landing the current scoped change on local and remote main
  - `ship tf internal` for the clean-worktree internal TestFlight flow
- For tiny follow-up UI tweaks, assume the target is the most recently discussed screen/component unless the user redirects it.

## R2 Publishing

- EveryBible Bible assets publish to the Cloudflare R2 bucket `everybibleapp` at `https://9ebfac5a12f408afc1d80eaa2138ffd3.r2.cloudflarestorage.com`.
- For R2 syncs, force `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` explicitly in the command environment so the CLI does not fall back to stale shell credentials.
- Do not store or repeat raw access keys in memory files.

## EveryBible UI Invariants

- The plan/day read-mode reader is locked to the regular shared floating playback dock design and behavior.
- In read mode, the dock must float above the red plan banner exactly like the normal reading screen; the red banner is info-only and must not contain the play button.
- Do not change that plan reader dock layout or interaction model unless the user explicitly asks for it.

## Simulator Screenshot Rule

- Do not reference or try to render simulator screenshots from ephemeral temp paths like `/var/folders/.../T/...` in user-facing replies.
- If a simulator screenshot needs to be inspected or shown, capture a fresh one or copy it to a stable path first, then reference that stable file.
