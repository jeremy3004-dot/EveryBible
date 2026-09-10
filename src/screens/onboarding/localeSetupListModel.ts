// Pure item-flattening for the virtualized onboarding lists.
//
// WHY this exists: LocaleSetupFlow used to render every row of every list inside
// a single ScrollView via `.map()`, so the Bible-language step mounted hundreds
// of rows in one commit. On Hermes (no JIT) that much synchronous mount work
// saturates the JS thread on low-end Android — the same failure mode as the
// onboarding infinite-spinner bug. The steps now feed a FlashList, which wants a
// flat array of items rather than nested sections.
//
// Because the grouped "card" look can no longer come from one AppCard wrapper
// around a section (rows are mounted and recycled independently), every row item
// carries the position it holds inside its group so it can draw its own card
// edges: top radius on `first`/`only`, bottom radius on `last`/`only`, hairline
// separator on everything but the last row.
//
// Everything here is a plain function over plain data — no React, no React
// Native — so the flattening rules are unit testable on their own.

export type LocaleSetupGroupPosition = 'only' | 'first' | 'middle' | 'last';

export function getLocaleSetupGroupPosition(
  index: number,
  count: number
): LocaleSetupGroupPosition {
  if (count <= 1) {
    return 'only';
  }
  if (index <= 0) {
    return 'first';
  }
  if (index >= count - 1) {
    return 'last';
  }
  return 'middle';
}

/**
 * A row draws its hairline separator unless it closes its group — the same
 * `isLast` semantics the rows had when a whole section lived inside one AppCard.
 */
export function isLastInLocaleSetupGroup(position: LocaleSetupGroupPosition): boolean {
  return position === 'last' || position === 'only';
}

export interface LocaleSetupEyebrowItem {
  type: 'eyebrow';
  id: string;
  label: string;
  /**
   * Section eyebrows carry the `listSection` top margin. The pinned
   * recommendation eyebrow does not: it sits flush under the search field,
   * exactly as it did inside the ScrollView.
   */
  hasSectionSpacing: boolean;
}

export interface LocaleSetupEmptyItem {
  type: 'empty';
  id: string;
}

/* -------------------------------------------------------------------------- */
/* Bible language step                                                        */
/* -------------------------------------------------------------------------- */

export interface BibleLanguageOptionSection<TOption> {
  groupLabel: string;
  options: TOption[];
}

export type BibleLanguageListItem<TOption> =
  | LocaleSetupEyebrowItem
  | LocaleSetupEmptyItem
  | { type: 'loading'; id: string }
  | { type: 'catalogError'; id: string }
  | { type: 'primaryOption'; id: string; option: TOption; isRecommended: boolean }
  | { type: 'option'; id: string; option: TOption; position: LocaleSetupGroupPosition };

export interface BibleLanguageListInput<TOption extends { key: string }> {
  /** Alphabetically grouped Bible language options (A, B, C, … sections). */
  sections: BibleLanguageOptionSection<TOption>[];
  /** The single pinned recommendation, or null when there is nothing to pin. */
  primaryOption: TOption | null;
  /** True in `initial` mode: the primary option is pinned above the full list. */
  showsPrimaryOption: boolean;
  /** True when the pinned option should wear the RECOMMENDED chip. */
  pinsRecommendedOption: boolean;
  showsFullList: boolean;
  isHydratingRuntimeCatalog: boolean;
  runtimeCatalogLoadFailed: boolean;
  /** False when the catalog produced no options at all (drives the empty card). */
  hasAnyOptions: boolean;
  /** Already-translated label for the pinned recommendation eyebrow. */
  recommendedLabel: string;
}

