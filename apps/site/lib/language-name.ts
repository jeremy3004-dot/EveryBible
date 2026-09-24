/**
 * Display clean-up for language and dialect names on the /languages pages.
 *
 * The Every Language project tracker has hand-typed names with editing noise
 * ("Marwari.", "Farsi:", "Bhatri {Delete}1", "Tunen (change to tvu)", double
 * spaces). The pages show a cleaned name; the source data, the map snapshot and
 * the page slugs keep the original, so URLs do not move when a name is tidied.
 *
 * Only unambiguous noise is removed, in this order:
 * 1. whitespace runs (including no-break spaces) collapse to one space;
 * 2. trailing tracker notes in braces, with any counter: "{Delete}", "{Delete}2";
 * 3. trailing editorial notes in parentheses that start with change, rename,
 *    merge or move: "(change to tvu)";
 * 4. trailing stray punctuation: . : ; , - – — / — except one period after a
 *    one- or two-letter abbreviation ("Aeta of Panay Is.").
 * Leading characters are never touched: "/=Haba" and "!Xóõ" spell click sounds.
 * Brackets that qualify a name ("Buru [Nigeria]") are kept. A name that would
 * be emptied is returned with only its whitespace collapsed.
 *
 * Kept dependency-free, like language-slug.ts.
 */

const TRAILING_BRACE_NOTE = /\s*\{[^{}]*\}\s*\d*$/;
const TRAILING_EDITORIAL_NOTE =
  /\s*\((?:change|changed|rename|renamed|merge|merged|move|moved)\b[^()]*\)$/i;
const TRAILING_PUNCTUATION = /^(.*?)([\s.:;,\-–—/]+)$/;
const SHORT_ABBREVIATION = /(?:^|[\s,:(])\p{L}{1,2}$/u;

export function normalizeLanguageName(name: string): string {
  const collapsed = name.replace(/\s+/g, ' ').trim();
  let value = collapsed;
  for (let previous = ''; previous !== value; ) {
    previous = value;
    value = value.replace(TRAILING_BRACE_NOTE, '').replace(TRAILING_EDITORIAL_NOTE, '');
    const match = TRAILING_PUNCTUATION.exec(value);
    if (match) {
      const [, base, trailing] = match;
      value = trailing.includes('.') && SHORT_ABBREVIATION.test(base) ? `${base}.` : base;
    }
  }
  return value || collapsed;
}
