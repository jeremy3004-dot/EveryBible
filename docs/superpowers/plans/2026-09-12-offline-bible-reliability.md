# Reliable offline Bible downloads: assessment and implementation map

**Status:** Implemented locally; automated and iOS simulator gates are being recorded. Physical-device, release, and pilot gates remain open. The implementation was reviewed at key stages by an Astra medium agent; the latest review is read-only and informs the remaining-risk notes.

**Goal:** A person can download a Bible in their chosen language, cancel or retry honestly, and return to usable scripture after an interruption or offline restart without losing an already usable copy.

**Architecture:** Keep the existing Expo, SQLite, Zustand/MMKV, and catalog services. The lifecycle coordinator is implemented across `cloudTranslationService.ts`, `bibleStore.ts`, and the MMKV journal rather than as a new standalone file. Text downloads have explicit operation ownership, unique verified candidate paths, per-translation mutation serialization, durable deletion tombstones, and interrupted-install reconciliation before a Bible is declared missing. The current reader and audio architecture remains in place.

**Baseline:** Inspected local `main` at `e8ceccee76bac4aa91dfcf383ad40dc72ea63974` on September 12, 2026. Existing uncommitted public-site work was present. Rebase this assessment against the checkout used for any future implementation.

**Execution boundary:** Jeremy explicitly authorized implementation after the planning pass. This document now records the executed local work and its evidence; publishing still requires a separately authorized deployment task under the repository handoff rules.

## 1. The greatest need and why it comes first

**Finish the reliability of the offline Bible download lifecycle, then prove the complete journey on current iOS and Android builds.**

The intended outcome is concrete: “The Bible I downloaded is still here, in my language, when the internet is gone.” This is central to the product's stated purpose and affects the usefulness of everything built around scripture access.

This is a priority judgment from current repository evidence, not a claim that production analytics establish downloads as the largest abandonment funnel. No current customer interviews, store crash reports, or live funnel metrics were retrieved. If a current user study shows a more consequential blocker, reprioritize with that evidence.

| Candidate priority | Evidence and value | Decision |
| --- | --- | --- |
| Complete reliable offline downloads and recovery | Concrete cancellation and recovery gaps in the active text-download path; directly serves low-connectivity use | First |
| Add more translations, plans, or Gather features | Valuable breadth; the app already contains substantial content and features, including recently audited reading plans | Follow once access to installed content is dependable |
| More visual/performance polish | Recent maintenance has already improved these areas; physical-device measurements remain useful | Address measured problems during verification, avoid a general redesign |
| More analytics or a new crash-reporting service | Existing usage collection and local crash logs already provide a starting point | Use existing evidence channels for this project; assess remote crash reporting separately |

The old roadmap and July Compass provide product direction but lag September implementation. Unchecked historical phases are not sufficient evidence that a feature is absent.

## 2. Findings that support the recommendation

All code findings below were traced in the current checkout. They have not been reproduced on a device during this planning task.

| Finding | Current evidence | User consequence / qualification |
| --- | --- | --- |
| Text Cancel does not cancel the underlying text operation | `TranslationPickerList.tsx` exposes Cancel for text; `bibleStore.ts:999` only cancels an audio job when a job ID exists. The text path uses `FileSystem.downloadAsync` and has no cancellation generation checks | Clearing visible progress can be followed by late installation and automatic selection/closing of the picker |
| Interrupted replacement has no automatic backup recovery | `cloudTranslationService.ts:78` moves installed files to `.rollback`, promotes staging, then deletes the backup; an existing backup causes a recovery-required error | A process kill bypasses `catch` cleanup. A recoverable old Bible can be stranded. Normal already-installed downloads currently no-op, so this is a replacement/repair/service-path risk, not proof every app update hits it |
| File success and saved installation state are separate | The installer returns its final path before `bibleStore.ts:693` persists `textPackLocalPath` and installed status | A first install interrupted in this interval can leave a valid but unrecognized database; startup only checks translations that already have a saved path |
| Missing-file reconciliation clears recovery metadata | `bibleStore.ts:421` checks saved runtime paths; `bibleStoreModel.ts:50` clears active/pending/rollback fields for missing files | The app can fall back to another Bible even when locally recoverable content exists. Recovery must precede this fallback |
| Displayed text progress is not actual byte progress | `cloudTranslationService.ts:476–511` reports fetching at zero and indexing/complete at the total; the picker renders a percentage | A slow download can appear stuck at 0%, then jump to 100% before activation is complete |
| Known content counts are not carried into the active install call | `downloadCatalogTextPack` accepts `expectedVerseCount`, but `bibleStore.ts:684` does not pass it. The current text catalog type has no count. The upstream pack manifest has `verseCount` | The ordinary path checks at least one verse plus the supplied SHA-256. Checksum verification is already implemented; the missing piece is stronger version-specific completeness validation |
| Version/rollback models exist but are not the active installation sequence | Store actions wrap `stageTranslationPackCandidate`, `activateTranslationPackCandidate`, and `rollbackTranslationPack`; production download success directly sets installed fields | Reuse and connect these concepts; do not assume model tests establish a durable installed-file lifecycle |
| Current physical-device proof is incomplete | September 12 maintenance reports 4,468 passing tests and iOS Debug simulator interaction, but explicitly excludes standalone Release installation and physical Android interaction | Native filesystem, process termination, backgrounding, and low-memory behavior still need exact-build evidence |