export function buildBibleLanguageListItems<TOption extends { key: string }>({
  sections,
  primaryOption,
  showsPrimaryOption,
  pinsRecommendedOption,
  showsFullList,
  isHydratingRuntimeCatalog,
  runtimeCatalogLoadFailed,
  hasAnyOptions,
  recommendedLabel,
}: BibleLanguageListInput<TOption>): BibleLanguageListItem<TOption>[] {
  const items: BibleLanguageListItem<TOption>[] = [];

  if (isHydratingRuntimeCatalog) {
    items.push({ type: 'loading', id: 'loading' });
  }

  if (runtimeCatalogLoadFailed) {
    items.push({ type: 'catalogError', id: 'catalog-error' });
  }

  const pinnedOption = showsPrimaryOption ? primaryOption : null;

  if (pinnedOption) {
    items.push({
      type: 'eyebrow',
      id: 'eyebrow-recommended',
      label: recommendedLabel,
      hasSectionSpacing: false,
    });
    items.push({
      type: 'primaryOption',
      id: `primary-${pinnedOption.key}`,
      option: pinnedOption,
      isRecommended: pinsRecommendedOption,
    });
  }

  if (showsFullList) {
    for (const section of sections) {
      // The pinned option is shown once, above the list — never twice.
      const sectionOptions = pinnedOption
        ? section.options.filter((option) => option.key !== pinnedOption.key)
        : section.options;

      if (sectionOptions.length === 0) {
        continue;
      }

      items.push({
        type: 'eyebrow',
        id: `eyebrow-${section.groupLabel}`,
        label: section.groupLabel,
        hasSectionSpacing: true,
      });

      sectionOptions.forEach((option, index) => {
        items.push({
          type: 'option',
          id: `option-${option.key}`,
          option,
          position: getLocaleSetupGroupPosition(index, sectionOptions.length),
        });
      });
    }
  }

  if (!isHydratingRuntimeCatalog && !hasAnyOptions) {
    items.push({ type: 'empty', id: 'empty' });
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* Nation step                                                                */
/* -------------------------------------------------------------------------- */

export type CountryListItem =
  | LocaleSetupEyebrowItem
  | LocaleSetupEmptyItem
  | { type: 'suggestedCountry'; id: string; countryCode: string }
  | { type: 'country'; id: string; countryCode: string; position: LocaleSetupGroupPosition };

export interface CountryListInput {
  /** The device-suggested nation, pinned above the list while search is empty. */
  suggestedCountryCode: string | null;
  /** Search results (or the whole catalog), already minus the suggested nation. */
  listedCountryCodes: string[];
  /** Already-translated eyebrow labels. */
  suggestedLabel: string;
  listLabel: string;
}

export function buildCountryListItems({
  suggestedCountryCode,
  listedCountryCodes,
  suggestedLabel,
  listLabel,
}: CountryListInput): CountryListItem[] {
  const items: CountryListItem[] = [];

  if (suggestedCountryCode) {
    items.push({
      type: 'eyebrow',
      id: 'eyebrow-suggested',
      label: suggestedLabel,
      hasSectionSpacing: true,
    });
    items.push({
      type: 'suggestedCountry',
      id: `suggested-${suggestedCountryCode}`,
      countryCode: suggestedCountryCode,
    });
  }

  items.push({
    type: 'eyebrow',
    id: 'eyebrow-countries',
    label: listLabel,
    hasSectionSpacing: true,
  });

  if (listedCountryCodes.length === 0) {
    items.push({ type: 'empty', id: 'empty' });
    return items;
  }

  listedCountryCodes.forEach((countryCode, index) => {
    items.push({
      type: 'country',
      id: `country-${countryCode}`,
      countryCode,
      position: getLocaleSetupGroupPosition(index, listedCountryCodes.length),
    });
  });

  return items;
}

/* -------------------------------------------------------------------------- */
/* Content language step                                                      */
/* -------------------------------------------------------------------------- */

export type ContentLanguageListItem<TLanguage> =
  | LocaleSetupEyebrowItem
  | LocaleSetupEmptyItem
  | {
      type: 'language';
      id: string;
      language: TLanguage;
      isRecommended: boolean;
      position: LocaleSetupGroupPosition;
    };

export interface ContentLanguageListInput<TLanguage extends { code: string }> {
  recommended: TLanguage[];
  global: TLanguage[];
  /** Already-translated eyebrow labels. */
  recommendedLabel: string;
  moreLabel: string;
}

export function buildContentLanguageListItems<TLanguage extends { code: string }>({
  recommended,
  global,
  recommendedLabel,
  moreLabel,
}: ContentLanguageListInput<TLanguage>): ContentLanguageListItem<TLanguage>[] {
  const items: ContentLanguageListItem<TLanguage>[] = [];

  if (recommended.length > 0) {
    items.push({
      type: 'eyebrow',
      id: 'eyebrow-recommended-languages',
      label: recommendedLabel,
      hasSectionSpacing: true,
    });

    recommended.forEach((language, index) => {
      items.push({
        type: 'language',
        id: `recommended-${language.code}`,
        language,
        isRecommended: true,
        position: getLocaleSetupGroupPosition(index, recommended.length),
      });
    });
  }

  if (global.length > 0) {
    items.push({
      type: 'eyebrow',
      id: 'eyebrow-more-languages',
      label: moreLabel,
      hasSectionSpacing: true,
    });

    global.forEach((language, index) => {
      items.push({
        type: 'language',
        id: `global-${language.code}`,
        language,
        isRecommended: false,
        position: getLocaleSetupGroupPosition(index, global.length),
      });
    });
  }

  if (recommended.length === 0 && global.length === 0) {
    items.push({ type: 'empty', id: 'empty' });
  }

  return items;
}
