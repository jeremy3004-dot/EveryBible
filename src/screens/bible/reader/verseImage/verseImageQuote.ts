const OPEN_DOUBLE = '“';
const CLOSE_DOUBLE = '”';
const OPEN_SINGLE = '‘';
const CLOSE_SINGLE = '’';

const isLetter = (char: string | undefined) => char !== undefined && /\p{L}/u.test(char);

/**
 * Sets a verse in the picture's outer curly quotes. The Bible text nests its own
 * quotations in double quotes, so inside the new outer pair they step down a level
 * (double to single, single to double), as typography nests them. A verse that already
 * opens with a quote is shown as written: wrapping it would only stack the marks.
 */
export function quoteVerseForImage(verse: string): string {
  const first = verse.charAt(0);
  if (first === OPEN_DOUBLE || first === OPEN_SINGLE) return verse;

  let openSingles = 0;
  let nested = '';
  const chars = Array.from(verse);
  chars.forEach((char, index) => {
    if (char === OPEN_DOUBLE) nested += OPEN_SINGLE;
    else if (char === CLOSE_DOUBLE) nested += CLOSE_SINGLE;
    else if (char === OPEN_SINGLE) {
      openSingles += 1;
      nested += OPEN_DOUBLE;
    } else if (char === CLOSE_SINGLE) {
      // A right single quote between two letters, or with no single quote open, is an
      // apostrophe (God’s), not the end of a quotation.
      const apostrophe = isLetter(chars[index - 1]) && isLetter(chars[index + 1]);
      if (openSingles > 0 && !apostrophe) {
        openSingles -= 1;
        nested += CLOSE_DOUBLE;
      } else {
        nested += char;
      }
    } else nested += char;
  });
  return `${OPEN_DOUBLE}${nested}${CLOSE_DOUBLE}`;
}
