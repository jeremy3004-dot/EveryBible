# Tolgee Translator Workflow Plan

## Goal

Use Tolgee as the translator-facing workflow for app interface strings while keeping EveryBible's runtime localization unchanged: i18next loads local TypeScript locale objects from `src/i18n/locales`, bundled into the Expo app at build time.

This plan does not add Tolgee SDKs, runtime network fetching, or new app dependencies.

## Current Repo Evidence

- Runtime i18n is local and bundled. `src/i18n/index.ts` initializes `i18next` with English and `react-i18next`; `localeLoaders.ts` loads other supported locale objects on demand without a network request.
- `package.json` already includes `i18next` and `react-i18next`; no Tolgee packages are present or needed for this workflow.
- English is the schema source. `src/i18n/types.ts` derives `TranslationKey` and React i18next resource typing from `src/i18n/locales/en.ts`.
- Locale files are TypeScript object exports ending in `as const`; `en.ts` also exports `TranslationKeys`.
- Coverage tests require every supported locale file to exist, preserve the full English keyset and exact interpolation tokens, reject unrelated extra keys, and avoid unintended user-facing English copies. They permit and require valid language-specific plural forms for existing English `_other` stems, using `Intl.PluralRules(code).resolvedOptions().pluralCategories`.
- Source and rendering tests check translation-key references, hardcoded JSX/accessibility text, and all bundled locale strings without fallback or unresolved tokens. Nonblank values and translation artifacts are checked separately from exact-value exceptions for legitimate cognates and proper names.
- Core locale tests currently pay special attention to `es`, `hi`, `ru`, and `ne`.
- Tibetan work in `docs/four-fields-tibetan-migration.md` and `TIBETAN_LOCALIZATION_STATUS.md` emphasizes cultural review, Tibetan visual/theme conventions, and careful mobile verification. Translator workflow should support reviewer comments and staged acceptance before runtime changes ship.

## Recommendation

Use Tolgee as an offline translation management system:

1. Export source strings from `src/i18n/locales/en.ts` into Tolgee-compatible JSON.
2. Translators and reviewers work in Tolgee.
3. Export approved translations from Tolgee.
4. Convert exported JSON back into the existing `src/i18n/locales/{code}.ts` files.
5. Run existing tests and typecheck before merging.

The app continues to ship local `src/i18n/locales` files and the native permission resources generated from them. Tolgee is operational tooling, not app runtime infrastructure.

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

Languages should mirror the 21 interface languages in `SUPPORTED_LANGUAGES` (`src/constants/languages.ts`):

- `en` as source.
- Twenty targets: Simplified Chinese (`zh`), Hindi (`hi`), Spanish (`es`), Arabic (`ar`), French (`fr`), Bengali (`bn`), Portuguese (`pt`), Russian (`ru`), Urdu (`ur`), Indonesian (`id`), German (`de`), Japanese (`ja`), Punjabi (`pa`), Marathi (`mr`), Telugu (`te`), Turkish (`tr`), Tamil (`ta`), Vietnamese (`vi`), Korean (`ko`), and Nepali (`ne`). Bible translation availability is a separate catalog.

Use nested JSON keys that match the dot-path structure of `src/i18n/locales/en.ts`, for example `bible.chapterFeedbackSuccess` and `onboarding.interfaceLanguageTitle`.

Recommended project rules:

- Keep placeholders unchanged, including `{{count}}`, `{{name}}`, and `{{country}}`. Preserve every English key, including `_one` and `_other`, and add the locale's required plural categories for those stems (for example, Russian `_few` and `_many`). Extra keys are valid only when the suffix is a plural category for that language and the corresponding English `_other` key exists.
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

### 6. Native Permission Resources

Camera, microphone, photo-library, and Face ID explanations live under `interface.nativePermissions` in each locale. After editing or importing these values, run:

```bash
npm run i18n:native
npm run i18n:native:check
```

`scripts/sync-native-localizations.mjs` generates `src/i18n/native/{code}.json` and `ios/EveryBible/Supporting/{nativeCode}.lproj/InfoPlist.strings`, updates `app.json` locale configuration, and applies the iOS locale resource references to the Xcode project. The native code for `zh` is `zh-Hans`. Review the generated files together with their source translations; `--check` reports stale or missing generated resources without writing them.

iOS system permission prompts follow the device or per-app OS language, independently of the language selected inside EveryBible. These strings are native resources: updates require rebuilding and installing the app. An in-app language change or JavaScript refresh does not update installed permission messages. Verify the prompts using the intended OS language on a simulator or device.

### Offline country names

Country names use the selected interface language in settings and onboarding search. When the mobile engine lacks `Intl.DisplayNames`, the app lazily loads the checked-in `src/data/countryDisplayNames.generated.json` fallback. It covers all 249 catalog countries in all 21 languages and records Node, ICU, CLDR, and Unicode provenance.

After changing the country catalog or intentionally updating CLDR data, regenerate and review with the recorded Node/ICU version:

```bash
node --import tsx scripts/generate-country-display-names.ts
node --import tsx scripts/generate-country-display-names.ts --check
```

The workspace tests verify coverage and reproduce the mobile case where `Intl.DisplayNames` is unavailable. Country canonical names and language autonyms remain unchanged.

### 7. Verification

Run the existing gates:

```bash
node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts scripts/nativeLocalization.test.ts
npm run i18n:native:check
npm run typecheck
```

Coverage checks require exact interpolation tokens, all required plural forms, nonblank values, and no translation artifacts. Legitimate identical words, units, and proper names need explicit coverage-test exceptions rather than blanket exemptions for entire feature areas. Rendering tests exercise every locale with fallback disabled and representative plural counts, including zero, one, two, and one million. Automated checks complement contextual language review and device verification.

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
3. If permission messages changed, regenerate native resources with `npm run i18n:native`. Re-run locale coverage tests, `npm run i18n:native:check`, and typecheck.
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
- [ ] All 21 locale files preserve the complete English keyset; additional keys are valid language-specific plural forms only.
- [ ] Interpolation tokens are preserved exactly and every locale includes all required plural categories for English plural stems.
- [ ] Core locale tests pass for `es`, `hi`, `ru`, and `ne`.
- [ ] Full locale coverage tests pass.
- [ ] Source and rendering checks pass without hardcoded interface copy, missing keys, fallback, or unresolved tokens.
- [ ] Permission-message changes have regenerated native resources, pass `npm run i18n:native:check`, and are verified in a rebuilt app using the intended OS language.
- [ ] `npm run typecheck` passes.
- [ ] Release-bound updates pass `npm run release:verify`.
- [ ] Human review is complete for culturally sensitive, theological, privacy, and Tibetan-related strings.
- [ ] Rollback path is documented in the localization PR.
