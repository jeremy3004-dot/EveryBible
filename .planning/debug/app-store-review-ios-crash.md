---
status: investigating
trigger: "Investigate an iOS App Store review crash for EveryBible. Focus only on the two Apple crash logs and produce a root-cause hypothesis with evidence, no code changes unless clearly needed."
created: 2026-04-08T16:57:54+05:45
updated: 2026-04-08T16:57:54+05:45
---

## Current Focus

hypothesis: Both Apple review crashes are the same startup-time exception triggered on the main thread while decoding or reconstructing an Objective-C object from serialized state.
test: Compare the two .ips logs for matching exception signatures, top app frames, and timing; then symbolicate app offsets against the release binary if possible.
expecting: If both logs match, we should see the same EXC_CRASH/SIGABRT with NSException/NSCoder-related frames and identical app offsets near launch or foreground resume.
next_action: inspect both crash logs fully and extract matching stack evidence

## Symptoms

expected: App should launch and operate normally during App Store review without crashing.
actual: App crashes during App Store review on iOS, based on two Apple .ips crash logs.
errors: Apple crash logs at /Users/dev/Downloads/crashlog-89674248-2903-416C-AB86-4E30E8B1575F.ips and /Users/dev/Downloads/crashlog-E9007C61-EE2E-4EC2-8D1F-9303EA4A6B2B.ips
reproduction: Unknown exact reviewer steps; available evidence is limited to the two Apple crash logs.
started: Observed in App Store review for build 307 / version 1.0.0

## Eliminated

## Evidence

- timestamp: 2026-04-08T16:57:54+05:45
  checked: workspace state
  found: Repository worktree is dirty in unrelated locale and Bible reader files before investigation begins.
  implication: Investigation should remain read-only and must not assume those local changes are related to the App Store crash.

## Resolution

root_cause: 
fix: 
verification: 
files_changed: []
