/**
 * Glottolog files languages it cannot place in a family under pseudo-families
 * ("Bookkeeping", "Unclassifiable", "Sign Language", ...). They are not
 * language families, so the public pages never write "in the Bookkeeping
 * family". Kept dependency-free: the atlas client imports it.
 */
const PSEUDO_FAMILY_NOUNS: Readonly<Record<string, string>> = {
  Bookkeeping: 'a language',
  Unclassifiable: 'a language',
  Unattested: 'a language',
  'Sign Language': 'a sign language',
  Pidgin: 'a pidgin',
  'Mixed Language': 'a mixed language',
  'Artificial Language': 'a constructed language',
  'Speech Register': 'a speech register',
};

/** The language family, or null when there is none or it is a pseudo-family. */
export function languageFamily(family: string | null): string | null {
  return family && !Object.hasOwn(PSEUDO_FAMILY_NOUNS, family) ? family : null;
}

/** "a language", or what a pseudo-family says the language is ("a sign language"). */
export function languageNoun(family: string | null): string {
  return family && Object.hasOwn(PSEUDO_FAMILY_NOUNS, family)
    ? PSEUDO_FAMILY_NOUNS[family]
    : 'a language';
}
