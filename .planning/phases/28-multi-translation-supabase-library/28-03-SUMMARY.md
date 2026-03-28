---
phase: 28-multi-translation-supabase-library
plan: 03
subsystem: bible-data, translation-selection
tags: [translations, supabase, catalog-integrity, regression-hardening, root-cause]
dependency_graph:
  requires: [28-01, 28-02]
  provides: [catalog-integrity-guardrails, importer-ordering-fix, selector-regression-coverage, runtime-placeholder-hardening, release-bundle-hardening]
  affects: [translationService, import-ebible-translations, cloudTranslationModel, Select Translation UI, persisted runtime translations, iOS release bundling]
tech_stack:
  added: []
  patterns: [evidence-first-debugging, backend-data-cleanup, alias-canonicalization, fail-first-tests, simulator-smoke, release-build-verification]
key_files:
  created:
    - babel.config.js
    - src/services/startup/babelConfig.test.ts
    - src/services/translations/translationCatalogModel.ts
    - src/services/translations/importTranslationSource.test.ts
    - src/services/translations/translationCatalogModel.test.ts
    - src/services/bible/cloudTranslationModel.test.ts
    - supabase/migrations/20260326184500_hide_orphan_translation_catalog_rows.sql
  modified:
    - src/screens/bible/TranslationPickerList.tsx
    - src/screens/bible/bibleTranslationModel.ts
    - src/stores/persistedStateSanitizers.ts
    - src/services/translations/translationService.ts
    - src/services/bible/cloudTranslationModel.ts
    - scripts/import-ebible-translations.ts
decisions:
  - "Do not trust translation_catalog.is_available by itself for app-visible runtime entries; only surface translations whose normalized IDs resolve to a current translation_versions row with real verse coverage"
  - "Canonicalize backend translation IDs onto the app's store IDs before installability checks so aliases like engwebp/web, eng-asv/asv, and spaRV1909/sparv1909 cannot drift apart"
  - "Only mark a translation catalog row available after verse rows and the current translation_versions row are written successfully; failed imports must not leave phantom translations visible in the picker"
  - "Clean existing orphan rows in production with a migration so the fix protects current users immediately, not only future imports"
  - "Seeded runtime translation defaults must preserve their runtime identity and persisted remote metadata on rehydrate; do not downgrade them back into bundled placeholder rows after restart"
  - "While the runtime catalog is hydrating, the picker should hide unreadable runtime placeholders instead of briefly labeling them as coming soon"
  - "Release bundling must resolve Expo's Babel preset through the installed Expo package so `export:embed` and Release simulator/device builds cannot fail when `babel-preset-expo` is only transitively installed"
metrics:
  completed: 2026-03-26
  tasks: 6
  files: 13
requirements: [MULTI-01]
---

# Phase 28 Plan 03: Translation Catalog Integrity Hardening Summary

## One-liner

Root-caused the `NPIONCB is not currently available from the backend` picker failure to orphaned Supabase catalog rows plus weak frontend/runtime state handling, then hardened the importer, runtime catalog filter, alias mapping, persisted runtime metadata, picker hydration behavior, and iOS release bundling so the app only advertises installable Bibles and survives restarts/build-path changes cleanly.

## Tasks Completed

| Task | Name | Status | Key Files |
|------|------|--------|-----------|
| 1 | Reproduce and trace the failing translation-selection path | complete | TranslationPickerList.tsx, translationService.ts, Supabase translation tables |
| 2 | Add fail-first regression coverage for catalog normalization and importer ordering | complete | translationCatalogModel.test.ts, importTranslationSource.test.ts, cloudTranslationModel.test.ts |
| 3 | Harden frontend/runtime filtering and importer ordering | complete | translationCatalogModel.ts, translationService.ts, cloudTranslationModel.ts, import-ebible-translations.ts |
| 4 | Clean live orphan catalog rows in Supabase and verify counts | complete | 20260326184500_hide_orphan_translation_catalog_rows.sql |
| 5 | Preserve runtime-backed translation metadata across rehydrate and remove the fresh-launch placeholder flash | complete | persistedStateSanitizers.ts, bibleTranslationModel.ts, TranslationPickerList.tsx |
| 6 | Harden iOS release bundling so Reanimated/preset config works in embedded builds | complete | babel.config.js, babelConfig.test.ts |

