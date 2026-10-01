# Mutation testing — 2026-10-01

Branch `sprint/mutation-tests` (from `claude/deep-optimization-sprint-88be80`). The question: which
tests still pass when the code they cover is broken, in the modules where a bug costs users data or
trust — account-scoped private data, sync, reading-plan progress, audio downloads, offline text
packs, and auth.

**Result.** Before: 77.8% of 3,086 mutants were killed; 613 survived every test that reached them
and 72 were reached by no test at all. After: every mutant that changes behaviour is killed except
29 in exported reading-plan functions that nothing in the app calls (see "Dead code"). The other
survivors (205) are equivalent mutants, recorded with a one-line reason each in
`scripts/mutation-equivalents.json` so a rerun skips them. About 230 new tests in 23 files did it
(8 of them new, all behavioural: real modules, asserted outputs and state, no source-text checks).

**No production bug turned up.** Every behaviour-changing survivor was a path no test pinned, not a
wrong line. The one bug found was in the mutation tooling itself (keys for equivalent mutants could
drift onto a different mutant; fixed, see below).

## Results

`killed` includes timeouts (a mutant that makes a test hang). Score = killed / (killed + survived +
uncovered); equivalents are left out of the "after" score only. "Before" is the first run against
the branch point; "after" is the final run against the branch head, which also contains the sprint
base merged in during the work (`progressStore`'s write gate moved to `unchangedStateStorage.ts`,
`readingPlanActivity` gained ledger-date helpers, `privateDataScope`'s `setItem` gained a return
value), so a few totals differ.

| Module (under `src/`)                        | Mutants (before → after) | Before: killed / survived / uncovered | Before score | After: killed / survived / uncovered / equivalent | After score |
| -------------------------------------------- | ------------------------ | ------------------------------------- | ------------ | ------------------------------------------------- | ----------- |
| `stores/privateDataScope.ts`                 | 160 → 162                | 130 / 27 / 3                          | 81.3%        | 150 / 0 / 0 / 12                                  | 100.0%      |
| `stores/privateDataAdoption.ts`              | 85 → 85                  | 57 / 27 / 1                           | 67.1%        | 75 / 0 / 0 / 10                                   | 100.0%      |
| `stores/progressStore.ts`                    | 160 → 147                | 138 / 22 / 0                          | 86.3%        | 142 / 0 / 0 / 5                                   | 100.0%      |
| `stores/unchangedStateStorage.ts`            | — → 13                   | —                                     | —            | 13 / 0 / 0 / 0                                    | 100.0%      |
| `services/sync/syncMerge.ts`                 | 383 → 383                | 295 / 67 / 21                         | 77.0%        | 367 / 0 / 0 / 16                                  | 100.0%      |
| `services/sync/syncCycle.ts`                 | 24 → 24                  | 18 / 5 / 1                            | 75.0%        | 24 / 0 / 0 / 0                                    | 100.0%      |
| `services/sync/syncService.ts`               | 371 → 371                | 288 / 71 / 12                         | 77.6%        | 345 / 0 / 0 / 26                                  | 100.0%      |
| `services/sync/syncIdentity.ts`              | 23 → 23                  | 22 / 1 / 0                            | 95.7%        | 23 / 0 / 0 / 0                                    | 100.0%      |
| `stores/readingPlans/planProgressModel.ts`   | 56 → 56                  | 45 / 11 / 0                           | 80.4%        | 53 / 0 / 0 / 3                                    | 100.0%      |
| `services/plans/readingPlanActivity.ts`      | 285 → 290                | 220 / 60 / 5                          | 77.2%        | 266 / 0 / 0 / 24                                  | 100.0%      |
| `services/plans/readingPlanModel.ts`         | 378 → 378                | 270 / 92 / 16                         | 71.4%        | 320 / 16 / 13 / 29                                | 91.7%       |
| `services/audio/download/orchestrator.ts`    | 253 → 253                | 174 / 75 / 4                          | 68.8%        | 221 / 0 / 0 / 32                                  | 100.0%      |
| `services/audio/download/jobRegistry.ts`     | 104 → 104                | 85 / 18 / 1                           | 81.7%        | 95 / 0 / 0 / 9                                    | 100.0%      |
| `services/audio/download/chapterTransfer.ts` | 113 → 113                | 87 / 24 / 2                           | 77.0%        | 106 / 0 / 0 / 7                                   | 100.0%      |
| `stores/bible/textPackInstallModel.ts`       | 112 → 112                | 97 / 15 / 0                           | 86.6%        | 108 / 0 / 0 / 4                                   | 100.0%      |
| `stores/bible/textPackJournalRecovery.ts`    | 127 → 127                | 118 / 9 / 0                           | 92.9%        | 125 / 0 / 0 / 2                                   | 100.0%      |
| `services/auth/authErrors.ts`                | 144 → 144                | 113 / 31 / 0                          | 78.5%        | 138 / 0 / 0 / 6                                   | 100.0%      |
| `stores/authStore.ts`                        | 308 → 308                | 244 / 58 / 6                          | 79.2%        | 288 / 0 / 0 / 20                                  | 100.0%      |
| **Total**                                    | 3086 → 3093              | 2401 / 613 / 72                       | 77.8%        | 2859 / 16 / 13 / 205                              | 99.0%       |