Important counterevidence: existing download tests already cover bad HTTP status, checksum mismatch, incomplete data, activation failure, and ordinary rollback. September 5 and 8 work improved offline audio, cached catalogs, sync, and reader performance. June 12 records physical TECNO Android testing for an older revision. This proposal closes specific remaining boundaries; it does not assume the app has never been tested.

## 3. User-visible contract

1. An installed Bible opens without catalog, authentication, or network success being required.
2. Downloading another Bible leaves the current Bible readable.
3. Download progress means bytes transferred when the total is known. Unknown totals use an indeterminate indicator. Verification and installation have their own labels.
4. Cancel ends the person's request. No late callback may install, select, reopen, or close a screen on behalf of that canceled request.
5. Completion appears only after validation, durable installation registration, and a successful local read using the registered source.
6. A recoverable interrupted installation is reconciled locally on the next launch/open. A failed new candidate does not replace the previous good copy.
7. A download failure offers Retry and Keep reading. If an older copy exists, say it is still available. If no local copy exists, say a connection is needed to download it.
8. Text and audio availability remain distinct. “Text available offline” must not imply that audio was downloaded.
9. Existing reading position, notes, highlights, bookmarks, privacy settings, and account data survive the change.
10. The process does not promise offline access to a language that has never been downloaded or bundled.

Suggested copy, to add through translation keys and review in the existing 21 interface locales:

- “Downloading…” with measured percentage when available.
- “Checking download…” during integrity checks.
- “Finishing download…” during registration and the first read.
- “Text available offline” after success.
- “Download stopped. You can try again.” after cancellation.
- “Couldn't finish the download. Your saved Bible is still available.” when retaining a prior copy.
- “Connect to download this Bible.” when there is no readable local copy.

Keep selection behavior familiar: successful explicit selection may activate the new Bible, but only if that selection request still owns the picker interaction. Completion after the user chooses another Bible must not override the newer choice.

## 4. Design decision

| Approach | Advantage | Cost / limitation |
| --- | --- | --- |
| Add more rollback branches around the current fixed filename | Small initial patch | Retains the interval in which the active file has been moved away; recovering partially moved SQLite sidecars remains difficult |
| **Separate candidate files plus a recoverable activation record** | Existing usable files remain in place; handles first-install interruption and replacement; fits current active/pending/rollback metadata | A small local coordinator, migration/recovery logic, and additional retained file space |
| Replace the entire content platform or download library | Could unify more systems | Unnecessary scope, migration risk, and new integration work |

Choose the middle approach. Reuse installed capabilities. No new package, database server, state framework, or general-purpose job platform is required. The existing audio downloader remains responsible for audio.

### File and state ownership

