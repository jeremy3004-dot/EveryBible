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

export const normalizeVerseFormatting = (value: unknown): VerseFormatting | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    try {
      return normalizeVerseFormatting(JSON.parse(value));
    } catch {
      return undefined;
    }
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