Remaining non-equivalent survivors: the 29 in `readingPlanModel.ts`'s dead code. Leaving out the
mutants later found equivalent, the before score was 83.3%.

## What the survivors were

Each item is a way the code could break — a surviving mutant did exactly this — with every test
still passing. The shipped code was right in every case; what was missing was the test.

### Account-scoped private data

- **Cold start.** If every private-store write before the first owner switch were dropped
  (`writesSuspended` starting `true`), no test failed: every test file relaunched the scope first.
  New `privateDataScope.coldStart.test.ts`.
- **A refused adoption** (the account bucket would not take the guest data) could lose its pending
  account, so the guest's notes went to whichever account signed in next, or the account showed the
  guest bucket after a relaunch. Deleting that account could keep its claim on the guest data.
- **A kill while emptying the adopted guest bucket**, during a sign-in or during a marker upgrade,
  could leave the adopted notes for the next guest; a marker upgrade could drop an unfinished
  adoption; malformed `adoptingInto` / `scopedStores` values were trusted.
- **Persisted contracts were unpinned**: the marker key `private-data-owner`, the four stores the
  first scoped builds covered, and the version on a merged progress envelope (any version but 0
  makes zustand discard the whole merged ledger on hydration, since the store has no `migrate`).
- `mergeGuestProgress` had no direct test: the streak could follow the older side, a side that never
  read, or the shorter run on the same day.
- `progressStore`'s "a no-op mutation does not rewrite storage" test could never fail: the MMKV
  adapter already skips an unchanged value, so counting writes proved nothing. It now asserts no
  read either.
- The return value the base's MMKV-retry fix gave `privateDataStorage.setItem` (`false` when the
  write did not land, so the unchanged-slice gate retries it) had no test.

### Auth

- `authStore`: a first sign-in could delete the guest's notes, library, Gather and progress when
  no screen had loaded those stores yet (the guest bucket is cleared after adoption). Also
  unpinned: a stale `expectedOwner` signing out a newer sign-in of the same
  account, the push token of a sign-in made while sign-out started, a SIGNED_OUT heard mid-restore
  being undone, the restore-retry budget, and a repeated identical preference sync re-rendering
  and rewriting the auth blob.
- `authErrors`: every `&&` guard in the error readers could become `||` — `null`, `undefined` or a
  primitive thrown into a `catch` would then make the mapper itself throw.

### Sync

- `syncMerge`: the three-way preference merge against the sync base (servers without per-field
  stamps) and `mergePreferences` with no server row were never executed. Pinned the server rules
  `merge_user_progress` enforces (limits, a NULL streak counting as 0, a position stamp exactly one
  day ahead), a remote position on a book's last chapter (JUD 1, PSA 150, REV 22) being accepted,
  and agreed values keeping the right stamp (the local ISO shape of the same instant re-uploads
  forever).