- **Transport:** `cloudTranslationService.ts` downloads to an operation-specific candidate path, exposes byte progress/cancellation, and verifies the completed database. It never overwrites the currently selected database.
- **Lifecycle coordinator:** the implemented coordinator in `src/services/bible/cloudTranslationService.ts` and `src/stores/bibleStore.ts` owns per-translation requests, serialization, native cancellation, recovery, and activation sequencing.
- **Persisted operations:** new `src/services/bible/textPackInstallJournal.ts` stores a bounded record of unfinished operations using the existing MMKV adapter. It is recovery metadata, not a second catalog or source of Bible content.
- **Store:** `bibleStore.ts` continues to own the selected translation and published active/pending/rollback paths. Text-job summaries are distinct from the audio job so text cancellation cannot cancel audio or overwrite its progress.
- **Reader/database:** `bibleDatabase.ts` continues to resolve installed paths and cache handles by path. A selected translation's pending recovery is awaited before classifying its local file as missing.
- **Picker:** `TranslationPickerList.tsx` renders lifecycle state and delegates actions. It owns a selection request token to prevent stale completions from navigating.
- **Deletion journal:** deletion writes a tombstone before removing files and clears it only after registration/state cleanup. Recovery honors the tombstone so an intentional delete cannot resurrect a retained rollback copy after a process kill.

Keep the transport and lifecycle boundaries small. Do not split or rewrite the whole Bible store or reader as part of this project.

### Proposed interface contract

The names below defined the intended seam; the implementation keeps the same responsibilities across the existing transport/store modules rather than introducing a standalone service file.

```ts
type TextPackPhase = 'downloading' | 'verifying' | 'registering';

type TextPackInstallRequest = {
  translationId: string;
  version: string;
  downloadUrl: string;
  expectedSha256: string;
  expectedVerseCount?: number;
};

type TextPackInstallProgress = {
  operationId: string;
  translationId: string;
  phase: TextPackPhase;
  bytesDownloaded: number;
  bytesTotal: number | null;
};

type TextPackInstallResult =
  | { status: 'installed'; translationId: string; version: string; localPath: string }
  | { status: 'cancelled'; translationId: string };

type TextPackInstallOperation = {
  id: string;
  completion: Promise<TextPackInstallResult>;
  cancel: () => Promise<void>;
};

// Service factory receives filesystem, transport, journal, and store callbacks.
// Operational failure rejects completion with a typed install error.
// Cancellation resolves the explicit cancelled result, never success.
interface TextPackInstaller {
  start(request: TextPackInstallRequest): TextPackInstallOperation;
  recover(translationId: string): Promise<void>;
}
```

Use stable error codes for network, insufficient storage, checksum mismatch, invalid database, and recovery failure. The UI maps codes to localized copy and existing diagnostics can record the code. Do not show filesystem paths or raw backend errors to readers.

### Normal sequence

1. Validate IDs/paths and capture a version-specific catalog snapshot. A later catalog refresh cannot change this operation's expected checksum or count.
2. Deduplicate requests for the same translation and catalog version. Serialize incompatible operations for that translation. Distinct translations have distinct candidate paths and progress state.
3. Persist the operation record before creating its candidate. Include operation/translation IDs, candidate path, version/checksum, prior active path/version, phase, and cancellation state. Never put credentials in this record.
4. Download into an attempt-specific path under the app's documents/translations area. Reuse Expo's existing legacy download task API for cancellation and measured progress.
5. Verify HTTP success, the declared checksum, a readable SQLite schema, and the expected verse count when provided. Checksum verification must yield between bounded chunks so Cancel can be processed; do not use an uninterruptible whole-file synchronous hash on large mobile packs. Use existing translation-ID mapping when checking that a representative chapter is queryable; do not assume IDs or verse numbering are identical across translations.
6. Close the candidate's validation connection. Keep the old active database untouched. Mark the candidate verified in the journal and the store's pending metadata.
7. Register candidate active path/version and prior rollback path together in one store transition. Check operation ownership immediately before registration and again before any navigation side effect. Do not treat a resolved file move as the durable registration boundary.
8. Read through the newly registered source. On failure restore the old active registration and retain recovery evidence. On success mark the operation complete, then allow the picker to select it if its request remains current.
9. Retain at most one previous verified copy. Clean older unreferenced candidates only after their transport has settled and their database connections are unused/closed. Cleanup failure cannot erase the active/rollback records or make a successful download appear failed.

No assumption of atomicity across filesystem operations and MMKV writes is permitted. A restart can happen between any two steps; recovery must reconcile the journal, saved registration, and files. A device test must verify process-kill behavior. This does not promise survival of hardware failure or complete storage loss.

### Cancellation and background behavior

