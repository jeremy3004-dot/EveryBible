# Codex Handoff Template

Use this when handing EveryBible work from Codex/Hermes to another session, model, or human.

Keep it short, concrete, and evidence-backed. Prefer facts from the repo and tool output over guesses.

## Lightweight Handoff

```md
- Repo: EveryBible
- Path: /Users/dev/Projects/EveryBible
- Area: mobile | site | admin | supabase | release
- Work type: feature | bugfix | TestFlight/release | investigation
- Branch: ...
- Working tree: clean | intentionally dirty
- Active thread: ...
- Goal: ...
- Done so far: ...
- Still broken / unfinished: ...
- Active bug / error: ...
- Files involved: ...
- Scripts used: ...
- Checks run: ...
- Passed: ...
- Failed: ...
- Not run: ...
- Relevant links: ...
- Env / secrets involved: ...
- Constraints / don’t do this: ...
- Next recommended step: ...
```

## What Good Looks Like

### 1. Repo and path

- Include the exact repo name.
- Include the exact working directory.
- If the repo is acting like a monorepo, call out the exact app/package touched.

Example:

```md
- Repo: EveryBible
- Path: /Users/dev/Projects/EveryBible
- Area: mobile
```

### 2. Task state

- Say what you were trying to do in one sentence.
- Separate `Done so far` from `Still broken / unfinished`.
- If the work split into multiple threads, say which one is the active one.
- If there is a concrete failure, include the exact active bug or error text.

Prefer:

```md
- Active thread: bundled plan delete/day-progress regression
- Goal: fix bundled reading-plan delete and day-progress regressions in mobile
- Done so far: added local-first guards and regression coverage around plan activity/model code
- Still broken / unfinished: no clean verification pass yet; delete path still needs device-level confirmation
- Active bug / error: `invalid input syntax for type uuid: "bible-in-30-days"`
```

Not:

```md
- Goal: worked on some plans stuff
```

### 3. Git context

- Record the current branch.
- Say whether the worktree is intentionally dirty.
- Note whether there are uncommitted changes.
- Include a PR link if one exists.
- If useful, include the last known good commit for the touched area.

Recommended commands:

```bash
git status --short --branch
git diff --stat
git log --oneline --decorate -5
gh pr view --json url,number,title,headRefName,baseRefName,state,isDraft
```

### 4. Important files

Group files by role instead of dumping a giant list:

- docs relied on
- files already edited
- files known to be relevant

For EveryBible, the most common high-signal files are:

- `AGENTS.md`
- `CLAUDE.md`
- `HERMES_CODEX.md`
- `README.md`
- `docs/release-smoke-checklist.md`
- `docs/testflight-build-visibility-playbook.md`
- `docs/plans/*.md`
- `src/screens/...`
- `src/services/plans/...`
- `src/stores/...`
- `scripts/testflight_*`

### 5. Verification status

Always distinguish between:

- commands actually run
- what passed
- what failed
- what was not run

If something failed, include the exact error text.

Prefer:

```md
- Checks run: `npm run lint`, `npm run typecheck`, `node --test --import tsx src/services/plans/readingPlanActivity.test.ts`
- Passed: lint, typecheck
- Failed: targeted plan delete repro still shows `invalid input syntax for type uuid: "bible-in-30-days"`
- Not run: simulator verification, release scripts
```

### 6. Pickup speed

End the handoff with the one thing the next session should do first.

Prefer:

```md
- Next recommended step: run the targeted plan activity/model tests, then confirm delete flow in simulator with a bundled slug-based plan
```

This prevents a handoff from ending with context but no clear starting move.

### 7. External context

Call out only the external systems that matter to the current task:

- GitHub issue / PR / Linear / Notion link
- Supabase project context
- TestFlight / ASC context
- Cloudflare / R2 / deployment context
- env var or secret names needed to continue

Never paste secret values unless the task truly requires it.

For EveryBible, especially useful:

- App Store Connect app ID: `6758254335`
- EAS project ID: `cfbf2bac-d680-448f-b2aa-33c4c01ad15b`
- R2 bucket: `everybibleapp`
- env names like `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

### 8. Constraints / don’t do this

Write down the traps.

Examples:

- Do not move the plan/day play button into the red banner.
- Do not make mobile plan catalog rendering depend on remote `reading_plans`.
- Do not send slug plan ids into UUID-only Supabase paths.
- Do not “clean up” unrelated dirty files in this repo.

## EveryBible-Specific Add-Ons

If the task touches one of these areas, add the matching line:

### Mobile / plans / reader work

```md
- Reader/plan invariant: plan/day read mode must use the normal floating playback dock above the red banner
```

### Supabase work

```md
- Supabase assumption: mobile plan catalog is local-first; remote sync is for user state, not catalog truth
```

### TestFlight / release work

```md
- Release rule: upload alone is not done; verify intended tester/group visibility
- Release scripts used: `npm run testflight:build-local`, `bash scripts/testflight_precheck.sh ...`, `npm run testflight:submit-and-verify`
```

### R2 / asset publishing work

```md
- R2 rule: inject `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` explicitly in the command environment
```

## Copy-Paste Version

```md
- Repo:
- Path:
- Area:
- Work type:
- Branch:
- Working tree:
- Active thread:
- Goal:
- Done so far:
- Still broken / unfinished:
- Active bug / error:
- Files involved:
- Scripts used:
- Checks run:
- Passed:
- Failed:
- Not run:
- Relevant links:
- Env / secrets involved:
- Constraints / don’t do this:
- Next recommended step:
```