- `syncCycle`: a follow-up sync that throws could leave its callers waiting forever; a burst of requests
  must collapse into one follow-up that runs the latest.
- `syncService`: an account switch at each guarded step (between the auth check and the profile
  write, after the merge commits, during a refused stamped upload, as the plan pull starts); the
  plain-upsert fallback for servers without the position-stamp columns; the 42703 retry for
  preferences; the transient-retry jitter window.

### Reading plans

- `planProgressModel`: a session tick on a row stored before `completed_sessions` existed would
  throw; the re-join floor; the day-1 floor.
- `readingPlanModel`: legacy server rows restoring without defaults, a one-day plan never counting
  as complete, completion times with a UTC offset compared as text, the 4 a.m. cut-off for last
  night's reading, impossible dates (30 February, month 13) in recurring and seasonal counts, and
  whether a joined seasonal plan still shows judged on the local rather than the UTC day
  (`readingPlanModel.timezone.test.ts`).
- `readingPlanActivity`: rhythm queueing at plan boundaries, recurring vs fixed resume lookups,
  part-way day summaries, plan day labels following the in-app language; and the base's new
  `getPlanLedgerDayDate`, whose past days could have been dated from today without a failing test.

### Audio downloads

- `chapterTransfer` and `jobRegistry` had no direct tests; 31 `chapterTransfer` mutants were only
  "caught" by service tests hanging until the timeout. New unit tests pin the backoff (1 s, then
  2 s), a cancel during a backoff rejecting at once, no abort listeners left after a retry
  (`getEventListeners`), and concurrency of 1, 0 or a negative number. In `jobRegistry`, a truncated
  translation job id would have counted as owning every book download of that translation.
- `orchestrator` (new `orchestrator.test.ts`, injected seams only): a cancel landing while the job
  is being marked completed could report success; a cancelled run could still report progress, look a
  chapter up (an offline cancel turning into a failure) or persist its job as completed; the
  out-of-space message counted chapters already finished; collection progress dropped finished
  chapters whose rounded percentage did not move; overlapping collection runs of one translation.

### Offline text packs

- `textPackJournalRecovery`: a legacy `<id>.db` with no rollback file not being adopted; a
  container-move rebase of a still-pending journal not being saved (deleting the translation would
  then miss the real files); a deletion that covers some of an install's paths resurrecting it; a
  failed recovery restoring the wrong rows; the back-off boundary.
- `textPackInstallModel`: an unknown transfer length (`-1`, as native downloaders report it)
  could show 0% for the whole download instead of falling back to verse progress; the journal's
  `previousPath` re-anchoring after a container move.

## Equivalent mutants

205 survivors cannot change behaviour. The common kinds:

- **A fallback that gives the same answer**: `JSON.parse(undefined)` throws into the same `catch`
  that returns `null`; `Date.parse('')` and `Date.parse('__mutant__')` are both `NaN`;
  `clampPercent(NaN)` is `0`.
- **Counters and caches compared only with themselves** (`droppedWrites`, `authChangesApplied`,
  `authGeneration`, run-id counters).
- **Boundaries where the values can't be equal**: `>` vs `>=` inside a branch that already knows
  they differ; a `-1` sentinel no clamped percentage can equal.
- **`null` vs `undefined`** where every reader uses `??`, `?.` or a truthiness check.
- **Unreachable branches given every caller** (for example `getRhythmDayNumber`'s finished-plan
  branch: its only caller skips finished plans first).
