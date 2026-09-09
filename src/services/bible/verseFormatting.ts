import type { VerseFormatting, VerseFormattingLine } from '../../types';

const sanitizeVerseFormattingLine = (value: unknown): VerseFormattingLine | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    indentLevel?: unknown;
    prose?: unknown;
    text?: unknown;
  };

  if (typeof candidate.text !== 'string') {
    return null;
  }

  const text = candidate.text.trim();
  if (text.length === 0) {
    return null;
  }

  const indentLevel =
    typeof candidate.indentLevel === 'number' && Number.isFinite(candidate.indentLevel)
      ? Math.max(0, Math.floor(candidate.indentLevel))
      : undefined;

  const base = indentLevel && indentLevel > 0 ? { text, indentLevel } : { text };
  return candidate.prose === true ? { ...base, prose: true } : base;
};

// Small LRU cache keyed by the raw formatting JSON string. normalizeVerseFormatting runs once per
// verse on every chapter load; poetry-heavy chapters (e.g. Psalm 119 = 176 rows) otherwise pay a
// JSON.parse + full sanitize per row. Formatting strings repeat heavily across verses and chapters,
// so caching the parsed result avoids that cost on Hermes (no JIT). (L2)
const VERSE_FORMATTING_CACHE_LIMIT = 256;
const verseFormattingCache = new Map<string, VerseFormatting | undefined>();

const getCachedVerseFormatting = (raw: string): VerseFormatting | undefined => {
  const cached = verseFormattingCache.get(raw);
  if (cached !== undefined || verseFormattingCache.has(raw)) {
    // Refresh recency (Map preserves insertion order — re-insert to move to the end).
    verseFormattingCache.delete(raw);
    verseFormattingCache.set(raw, cached);
    return cached;
  }

  let parsed: VerseFormatting | undefined;
  try {
    parsed = normalizeVerseFormatting(JSON.parse(raw));
  } catch {
    parsed = undefined;
  }

  verseFormattingCache.set(raw, parsed);
  if (verseFormattingCache.size > VERSE_FORMATTING_CACHE_LIMIT) {
    const oldestKey = verseFormattingCache.keys().next().value;
    if (oldestKey !== undefined) {
      verseFormattingCache.delete(oldestKey);
    }
  }

  return parsed;
};

export const normalizeVerseFormatting = (value: unknown): VerseFormatting | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return getCachedVerseFormatting(value);
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as {
    lines?: unknown;
    mode?: unknown;
  };

  if (!Array.isArray(candidate.lines)) {
    return undefined;
  }

  const lines = candidate.lines
    .map((line) => sanitizeVerseFormattingLine(line))
    .filter((line): line is VerseFormattingLine => line != null);

  if (lines.length === 0) {
    return undefined;
  }

  const mode = candidate.mode === 'poetry' ? 'poetry' : 'lines';
  return { mode, lines };
};

export const serializeVerseFormatting = (value: unknown): string | null => {
  const formatting = normalizeVerseFormatting(value);
  return formatting ? JSON.stringify(formatting) : null;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locate `needle` in `text` at or after `from`, returning its [start, end) span.
 * Falls back to a whitespace-tolerant match because stored lines collapse the runs of
 * spaces and newlines that the verse text preserves.
 */
const findLineSpan = (text: string, needle: string, from: number): [number, number] | null => {
  const exact = text.indexOf(needle, from);
  if (exact >= 0) {
    return [exact, exact + needle.length];
  }

  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }

  const match = new RegExp(words.map(escapeRegExp).join('\\s+')).exec(text.slice(from));
  return match ? [from + match.index, from + match.index + match[0].length] : null;
};

/**
 * Poetry formatting stores only the poetic lines, so any prose wrapped around them — the
 * lead-in before a quotation, an interjected "Or again:", a trailing clause — exists in the
 * verse text but in no line, and the reader dropped it entirely (666 BSB verses, e.g.
 * Hebrews 1:5). This walks the verse text alongside the stored lines and reinstates every
 * uncovered run as a `prose` line, so the rendered lines always reproduce the whole verse.
 *
 * Conservative by design: if any line cannot be located in the text the stored formatting is
 * returned untouched, and when nothing is missing the original object is returned by identity
 * so unaffected verses allocate nothing.
 */
export const reconcileVerseFormattingWithText = (
  text: string,
  formatting: VerseFormatting | undefined
): VerseFormatting | undefined => {
  if (!formatting || formatting.lines.length === 0 || typeof text !== 'string') {
    return formatting;
  }

  const rebuilt: VerseFormattingLine[] = [];
  let cursor = 0;
  let recoveredProse = false;

  for (const line of formatting.lines) {
    const span = findLineSpan(text, line.text, cursor);
    if (!span) {
      return formatting;
    }

    const gap = text.slice(cursor, span[0]).trim();
    if (gap.length > 0) {
      rebuilt.push({ text: gap, prose: true });
      recoveredProse = true;
    }

    rebuilt.push(line);
    cursor = span[1];
  }

  const tail = text.slice(cursor).trim();
  if (tail.length > 0) {
    rebuilt.push({ text: tail, prose: true });
    recoveredProse = true;
  }

  return recoveredProse ? { mode: formatting.mode, lines: rebuilt } : formatting;
};