- Record cancellation/invalidate the operation token synchronously before awaiting native transport shutdown.
- Call the actual native cancel operation and wait for settlement before deleting its candidate or letting a replacement attempt reuse resources.
- Ignore progress, validation, store updates, telemetry success, and picker navigation from a canceled/superseded operation.
- Same-translation repeated taps share one operation; a retry after cancellation gets a new operation ID and candidate path.
- Deleting a translation also cancels and settles its text operation first. Otherwise a late callback can recreate deleted content.
- Cancel is available during transfer and yielding verification. Before the short registration/first-read phase begins, disable Cancel and show “Finishing download…”. Previously accepted cancellation always wins; a tap after the operation has already completed is not a cancellation of that completed install. Programmatic deletion writes a tombstone, waits for registration/transport to settle, removes the registered content, clears the store registration, and only then retires the tombstone. Recovery honors the tombstone at every restart boundary.
- First version promises safe cancellation and restart/retry, not guaranteed continuation of a text transfer after process death. On reopening, interrupted transfers offer Retry; no unexpected cellular redownload occurs.
- Existing audio background/resume behavior stays in its current service and is checked for regressions.

Expo SDK 54 documents cancellable download tasks, byte progress, and saved resumable state. That API availability does not establish end-to-end process-recovery correctness; the journal and device tests do that. See [Expo FileSystem legacy](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem-legacy/) and [Expo SQLite](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/). SDK-54 Context7 references were consulted; newer-version snippets were not used to choose APIs.

### Recovery decisions

Recovery is idempotent and local. Run it after local store hydration/privacy permission to enter the app, before a selected installed source is judged missing. Catalog refresh must not be a prerequisite. Reconcile other translations lazily or in the existing deferred warmup.

The current source resolver is synchronous. Put the awaited readiness hook in the asynchronous `getDatabase` entry before resolving the installed source; do not return a promise from `setBibleDatabaseSourceResolver`. Deduplicate recovery per translation. Recovery validation uses a direct, scoped SQLite connection, not the public reader path that would await the same recovery promise and deadlock. `bibleService.ts` must establish readiness before chapter-cache lookup or search-cache-key capture; cached reads cannot bypass recovery or retain a source captured before recovery.

Verify the publisher's SHA-256 against downloaded bytes before SQLite can alter them. Existing installed databases may have changed journal mode or acquired WAL sidecars; do not reject those copies simply because their on-disk bytes no longer match the original download checksum. Recover installed copies using validated provenance plus SQLite/schema/content identity checks, preserving sidecars. Keep active/pending file ownership clear so an install-time read cannot race legacy repair.

| Persisted/filesystem state | Recovery result |
| --- | --- |
| Transfer incomplete, prior active copy valid | Continue using the prior copy; mark transfer interrupted and offer Retry |
| Transfer incomplete, no prior copy | Keep other available Bibles usable; show this translation as needing download |
| Candidate verified, active registration still old/missing | Revalidate candidate and complete local registration; preserve selection unless the recovered record proves the original selection request is still applicable, otherwise never auto-navigate |
| New active path valid, journal not complete | Keep it, finalize the journal, retain the previous verified copy |
| Candidate invalid, previous copy valid | Restore/retain the previous registration and clear only invalid pending state |
| Legacy final `.db` missing but `.rollback` artifacts present | Recover the complete legacy database/sidecar set into an isolated recovery location, validate it, and register it; preserve originals until successful recovery |
| Legacy final `.db` exists but store has no path | Validate using the translation identity and available cached version/checksum metadata; adopt only when identity/version can be established. Preserve ambiguous files and offer Retry rather than labeling unknown content verified |
| Legacy sidecars are split across final and `.rollback` names | Treat the database and its `-journal`, `-shm`, and `-wal` files as one generation. Never attach a sidecar to a different-generation database. If the generation cannot be established safely, retain the files, mark recovery blocked, and ask for a fresh verified download while preserving any separately valid active copy |
| No validated copy available | Retain recovery evidence; offer another explicitly identified available Bible and Retry. Never claim recovery or silently label another language as the requested one |
| Unreferenced candidate remains after canceled operation | Remove only after settlement and confirmation it is not active, pending, or the retained rollback copy |
| Deletion tombstone remains after a restart | Honor the intentional deletion, finish removing only paths named by the tombstone, clear the translation registration, then retire the tombstone. Never restore the old rollback copy solely because deletion cleanup was interrupted |

