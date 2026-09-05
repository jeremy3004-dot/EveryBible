/**
 * Offline country labels for engines without Intl.DisplayNames.
 * Regenerate: node --import tsx scripts/generate-country-display-names.ts
 * Verify: append --check. Use the Node/ICU versions recorded in the JSON metadata
 * to reproduce the checked-in CLDR names exactly. No network access is needed.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import catalog from '../src/data/localeCatalog.json';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../src/constants/languages';
import { COUNTRY_DISPLAY_LOCALES } from '../src/services/onboarding/localeSelection';

export function generateCountryDisplayNames() {
  const countries = catalog.countries.map(({ code }) => code).sort();
  const names: Record<string, Record<string, string>> = {};
  const resolvedLocales: Record<string, string> = {};
  for (const { code } of SUPPORTED_LANGUAGES) {
    const requested = COUNTRY_DISPLAY_LOCALES[code];
    assert.ok(
      Intl.DisplayNames.supportedLocalesOf(requested).length,
      `Missing ICU locale: ${code}`
    );
    const formatter = new Intl.DisplayNames([...requested, DEFAULT_LANGUAGE], {
      type: 'region',
      fallback: 'none',
    });
    resolvedLocales[code] = formatter.resolvedOptions().locale;
    names[code] = Object.fromEntries(
      countries.map((country) => {
        const name = formatter.of(country);
        assert.ok(
          typeof name === 'string' && name.trim() && name !== country,
          `Missing country label: ${code}.${country}`
        );
        return [country, name];
      })
    );
  }
  return {
    metadata: {
      source: 'Unicode CLDR via Node.js Intl.DisplayNames / ICU',
      generator: 'scripts/generate-country-display-names.ts',
      node: process.versions.node,
      icu: process.versions.icu,
      cldr: process.versions.cldr,
      unicode: process.versions.unicode,
      resolvedLocales,
    },
    names,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = fileURLToPath(
    new URL('../src/data/countryDisplayNames.generated.json', import.meta.url)
  );
  const data = generateCountryDisplayNames();
  if (process.argv.includes('--check')) {
    const saved = JSON.parse(readFileSync(target, 'utf8')) as ReturnType<
      typeof generateCountryDisplayNames
    >;
    assert.deepEqual(
      data.names,
      saved.names,
      'Country labels changed; regenerate with the intended ICU version'
    );
    assert.deepEqual(data.metadata.resolvedLocales, saved.metadata.resolvedLocales);
    console.log('Offline country names match the current catalog and ICU data.');
  } else {
    writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
    console.log(
      `Generated ${SUPPORTED_LANGUAGES.length} locales × ${catalog.countries.length} countries.`
    );
  }
}