- **Comparator signs**: a sort comparator returning 2 instead of 1. One case
  (`privateDataAdoption`'s note ordering, 0 instead of 1) was checked equivalent on V8 only;
  Hermes's sort may differ.

## Dead code and other things noticed (not changed)

- **Dead code** in `src/services/plans/readingPlanModel.ts`: `getPlanSessionOrder` and its helper
  `normalizePlanSessionOrder` (28 survivors) and `planCompletionPercent` (1) are exported and called
  only from tests; `getVisiblePlanDayNumbers` is also unused. Deleting them would remove the last
  29 survivors.
- `readingPlanActivity.ts` `getRhythmDayNumber`: the `is_completed` branch is unreachable.
- `textPackJournalRecovery.ts` L280: the second clause of the install-removal condition is
  redundant.
- `syncMerge`'s `positionSource` and `syncService`'s `SyncResult.merged` are returned but never
  read by the app.
- `syncService`: the profile step in `syncProgress`, `syncPreferences` and `pullFromCloud` runs
  outside their `try`, so a `getUser` that threw (supabase-js normally returns the error instead)
  would reject the standalone call rather than return a failure.
- `authStore.signOut()` with no user in the store resets the guest's preferences and plans. No
  caller does that today.
- Mutants still caught only by a test hanging until the timeout: `syncService` 44, `authStore`
  33, `orchestrator` 23, `textPackJournalRecovery` 9, `syncCycle` 7, `readingPlanActivity` 6.
  They are killed, but a test that failed fast would say what broke.

## The tooling bug

Equivalents were first keyed by operator, text and source line plus an occurrence number among
identical lines in the whole file. The sprint base's MMKV-retry fix turned one `return;` in
`privateDataScope.ts` into `return false;`, which renumbered the next identical `return;`: the
recorded equivalent (the removeItem guard) silently moved onto the owner-switch early return,
which would then never have been run. Keys now include the enclosing named declarations
(`privateDataStorage.removeItem`) and count occurrences within them; all entries were re-keyed
against the source they were recorded on. The script also warns about entries that no longer match
any mutant, which is how the progressStore entry whose code moved into `unchangedStateStorage.ts`
was found and removed.

## How the mutation run works

Stryker has no runner for Node's built-in test runner, so `scripts/mutate.ts` does the job with
the TypeScript compiler API.

**Mutants** (`scripts/mutation/mutants.ts`). One text edit each:

| Operator               | What it does                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `relational-boundary`  | `<` ↔ `<=`, `>` ↔ `>=`                                                                                                           |
| `equality-flip`        | `===` ↔ `!==`, `==` ↔ `!=`                                                                                                       |
| `negate-condition`     | `if (c)` / `while (c)` / `c ? a : b` → `!(c)` (skipped where `remove-negation` or `equality-flip` already gives the same mutant) |
| `remove-negation`      | `!x` → `x`                                                                                                                       |
| `logical-swap`         | `&&` ↔ `\|\|`                                                                                                                    |
| `nullish-drop-default` | `a ?? b` → `a`                                                                                                                   |
| `arithmetic-swap`      | `+` ↔ `-`, `*` ↔ `/`, `%` → `*`, `+=` ↔ `-=` (not on string concatenation)                                                       |
| `update-swap`          | `++` ↔ `--`                                                                                                                      |
| `boolean-literal`      | `true` ↔ `false`                                                                                                                 |
| `number-literal`       | integers ±1 (`0` → `1`); larger than 10 only where compared or offset                                                            |
| `string-literal`       | `'x'` → `''`, `''` → `'__mutant__'`                                                                                              |
| `math-swap`            | `Math.max` ↔ `Math.min`, `floor` ↔ `ceil`                                                                                        |
| `method-swap`          | `some` ↔ `every`, `startsWith` ↔ `endsWith`, `toLowerCase` ↔ `toUpperCase`                                                       |
| `remove-statement`     | a call / assignment / `++` statement anywhere; a `return` / `throw` / `break` / `continue` inside an `if`                        |
| `early-return`         | `return;` as the first statement of a function that returns no value                                                             |

Never mutated: types, imports/exports, enums, logging calls (`console.*`, `log*`, `report*`,
`captureException`, …), `new …Error(…)` arguments, and `if (__DEV__ …)` blocks. Mutants that no
longer parse are reported as `invalid` and not run.

**Which tests run.** The script builds the relative-import graph of `src/` and `scripts/` and walks
it backwards from the module: tests that import it directly, widened one import hop at a time
while fewer than three are found (a module reached only through a facade, like the audio download
internals, has no direct tests). When those leave mutants uncovered, the next 40 tests further out
are measured once and kept if they reach that code. `*Source.test.ts` import-graph guards are left
out by default:
they read the source text, so they "kill" mutants without testing any behaviour.
`--include-source-tests` puts them back.

**Coverage probes** (`scripts/mutation/coverage.ts`). Before any mutant runs, every selected test
file runs once against a copy of the module with a probe in front of each statement that holds a
mutant. Each mutant then runs only the test files that reached its statement; a test that never
reached it would run the mutant exactly like the original. A mutant no test reaches is reported as
`uncovered` without running anything. A test that fails only when instrumented is assumed to
reach everything. On `privateDataScope.ts` this gave the same 30 survivors as the uninstrumented
run in 1 m 43 s instead of about 8 minutes.

**Isolation.** Each worker gets a copy-on-write clone of the repository (APFS `clonefile`, `cp`
elsewhere) under the OS temp directory, with `node_modules` symlinked. Mutants are written there,
never into the checkout, the original is restored after every mutant, and the clones are deleted
when the run ends (also on Ctrl-C). Each worker has its own `TMPDIR`, so tsx keeps a small private
cache instead of walking the shared one on every miss.

**Outcome.** A mutant is `killed` when a test file fails, `timeout` when a test file runs past four
times its baseline (at least 20 s) — counted as killed, since the suite would hang — and
`survived` when every test that reaches it passes. The score is
(killed + timeout) / (killed + timeout + survived + uncovered).

**Equivalents.** `scripts/mutation-equivalents.json` lists mutants that cannot change behaviour,
each with the reason, keyed by operator + original + replacement + the trimmed source line + the
enclosing named declarations (so the key survives edits elsewhere in the file). They are reported
as `equivalent` and not run, and the script warns about entries that no longer match a mutant.

## Re-running

```bash
# One module, every mutant (prints survivors as it goes)
node --import tsx scripts/mutate.ts src/stores/privateDataScope.ts

# Several modules, results as JSON
node --import tsx scripts/mutate.ts src/services/sync/syncMerge.ts src/stores/authStore.ts \
  --jobs 8 --json /tmp/mutation.json

# Re-check specific mutants after writing a test (ids are stable while the source is unchanged)
node --import tsx scripts/mutate.ts src/stores/authStore.ts --ids 12,40,41 --verbose

# Just list the mutants and the tests that would run
node --import tsx scripts/mutate.ts src/stores/authStore.ts --list
```

Other options: `--tests a.test.ts,b.test.ts` (run these instead of the discovered tests),
`--operators negate-condition,logical-swap`, `--lines 100-180`. The default is one worker per CPU
core minus one; use fewer when the machine is busy. `scripts/mutation/mutants.test.ts` covers the
generator and the probes and runs with `npm test`.

## Limitations

- A kill only means a test file failed. On a heavily loaded machine a flaky test can "kill" a
  mutant; every selected test must pass unmutated first, which keeps this rare but not impossible.
- Timeouts count as kills (see above).
- The operator set is deliberately small: no object/array-literal, optional-chaining or argument
  mutations, and statement deletion only for calls, assignments and `return`/`throw`/`break`/
  `continue` inside an `if`. A 100% score here is not a proof the tests are complete.
- Coverage is per statement and conservative: a mutant inside a long condition counts as reached
  when the statement is.
- Test selection follows relative imports. A test that reaches a module only through a computed
  `require` path is missed unless `--tests` names it; widening by import distance covers the
  common indirect cases.
- Equivalence is a judgement, recorded with its reason so it can be challenged; several rely on how
  the current callers use a function and would need re-checking if a new caller appeared.