Do not bulk-move existing installations. Existing `translationId.db` paths remain valid until a later successful replacement/repair. Legacy `.rollback` recovery is necessary even though new installations stop using the old replacement protocol.

## 5. Reviewable implementation slices

The slices below were executed locally. Checked items are complete in this checkout; physical-device, field-pilot, release, and distribution items remain open. Regression coverage was added before the corresponding behavioral fixes where the existing fixture structure allowed it.

### Slice 1 — Prove cancellation and stale-completion failures

**Files:** `src/stores/bibleStore.test.ts`, `src/services/bible/cloudTranslationService.behavior.test.ts`, new `src/screens/bible/translationDownloadSelection.test.ts` if a small extracted picker-selection model is needed.

- [ ] Hold the text transport promise unresolved, press Cancel through the store action, then resolve it. Assert no installed flag, selection change, picker close, or completion event.
- [ ] Resolve an older request after the user starts a newer request and verify the newer request owns all visible state.
- [ ] Start the same translation twice and assert one native transfer; cancel it, retry, then deliver callbacks from the old operation.
- [ ] Document the exact failing assertions before altering production behavior.

**Deliverable:** Deterministic repros for the concrete cancellation gap, independent of network timing. Use existing module/native fixtures instead of source-string assertions.

### Slice 2 — Own the text transfer, picker ownership, and its cancellation

**Files:** modify `cloudTranslationService.ts`, `bibleStore.ts`, and the corresponding tests; add the minimal shared types in `src/types/bible.ts`.

- [ ] Implement the interface in Section 4, operation IDs, single-flight behavior, separate text-job summaries, and cancel-settle-cleanup ordering.
- [ ] Replace the non-cancellable text transport with the existing Expo task API; emit actual bytes and separate phases. Make checksum verification bounded and yielding, with a cancellation check between chunks and a measured responsiveness/peak-memory probe for a large fixture.
- [ ] Route text Cancel and translation deletion through this coordinator. Preserve existing audio cancellation logic.
- [ ] Ensure canceled completion returns `status: 'cancelled'`; callers do not confuse it with successful installation.
- [ ] Add the picker selection token and unmount invalidation in this slice. A canceled/superseded result cannot select a translation, close the picker, or overwrite a newer request.
- [ ] Run the Slice 1 tests and existing audio cancellation/store tests.

**Deliverable:** Cancel really ends a text download; late callbacks cannot install or change the chosen Bible.

### Slice 3 — Preserve usable files, make registration recoverable, and make deletion durable

**Files:** add `textPackInstallJournal.ts` and its model test; modify `cloudTranslationService.ts`, `bibleDataModel.ts`, `bibleStore.ts`, `bibleDatabase.ts`, and their tests.

- [ ] Store candidates under unique safe paths and capture recovery metadata before file creation. Keep the previous active file in place.
- [ ] Write and honor a deletion tombstone across cancellation, file removal, state cleanup, and process-restart fixtures. Verify that an intentional delete never resurrects a rollback copy.
- [ ] Connect active/pending/rollback registration to the real success path, retaining one prior verified copy.
- [ ] Inject failure/restart snapshots immediately before and after verification, registration, first read, and cleanup. Reload modules against the same persisted filesystem/store fixture so the test models a new process, not a caught exception.
- [ ] Check a failed registration/first read restores the earlier registration without deleting its database.
- [ ] Prevent cleanup/delete racing active queries or transport writes. In-flight reads of the old version can finish; subsequent reads use the new path and fresh chapter cache.
- [ ] Preserve the existing same-installed-version no-op. Do not add automatic updates or an update-management UI.

**Deliverable:** At every interrupted transition there is a recoverable, accurately identified local outcome; a new candidate cannot destroy the only usable copy.

### Slice 4 — Recover before falling back, including old installations and cached reads

**Files:** `App.tsx`, `src/services/startup/startupService.ts`, `src/stores/bibleStore.ts`, `src/stores/bibleStoreModel.ts`, `src/services/bible/bibleDatabase.ts`, lifecycle/journal tests, and existing startup/store/database tests.

