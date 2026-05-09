# Tolgee Translator Workflow Plan

## Goal

Use Tolgee as the translator-facing workflow for app interface strings while keeping EveryBible's runtime localization unchanged: i18next loads local TypeScript locale objects from `src/i18n/locales`, bundled into the Expo app at build time.

This plan does not add Tolgee SDKs, runtime network fetching, or new app dependencies.

## Current Repo Evidence

- Runtime i18n is local and bundled. `src/i18n/index.ts` builds `resources` from `SUPPORTED_LANGUAGES` and `src/i18n/locales/*`, then initializes `i18next` with `react-i18next`.
- `package.json` already includes `i18next` and `react-i18next`; no Tolgee packages are present or needed for this workflow.
- English is the schema source. `src/i18n/types.ts` derives `TranslationKey` and React i18next resource typing from `src/i18n/locales/en.ts`.
- Locale files are TypeScript object exports ending in `as const`; `en.ts` also exports `TranslationKeys`.
- Coverage tests require every supported locale file to exist, preserve the full English keyset, reject unexpected keys, and avoid user-facing English leakage.
- Core locale tests currently pay special attention to `es`, `hi`, `ru`, and `ne`.
- Tibetan work in `docs/four-fields-tibetan-migration.md` and `TIBETAN_LOCALIZATION_STATUS.md` emphasizes cultural review, Tibetan visual/theme conventions, and careful mobile verification. Translator workflow should support reviewer comments and staged acceptance before runtime changes ship.

## Recommendation

Use Tolgee as an offline translation management system:

1. Export source strings from `src/i18n/locales/en.ts` into Tolgee-compatible JSON.
2. Translators and reviewers work in Tolgee.
3. Export approved translations from Tolgee.
4. Convert exported JSON back into the existing `src/i18n/locales/{code}.ts` files.
5. Run existing tests and typecheck before merging.

The app continues to ship only local `src/i18n/locales` files. Tolgee is operational tooling, not app runtime infrastructure.

## Tolgee License Note

Tolgee is open-core. As of Tolgee's 2026 self-hosted pricing and licensing docs, the core platform is Apache License 2.0, while advanced features under `ee/` and `webapp/src/ee` use the Tolgee Enterprise Edition license. Free self-hosting includes core localization features, but limits and support differ from paid Cloud or licensed self-hosted plans.

Recommended posture:

- Start with Tolgee Cloud or free self-hosted core features for workflow validation.
- Do not vendor Tolgee source or Enterprise Edition code into this repo.
- Treat paid/self-hosted EE features such as SSO, granular permissions, and higher seat needs as procurement decisions outside the app runtime.
- Re-check Tolgee pricing/licensing before production adoption because license and seat terms can change.

References:

- https://tolgee.io/pricing/self-hosted
- https://docs.tolgee.io/platform/self_hosting/licensing
- https://github.com/tolgee/tolgee-platform

## Project Setup

Create one Tolgee project for EveryBible interface strings.

Languages should mirror `SUPPORTED_LANGUAGES`:

- `en` as source.
- Current targets: `zh`, `hi`, `es`, `ar`, `fr`, `bn`, `pt`, `ru`, `ur`, `id`, `de`, `ja`, `pa`, `mr`, `te`, `tr`, `ta`, `vi`, `ko`, `ne`.

Use nested JSON keys that match the dot-path structure of `src/i18n/locales/en.ts`, for example `bible.chapterFeedbackSuccess` and `onboarding.interfaceLanguageTitle`.

Recommended project rules:

- Keep placeholders unchanged, including `{{count}}`, `{{name}}`, `{{country}}`, and plural suffix keys such as `_one` and `_other`.
- Require reviewer approval before exporting high-risk locales or new feature copy.
- Add key comments/context in Tolgee for theology, privacy, discreet mode, Tibetan cultural adaptation, and Bible/audio terminology.
- Keep screenshots/context optional at first; add them later for strings that repeatedly need UI clarification.

## Export And Import Flow

### 1. Source Export

Build or run a small local script that imports `src/i18n/locales/en.ts` and writes nested JSON for Tolgee import.

Expected output:

