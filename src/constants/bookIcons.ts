/**
 * Book Icons Mapping
 *
 * Maps Bible book IDs to their corresponding icon assets.
 * Icons are from the langquest project and help users who may not
 * be familiar with English/Latin book names to visually identify books.
 *
 * Icons are in PNG format with @2x and @3x variants for high-DPI displays.
 */

// Type for book icon assets
export type BookIconSource = ReturnType<typeof require>;

// Map book IDs to icon assets
// Book IDs match the id field in constants/books.ts (e.g., 'GEN', 'EXO', 'MAT')
export const BOOK_ICONS: Record<string, BookIconSource> = {
  // Old Testament
  GEN: require('../../assets/book-icons/gen.png'),
  EXO: require('../../assets/book-icons/exo.png'),
  LEV: require('../../assets/book-icons/lev.png'),
  NUM: require('../../assets/book-icons/num.png'),
  DEU: require('../../assets/book-icons/deu.png'),
  JOS: require('../../assets/book-icons/jos.png'),
  JDG: require('../../assets/book-icons/jdg.png'),
  RUT: require('../../assets/book-icons/rut.png'),
  '1SA': require('../../assets/book-icons/1sa.png'),
  '2SA': require('../../assets/book-icons/2sa.png'),
  '1KI': require('../../assets/book-icons/1ki.png'),
  '2KI': require('../../assets/book-icons/2ki.png'),
  '1CH': require('../../assets/book-icons/1ch.png'),
  '2CH': require('../../assets/book-icons/2ch.png'),
  EZR: require('../../assets/book-icons/ezr.png'),
  NEH: require('../../assets/book-icons/neh.png'),
  EST: require('../../assets/book-icons/est.png'),
  JOB: require('../../assets/book-icons/job.png'),
  PSA: require('../../assets/book-icons/psa.png'),
  PRO: require('../../assets/book-icons/pro.png'),
  ECC: require('../../assets/book-icons/ecc.png'),
  SNG: require('../../assets/book-icons/sng.png'),
  ISA: require('../../assets/book-icons/isa.png'),
  JER: require('../../assets/book-icons/jer.png'),
  LAM: require('../../assets/book-icons/lam.png'),
  EZK: require('../../assets/book-icons/ezk.png'),
  DAN: require('../../assets/book-icons/dan.png'),
  HOS: require('../../assets/book-icons/hos.png'),
  JOL: require('../../assets/book-icons/jol.png'),
  AMO: require('../../assets/book-icons/amo.png'),
  OBA: require('../../assets/book-icons/oba.png'),
  JON: require('../../assets/book-icons/jon.png'),
  MIC: require('../../assets/book-icons/mic.png'),
  NAM: require('../../assets/book-icons/nam.png'),
  HAB: require('../../assets/book-icons/hab.png'),
  ZEP: require('../../assets/book-icons/zep.png'),
  HAG: require('../../assets/book-icons/hag.png'),
  ZEC: require('../../assets/book-icons/zec.png'),
  MAL: require('../../assets/book-icons/mal.png'),

  // New Testament
  MAT: require('../../assets/book-icons/mat.png'),
  MRK: require('../../assets/book-icons/mrk.png'),
  LUK: require('../../assets/book-icons/luk.png'),
  JHN: require('../../assets/book-icons/jhn.png'),
  ACT: require('../../assets/book-icons/act.png'),
  ROM: require('../../assets/book-icons/rom.png'),
  '1CO': require('../../assets/book-icons/1co.png'),
  '2CO': require('../../assets/book-icons/2co.png'),
  GAL: require('../../assets/book-icons/gal.png'),
  EPH: require('../../assets/book-icons/eph.png'),
  PHP: require('../../assets/book-icons/php.png'),
  COL: require('../../assets/book-icons/col.png'),
  '1TH': require('../../assets/book-icons/1th.png'),
  '2TH': require('../../assets/book-icons/2th.png'),
  '1TI': require('../../assets/book-icons/1ti.png'),
  '2TI': require('../../assets/book-icons/2ti.png'),
  TIT: require('../../assets/book-icons/tit.png'),
  PHM: require('../../assets/book-icons/phm.png'),
  HEB: require('../../assets/book-icons/heb.png'),
  JAS: require('../../assets/book-icons/jas.png'),
  '1PE': require('../../assets/book-icons/1pe.png'),
  '2PE': require('../../assets/book-icons/2pe.png'),
  '1JN': require('../../assets/book-icons/1jn.png'),
  '2JN': require('../../assets/book-icons/2jn.png'),
  '3JN': require('../../assets/book-icons/3jn.png'),
  JUD: require('../../assets/book-icons/jud.png'),
  REV: require('../../assets/book-icons/rev.png'),
};

/**
 * Get book icon for a given book ID
 * @param bookId - Book ID (e.g., 'GEN', 'MAT')
 * @returns Icon asset or fallback to app icon if not found
 */
export function getBookIcon(bookId: string): BookIconSource {
  // Try to get icon for the book ID
  const icon = BOOK_ICONS[bookId.toUpperCase()];

  if (icon) {
    return icon;
  }

  // Fallback to app icon if specific book icon not found
  // This should never happen with all 66 books mapped, but provides safety
  return require('../../assets/icon.png');
}