- [ ] Separate local installation recovery from network catalog bootstrap.
- [ ] Await selected-translation recovery at the local source readiness boundary; keep privacy gating intact and other Bible sources usable.
- [ ] Establish readiness before chapter-cache lookup, source-key capture, and search-cache lookup in `bibleService.ts`/`bibleDatabase.ts`; test a cached chapter and search request during pending recovery.
- [ ] Implement every state in the recovery table, including old `.rollback`, split/mixed sidecars, and valid unregistered final files.
- [ ] Run recovery twice for each snapshot; the second run must leave files, selection, and version metadata unchanged.
- [ ] Test airplane-mode relaunch without initiating a network transfer, losing a highlight, or changing the selected language when its copy is recoverable.
- [ ] Preserve unresolved backups and emit a bounded diagnostic if recovery is impossible.

**Deliverable:** Recovery does not require a support engineer, fresh download, or successful catalog request when a valid local copy exists.

### Slice 5 — Finish truthfulness and content validation

**Files:** `src/screens/bible/TranslationPickerList.tsx`, a small `translationDownloadSelection.ts` model if needed, `src/types/bible.ts`, `src/services/bible/bibleDataModel.ts`, `src/services/translations/translationCatalogModel.ts`, `apps/site/lib/upstreamTranslationFeed.ts`, `src/stores/bibleStore.ts`, relevant tests, and existing locale files under `src/i18n/locales/`.

- [ ] Add optional version-specific `verseCount` to text catalog metadata, carrying it from the existing pack manifest through the feed/parser/store to `expectedVerseCount`.
- [ ] Do not borrow a count from an unrelated/current version without matching identity/version. Never impose BSB's verse count on another translation or reject legitimate portions because they lack 66 books.
- [ ] Keep older catalogs compatible: absent counts retain existing checksum/schema validation; document the reduced completeness check. Do not bypass an invalid supplied checksum.
- [ ] Render measured byte progress, indeterminate unknown totals, checking/finishing phases, correct offline text status, and recoverable error actions.
- [ ] Add the picker ownership guard. Cancellation and completion of a background request never override a newer user choice.
- [ ] Review one Latin-script and one non-Latin-script flow and all new translation-key coverage. Verify audio-only and text-only rows remain truthful.

**Deliverable:** The user can understand and control the download; content checks use available publisher evidence without breaking older catalogs.

The metadata enhancement changes what a future published feed/catalog can provide. It requires readback of that exact catalog after an authorized deployment; local code alone does not prove the field is live. Core recovery/cancellation must work against the existing catalog without that publication.

### Slice 6 — Verify the complete journey and document evidence

**Files:** update `docs/offline-text-install.md`, `docs/release-smoke-checklist.md`, and `docs/testing.md`; add a dated report under `docs/qa/` for the exact candidate. Reuse existing `scripts/benchmark-android-startup.py`, `scripts/android_perf_smoke.sh`, and test fixtures. Add no new mobile test framework merely for this pass.

- [x] Run the automated gate and the available iOS simulator build gate; the physical-device matrix remains open because the attached iPhone is currently offline and no Android device was available in this session.
- [x] Record revision, artifact hash/build number, device/OS, network condition, scenario, outcome, and evidence path for the completed runs in `docs/qa/`.
- [x] Fix reproducible JavaScript/store/transport failures in their owning slices, then repeat the affected focused cases. Native lifecycle failures still require physical retesting.
- [ ] Conduct the bounded field pilot after internal acceptance; summarize task success and observed difficulty.
- [x] Reconcile old roadmap claims with current evidence for this scope only. Distinguish code-complete, tested on simulator, and distributed.

**Deliverable:** An exact-build acceptance record, documented recovery behavior, and a short residual-risk list. Passing Node tests alone cannot close this slice.

## 6. Verification matrix and stop conditions

Use Node 22 and npm 11.11.0, matching CI. From the repository root, future verification starts with:

```sh
node --test --experimental-test-module-mocks --import tsx src/services/bible/cloudTranslationService.behavior.test.ts src/services/bible/bibleDatabase.test.ts src/services/bible/bibleDataModel.test.ts src/stores/bibleStore.test.ts src/services/translations/translationCatalogModel.test.ts apps/site/lib/upstreamTranslationFeed.test.ts
npm run release:verify
git diff --check
```

New `*.test.ts` files are discovered by the existing workspace runner. Verify its discovery includes them. Expected result: zero failures, cancellations, or unintended skips; lint, typechecks, and Expo config validation pass. The 4,468-test figure is the September 12 maintenance report's result, not a result rerun for this plan.

