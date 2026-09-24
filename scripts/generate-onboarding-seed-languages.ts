/**
 * The small slice of the locale catalog onboarding needs to rank its pinned Bible
 * recommendation on the first frame, before the 129 KB locale search engine is loaded.
 * It holds every catalog language whose ISO 639-1 code is an interface language, with
 * each lower-cased name the engine's getLanguageByName resolves to that language.
 *
 * Regenerate: node --import tsx scripts/generate-onboarding-seed-languages.ts
 * Verify: append --check.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import catalog from '../src/data/localeCatalog.json';
import { SUPPORTED_LANGUAGES } from '../src/constants/languages';
import {
  createLocaleSearchEngine,
  type LocaleCatalog,
} from '../src/services/onboarding/localeSelection';

export interface OnboardingSeedLanguage {
  iso6391: string;
  countryCodes: string[];
  /** Lower-cased, trimmed names the engine resolves to this language. */
  names: string[];
}

export function generateOnboardingSeedLanguages(): {
  metadata: { source: string; generator: string };
  languages: OnboardingSeedLanguage[];
} {
  const engine = createLocaleSearchEngine(catalog as LocaleCatalog);
  const interfaceCodes = new Set<string>(SUPPORTED_LANGUAGES.map(({ code }) => code));
  const languages: OnboardingSeedLanguage[] = [];

  for (const language of engine.languages) {
    if (!language.iso6391 || !interfaceCodes.has(language.iso6391)) {
      continue;
    }

    // Only names the engine itself would answer with this language: an alias an
    // earlier language already claimed stays out, so the seed can never disagree.
    const names = [
      ...new Set(
        [language.name, language.nativeName, ...language.aliases]
          .map((name) => name.trim().toLowerCase())
          .filter((name) => name && engine.getLanguageByName(name) === language)
      ),
    ].sort();

    if (names.length > 0) {
      languages.push({
        iso6391: language.iso6391,
        countryCodes: [...language.countryCodes],
        names,
      });
    }
  }

  languages.sort((left, right) =>
    left.iso6391 === right.iso6391
      ? left.names[0] < right.names[0]
        ? -1
        : 1
      : left.iso6391 < right.iso6391
        ? -1
        : 1
  );

  return {
    metadata: {
      source: 'src/data/localeCatalog.json',
      generator: 'scripts/generate-onboarding-seed-languages.ts',
    },
    languages,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = fileURLToPath(
    new URL('../src/data/onboardingSeedLanguages.generated.json', import.meta.url)
  );
  const data = generateOnboardingSeedLanguages();
  if (process.argv.includes('--check')) {
    const saved = JSON.parse(readFileSync(target, 'utf8')) as typeof data;
    assert.deepEqual(saved, data, 'Onboarding seed languages are stale; regenerate them');
    console.log('Onboarding seed languages match the locale catalog.');
  } else {
    writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Generated ${data.languages.length} onboarding seed languages.`);
  }
}