## Root Cause

The app showed `NPIONCB` in the translation picker because the backend advertised it as available even though no verse payload existed behind that catalog row.

Two independent faults combined:

1. `translation_catalog` contained orphan rows where `is_available = true` and `has_text = true`, but there were zero matching `bible_verses` rows.
2. The runtime catalog loader trusted catalog availability too directly and did not consistently canonicalize backend IDs onto the same translation IDs used by the app store and download pipeline.

That produced a bad user-facing contract: the picker said the Bible was available, but the backend text lookup later failed and showed the error alert.

Two secondary defects made the experience feel broader than one broken backend row:

3. Seeded Nepali/Hindi/Spanish runtime defaults were being rehydrated as bundled placeholders, so a cold restart could downgrade valid runtime metadata back into "coming soon"-style cards.
4. The Bible picker rendered runtime placeholders while the catalog was still hydrating, which created a brief but misleading prefetch window on fresh launches.

## What Was Built

### Runtime catalog integrity filter

`translationCatalogModel.ts` now centralizes:

- alias normalization from backend IDs to app IDs
- canonical installability checks against current `translation_versions`
- filtering so runtime entries only survive when their normalized ID is backed by a current version with verses

`translationService.ts` now fetches both `translation_catalog` and current `translation_versions`, then exposes only installable entries instead of every row marked available.

### Importer ordering fix

`scripts/import-ebible-translations.ts` no longer upserts the catalog row before the import succeeds.

The importer now writes:

1. parsed verse rows
2. `translation_versions`
3. `translation_catalog`

This prevents partial/failed imports from leaving false-positive catalog rows visible to users.

### Alias parity hardening

`cloudTranslationModel.ts` and `translationCatalogModel.ts` now cover the real alias cases seen in production, including:

- `eng-asv` ↔ `asv`
- `engbbe` ↔ `bbe`
- `engbsb` ↔ `bsb`
- `engwebp` / `engwebpb` ↔ `web`
- `engylt` ↔ `ylt`
- `rvr` ↔ `spaRV1909`
- `sparv1909` ↔ `spaRV1909`

This keeps selector UI, download flows, and backend IDs aligned.

### Live backend cleanup

`20260326184500_hide_orphan_translation_catalog_rows.sql` sets `is_available = false` for catalog rows that claim text availability but have no matching `bible_verses` rows.

After applying the migration, orphan available rows dropped from `20` to `0`.

### Runtime placeholder and persistence hardening

`persistedStateSanitizers.ts` now preserves runtime-backed seeded translations as `source: 'runtime'` and merges persisted runtime metadata instead of coercing those rows back into bundled placeholders. That keeps valid cloud-backed Hindi/Nepali entries truthful across app restarts.

`bibleTranslationModel.ts` and `TranslationPickerList.tsx` now hide unreadable runtime placeholders while the runtime catalog is still hydrating, so fresh launches do not briefly present "coming soon" cards for translations that are about to resolve into download-ready runtime rows.

### iOS release bundle hardening

`babel.config.js` now resolves Expo's Babel preset through the installed Expo package path instead of assuming a top-level `babel-preset-expo` dependency.

That keeps Reanimated worklets working while also allowing `expo export:embed` and Release iOS builds to succeed reliably.

## Verification

### Automated