- One source file for English strings.
- No generated changes to runtime code.
- Stable key order where practical to keep diffs reviewable.

### 2. Tolgee Import

Import the English source file into Tolgee.

For existing target locales, import current `src/i18n/locales/{code}.ts` content after converting it to nested JSON. Mark imported translations as existing baseline, not freshly reviewed, unless a reviewer has already approved them.

### 3. Translator Work

Translators edit target languages in Tolgee. Reviewers resolve comments and approve final values.

For Tibetan or Tibetan-adjacent cultural work, use the same review discipline documented by the Tibetan migration notes: native speaker review, cultural authenticity checks, and mobile UI verification before release.

### 4. Tolgee Export

Export approved target translations as nested JSON using the same language codes as `SUPPORTED_LANGUAGES`.

Do not export directly over TypeScript files. Always export into a temporary or generated review folder first, such as:

```text
tmp/tolgee-export/{code}.json
```

### 5. TypeScript Locale Generation

Convert each exported JSON file into the existing TypeScript shape:

```ts
export const ne = {
  // nested translation object
} as const;
```

Only `en.ts` should export `TranslationKeys`. Target locale files should keep their current `export const {code}` pattern.

### 6. Verification

Run the existing gates:

```bash
npm run test -- src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts
npm run typecheck
```

If the runner does not support passing individual files through `npm run test`, use the underlying command:

```bash
node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts
npm run typecheck
```

For release-bound localization updates, also run the repo's release gate:

```bash
npm run release:verify
```

## Reversible Decisions

Reversible:

- Tolgee Cloud versus self-hosted Tolgee.
- Manual export/import versus automated CLI/API sync.
- Temporary export folder naming.
- Reviewer workflow, labels, comments, and approval stages.
- Machine translation provider configuration inside Tolgee.
- Whether to add screenshots/context after the initial pilot.

Not part of this plan:

- Replacing i18next.
- Adding Tolgee SDKs to the Expo runtime.
- Fetching translations from the network at app startup.
- Changing `src/i18n/types.ts` typing strategy.
- Changing `SUPPORTED_LANGUAGES` without a separate product and QA decision.

## Rollback

Because the app runtime remains local, rollback is a normal Git/code rollback:

1. Revert the generated locale file changes from the localization PR.
2. Keep `src/i18n/locales/en.ts` as the source of truth for key schema.
3. Re-run locale coverage tests and typecheck.
4. If a bad translation shipped, patch only the affected locale file and release through the normal app pipeline.
5. If the Tolgee project data is wrong, restore by re-importing the last known-good JSON exported from Git-tracked locale files.

No production service rollback is required unless the team separately adopts self-hosted Tolgee for translator operations.

## Pilot Plan

1. Choose a narrow pilot set: one new feature area plus two target locales, ideally `ne` and one core non-Latin locale.
2. Export English and existing targets into Tolgee.
3. Have translators edit and reviewers approve the pilot keys.
4. Export to temporary JSON, generate TypeScript locale files, and review the diff.
5. Run locale tests and typecheck.
6. Verify the changed screens on a device or simulator, checking truncation, RTL where relevant, placeholders, pluralized strings, and discreet/privacy language.
7. Decide whether to automate the conversion scripts after the pilot proves useful.

## Acceptance Checklist

- [ ] Tolgee is used only for translator workflow; Expo runtime still uses bundled i18next resources.
- [ ] No new dependencies are added to `package.json`.
- [ ] `src/i18n/index.ts`, `src/i18n/types.ts`, and runtime i18next initialization remain unchanged.
- [ ] English remains the schema source through `src/i18n/locales/en.ts`.
- [ ] All target locale files preserve the complete English keyset and contain no unexpected keys.
- [ ] Placeholders and plural suffix keys are preserved exactly.
- [ ] Core locale tests pass for `es`, `hi`, `ru`, and `ne`.
- [ ] Full locale coverage tests pass.
- [ ] `npm run typecheck` passes.
- [ ] Release-bound updates pass `npm run release:verify`.
- [ ] Human review is complete for culturally sensitive, theological, privacy, and Tibetan-related strings.
- [ ] Rollback path is documented in the localization PR.
