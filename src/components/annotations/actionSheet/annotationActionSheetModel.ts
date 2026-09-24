export const HIGHLIGHT_COLORS = [
  { id: 'red', hex: '#D95B57' },
  { id: 'yellow', hex: '#F4E2A8' },
  { id: 'orange', hex: '#E6A24C' },
  { id: 'green', hex: '#6FBF7A' },
  { id: 'blue', hex: '#4A90E2' },
] as const;

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
