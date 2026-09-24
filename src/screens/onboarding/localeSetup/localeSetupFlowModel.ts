// Pure pieces of the locale setup flow: step movement, which search field is
// live, how the Bible options group under their letter headings, and the flag
// shown beside a chosen nation. No React and no locale engine, so nothing here
// touches the first-run startup cost.
import type { SetupStep } from '../localeSetupModel';

/** The step `offset` away from `step`, or null past either end of the flow. */
export function getAdjacentSetupStep(
  steps: readonly SetupStep[],
  step: SetupStep,
  offset: 1 | -1
): SetupStep | null {
  return steps[steps.indexOf(step) + offset] ?? null;
}

/** The search text the current step filters by; steps without a search field have none. */
export function getActiveSearchQuery(
  step: SetupStep,
  queries: { translation: string; country: string; language: string }
): string {
  switch (step) {
    case 'translation':
      return queries.translation;
    case 'country':
      return queries.country;
    case 'contentLanguage':
      return queries.language;
    default:
      return '';
  }
}

/**
 * Consecutive options with the same group label, as sections. The options arrive
 * already sorted, so a label never reappears after its run ends.
 */
export function groupOptionsIntoSections<TOption extends { groupLabel: string }>(
  options: readonly TOption[]
): Array<{ groupLabel: string; options: TOption[] }> {
  const sections: Array<{ groupLabel: string; options: TOption[] }> = [];

  for (const option of options) {
    const currentSection = sections[sections.length - 1];
    if (currentSection?.groupLabel === option.groupLabel) {
      currentSection.options.push(option);
    } else {
      sections.push({ groupLabel: option.groupLabel, options: [option] });
    }
  }

  return sections;
}

/** The regional-indicator flag for an ISO 3166 alpha-2 code, or '' for anything else. */
export function getFlagEmoji(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return '';
  }

  return String.fromCodePoint(...countryCode.split('').map((char) => 127397 + char.charCodeAt(0)));
}
