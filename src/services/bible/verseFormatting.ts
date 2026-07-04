import type { VerseFormatting, VerseFormattingLine } from '../../types';

const sanitizeVerseFormattingLine = (value: unknown): VerseFormattingLine | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    indentLevel?: unknown;
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

  return indentLevel && indentLevel > 0 ? { text, indentLevel } : { text };
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
