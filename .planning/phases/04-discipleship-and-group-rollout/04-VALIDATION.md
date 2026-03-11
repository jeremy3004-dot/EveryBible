# Phase 04 Validation

## Goal

Validate that the learn/disciple surface becomes reachable in the live app first, then that group behavior is reconciled without silently discarding local data or overpromising synced capabilities.

## Risk Areas

### 1. Live Shell Reachability

- Risk: `LearnStack` remains orphaned even after Phase 4 starts, leaving DISC-01 unmet despite the screens already existing.
- Validation: verify the active tab shell mounts the learn surface directly and exposes the translated Harvest tab label.

### 2. Navigation Regression

- Risk: adding the learn surface to the root shell accidentally disturbs existing tab order or type contracts.
- Validation: keep tab-shell configuration explicit and add a focused regression test around tab order/label mapping.

### 3. Local Group Data Loss

- Risk: synced group rollout accidentally hides or drops locally persisted groups already stored in `useFourFieldsStore`.
- Validation: Phase 4 must preserve local groups until there is an explicit migration or dual-source presentation strategy.

### 4. Sync Capability Mismatch

- Risk: the app turns on synced group UX without the live screens actually consuming Supabase services.
- Validation: any synced-group UI must be backed by the real service path and protected by configuration/auth checks.

### 5. Group Session Permission Assumptions

- Risk: group session capture looks complete in UI but bypasses backend rules or unauthenticated protections.
- Validation: Phase 04-03 should exercise `recordSyncedGroupSession`, group membership assumptions, and failure handling before claiming GROUP-02 progress.

## Evidence Expectations

- A focused automated test protects the root tab shell from dropping the learn surface again.
- Lint and existing app tests stay green after the learn surface is mounted.
- Later group plans include explicit verification against both the local `useFourFieldsStore` path and the synced Supabase service path.