Use standalone locally built release candidates on a physical iPhone and a representative low-end Android device. Preserve personal app installations and existing simulator data; use dedicated test devices/containers. An emulator may assist testing but cannot replace the physical Android gate.

| Scenario | Required observation |
| --- | --- |
| Fresh install, offline, guest | Bundled scripture is accessible; unavailable languages are not labeled downloaded |
| Fresh install, online, runtime text | Select language, download, open a real chapter, then relaunch offline in that same translation |
| Slow network | Measured/indeterminate progress remains truthful and Cancel works |
| Cancel before response and during verification | No later install, selection change, or navigation; old Bible remains usable |
| Duplicate tap / cancel / retry | One owned operation; old callbacks cannot affect the retry |
| Process kill at each persisted boundary | Restart recovers the valid candidate or previous copy without downloading again where local recovery is possible |
| Low storage / write failure | Existing copy is retained; clear retryable error; no false completion |
| Bad HTTP, checksum, SQLite, or supplied count | Reject candidate and preserve last known-good copy |
| Legacy interrupted state | `.rollback`, sidecars, and valid unregistered `.db` are handled according to the recovery table |
| Read another Bible during download | Reading stays responsive and in the selected language |
| Read old version during replacement | In-flight read finishes; future reads use the registered version without stale cache results |
| Delete while downloading | Transport settles and content does not reappear from a late callback |
| Download text while audio plays | No audio stop/cancel from text controls; transport and state stay separate |
| Download audio; lock/background; relaunch offline | Existing audio remains playable with correct downloaded markers |
| Upgrade existing installation | Installed Bibles, position, annotations, preferences, and privacy configuration remain intact |
| Catalog offline or source outage | Already-installed content remains usable and local recovery still runs |

Use failure fixtures to pause at exact lifecycle boundaries. Manually killing the app at random times is useful supplementary testing, not sufficient coverage of the registration gap.

**Release-blocking failures:** loss of an existing usable Bible; silent change to an unrelated translation; canceled work activating later; installed status pointing to unreadable content; inability to open installed text because the network is unavailable; recovery damaging annotations or privacy/account state.

Record startup/interaction timings on the same hardware and conditions before/after. Provisional budget: median installed-chapter open <= 1 second and p95 <= 2 seconds over 20 warm local opens on the chosen low-end Android; no >10% median startup regression over a comparable 20-launch sample. These are proposed acceptance budgets, not measured current performance. A 20-run p95 is only a small-sample diagnostic. Do not hash every installed Bible on every launch; full download-byte verification happens during installation, and recovery uses the checks appropriate to each file's lifecycle.

## 7. Field validation and measurement

After internal gates pass, propose a one-week pilot with 8–12 consenting users who actually read/listen in at least two relevant languages, including a non-Latin script and several low-end Android users. Recruitment and communication are future actions requiring authorization; none occurred for this plan.

Give each person the same tasks: find their Bible, download it, open it offline after a restart, interrupt/cancel and retry a second download, resume reading/listening later. Observe whether they can complete the tasks unaided and whether status labels match their understanding.

Pilot exit target: every participant can reopen the installed Bible offline; no destructive recovery or canceled activation; at least 90% of assigned tasks completed without help. Small samples identify practical failures; they do not establish population-level retention or crash rates.

Use existing usage analytics, local diagnostics, exact-build logs, and the task-observation sheet. Do not require new cross-session identifiers, recording of scripture notes, GPS, or another analytics provider. Count canceled requests separately from technical failures. Existing completion events must fire only after durable success and must not double-count recovered registration.

A later retention/activation study is useful, but current anonymous session data cannot be assumed to identify unique returning people. A new remote crash-reporting integration is a separate scoped decision.

## 8. Sequence, effort, dependencies, and release boundary

Recommended sequence: Slice 1 -> Slice 2 -> Slices 3 and 4 -> Slice 5 -> Slice 6 -> bounded field pilot -> release decision.

Rough planning allowance for one experienced engineer: cancellation/repro 1–2 days; durable installation and legacy recovery 3–5 days; truthful UI/catalog plumbing 1–2 days; physical verification and documentation 2–3 days. Total approximately 7–12 engineering days plus one pilot week. Native-device failures or ambiguous legacy files can extend this; the estimate is not a delivery commitment.

Dependencies before implementation acceptance:

- A physical iPhone and representative low-end Android test device with dedicated test state.
- Enough local disk space for standalone builds; the latest maintenance report recorded a Release build failing from exhausted space.
- An exact candidate revision and existing release configuration checked at execution time.
- Valid sample runtime packs spanning the pilot's languages and text/audio availability patterns.
- Test-only failure injection and persisted-state fixtures, with no production switches that let arbitrary users bypass verification.
- Later operator authorization for any catalog publication or tester distribution.

If a physical device is unavailable, complete the implementation and deterministic checks but leave physical acceptance explicitly open. Do not repeatedly broaden automated tests as a substitute for the missing device.

Future rollout: verify the candidate internally first; deploy the additive catalog metadata only if approved; distribute the exact mobile candidate to the authorized beta audience in a separate project-scoped deployment task; verify actual installability and repeat the offline scenario on that build; then review pilot evidence before broader release. Do not auto-enable bulk content updates or re-download existing Bibles.

Rollback design: keep existing paths/metadata readable, preserve the prior verified copy, and avoid destructive catalog/storage migrations. Test an app rollback against an installation made by the new candidate before claiming compatibility. If compatibility is not proved, stop rollout and fix forward; never instruct users to reinstall as the default recovery because it risks their local data.

## 9. Explicit exclusions

- New translations, new audio production, Gather expansion, redesigns, or general reader/store refactors.
- Automatic translation updates, whole-library background refresh, or guaranteed post-kill text-download continuation.
- Audio engine replacement, Expo/MMKV upgrades, new crash-reporting/analytics providers, or a new end-to-end framework.
- Production migrations, credential setup, commits, merges, publishing, and invitations during this planning task.

## 10. Done means

- [x] Text Cancel cancels the owned native operation and suppresses all late effects in deterministic store/transport coverage.
- [x] Restart recovery handles the implemented registration states and legacy backup fixture idempotently in local fixtures; full process-kill matrix remains a physical acceptance item.
- [x] Last known-good scripture and user data survive the tested store/transport failures.
- [x] Local recovery/readiness is wired ahead of installed-source and cached-reader access; offline physical relaunch remains open.
- [x] Text/audio status and progress are separated, with measured/indeterminate progress states covered in the UI code.
- [x] Version-specific counts reach validation when present; existing checksum verification remains enforced.
- [x] Focused automated gates and typecheck pass; the full workspace gate still records one pre-existing release-metadata mismatch.
- [ ] Physical iOS/Android standalone-build matrix passes with recorded evidence.
- [ ] Pilot results meet the agreed task-success gates or remaining issues are resolved and retested.
- [ ] Any release is separately authorized, handed off, and verified against the actual distributed build.

## Evidence references

- `docs/mobile-maintenance-2026-09-12.md`: latest maintenance test/runtime evidence and explicit limits.
- `docs/mobile-optimization-2026-09-08.md`: recent optimization evidence and physical Android gap.
- `docs/offline-text-install.md`: documented fixed-path replacement and process-termination limits.
- `src/services/bible/cloudTranslationService.ts`: transport, validation, activation, and rollback behavior.
- `src/stores/bibleStore.ts` and `src/stores/bibleStoreModel.ts`: active install, cancellation, persistence, and missing-pack reconciliation.
- `src/services/bible/bibleDataModel.ts`, `src/services/bible/bibleDatabase.ts`: pack state helpers and local database routing.
- `src/screens/bible/TranslationPickerList.tsx`: progress/cancel UI and selection after awaited download.
- `apps/site/lib/upstreamTranslationFeed.ts`, `apps/site/lib/r2-text-pack-manifest.json`, `src/types/bible.ts`: version/count metadata boundary.
- `docs/testing.md`, `docs/release-smoke-checklist.md`, `.github/workflows/verify.yml`: existing verification machinery.
- `docs/analytics-collection-audit.md`, `src/services/diagnostics/crashLogStore.ts`: existing measurement channels and limits.
- `.planning/phases/35-android-performance-hardening/35-DEVICE-QA-REPORT.md`: older physical Android counterevidence.

Docs discovery used the available `docs-list`; it listed the shared agent-scripts documentation rather than this repository. Repository-local discovery therefore used `rg --files docs .planning` and focused reads. Current source and September reports take precedence over stale roadmap labels. No live store, backend, or device state was asserted from those documents.
