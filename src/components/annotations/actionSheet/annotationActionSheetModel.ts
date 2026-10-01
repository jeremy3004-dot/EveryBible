export const HIGHLIGHT_COLORS = [
  { id: 'red', hex: '#D95B57' },
  { id: 'yellow', hex: '#F4E2A8' },
  { id: 'orange', hex: '#E6A24C' },
  { id: 'green', hex: '#6FBF7A' },
  { id: 'blue', hex: '#4A90E2' },
] as const;

// The check on an applied colour. Near-black reads on all five swatches (4.7:1 on
// red, 5.3:1 on blue, 13.7:1 on yellow) in both themes, so it is not a theme colour.
export const HIGHLIGHT_CHECK_INK = '#1A1914';

// The sheet rises with a slight settle: damping ratio ~0.74, a few points of overshoot.
export const SHEET_RISE_SPRING = { damping: 24, stiffness: 260 } as const;

/** How far a pressed control shrinks. */
export const PRESSED_SCALE = 0.96;

// Height: the sheet grows with its content up to a share of the reader below
// the status bar, then everything under the title scrolls. At large text on a
// small phone (and in note mode with the keyboard up) the unbounded sheet was
// pushed past the top of the screen. The share leaves a strip of verses showing.
const SHEET_MAX_HEIGHT_SHARE = 0.9;
// The note field grows with the note up to this share of the window, then
// scrolls inside itself, so a long note never pushes Done under the keyboard.
export const NOTE_INPUT_MIN_HEIGHT = 124;
const NOTE_INPUT_MAX_HEIGHT_SHARE = 0.2;

// How much a note may be typed to. A saved note already longer (notes joined when a guest
// account is adopted) keeps its full length: a field capped below its value is cut on Android.
const NOTE_MAX_LENGTH = 1000;

export function getNoteMaxLength(savedNote: string | undefined): number {
  return Math.max(NOTE_MAX_LENGTH, savedNote?.length ?? 0);
}

export function getSheetMaxHeight(windowHeight: number, topInset: number): number {
  return Math.round((windowHeight - topInset) * SHEET_MAX_HEIGHT_SHARE);
}

export function getNoteInputMaxHeight(windowHeight: number): number {
  return Math.max(NOTE_INPUT_MIN_HEIGHT, Math.round(windowHeight * NOTE_INPUT_MAX_HEIGHT_SHARE));
}

/** The note Done saves, or null when the field holds only whitespace. */
export function getNoteToSave(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