- `node --test --import tsx src/services/translations/translationCatalogModel.test.ts src/services/translations/importTranslationSource.test.ts src/services/bible/cloudTranslationModel.test.ts`
- `node --test --import tsx src/services/translations/translationCatalogModel.test.ts src/services/translations/importTranslationSource.test.ts src/services/bible/cloudTranslationModel.test.ts src/services/startup/babelConfig.test.ts src/screens/bible/translationPickerListSource.test.ts src/screens/bible/bibleTranslationModel.test.ts src/screens/more/translationBrowserSource.test.ts src/stores/bibleStoreModel.test.ts src/stores/persistedStateSanitizers.test.ts`
- `npm run typecheck`
- `npm run verify:expo-config`
- `npm run release:verify`
- `xcodebuild -workspace ios/EveryBible.xcworkspace -scheme EveryBible -configuration Release -destination 'id=25C67691-4BB7-4F20-B091-6BEABC28300D' build`
- `maestro test --udid 25C67691-4BB7-4F20-B091-6BEABC28300D /tmp/everybible_first_run_translation_smoke.yaml`
- `bash scripts/testflight_precheck.sh /tmp/everybible-artifacts-20260326/build-1774535092671.ipa`
- `eas build --platform ios --profile production --local --non-interactive`
- `eas submit --platform ios --profile production --path /tmp/everybible-artifacts-20260326/build-1774535092671.ipa --non-interactive`
- `verify_testflight_distribution.sh --app 6758254335 --build-version 175 --group-name 'Internal Testers' --tester-email curryj@protonmail.com`

### Live Supabase evidence

- `select count(*) ... orphan_catalog_rows` returned `0` after the migration
- Nepali catalog rows now show `npioncb` with `is_available = false` and `npiulb` with `is_available = true`
- Available catalog counts now reflect the real backend-backed set instead of placeholder/failed imports

## Deviations from Previous Phase Assumptions

### 1. translation_catalog was not a trustworthy source of truth by itself

Phase 28 originally treated `translation_catalog.is_available` as sufficient for browse/install visibility. Production data proved otherwise once failed or partial imports accumulated. The app now derives visibility from both catalog metadata and current-version/verse evidence.

### 2. Import script ordering mattered more than expected

The original importer made the catalog row visible before verse persistence finished. That was acceptable only when all imports succeeded, but unsafe once import failures occurred. The ordering was tightened so visibility is the last step.

## Manual Smoke Completed

Simulator smoke on an iPhone 16 Pro dev build confirmed:

- the picker no longer shows `NPIONCB`
- the Nepali card now routes to a normal download prompt instead of a backend-unavailable alert
- Genesis 1 in BSB opens cleanly without the prior Reanimated worklet crash
- a clean-install first-run flow now passes under Maestro: onboarding → Bible tab → Select Translation → Nepali filter → `Nepali Bible` visible, `Nepali Contemporary Bible` hidden, download prompt shown and cancellable

Release/TestFlight smoke also confirmed:

- release commit `08b91cf489fb1f6b76a8f4889a576b8bcf9c4c85` pushed to `origin/main`
- local-only production IPA built successfully and passed repo precheck with `embedded_jsbundle=true`, `expo_dev_bundles_present=false`, and `head_matches_origin_main=true`
- App Store Connect now shows build `175` / build ID `6dc62699-0c6d-4bd0-8eb6-264ca8eda9e9` as `VALID`
- build `175` is attached to beta group `Internal Testers` (`3a75b4d5-cae0-4c9a-8880-890f486f605a`)
- build `175` is directly attached to tester `curryj@protonmail.com` (`e378ad42-c381-460b-9e06-b4180b938807`)

## Remaining Human Verification

Physical-device/TestFlight verification is still recommended for the full picker/download/install path:

- complete a Nepali text-pack download and verify offline reopen on device
- verify runtime-backed translations remain truthful after a cold restart outside the simulator/dev-server loop
- confirm previously bundled translations (BSB / WEB / ASV) remain instant and unaffected on release hardware

## Self-Check

Root cause confirmed in live Supabase data, regression tests added first, backend cleanup applied, and runtime filtering now prevents the same class of bug from resurfacing through other orphaned catalog rows.
