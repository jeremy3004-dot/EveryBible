/**
 * The Berean Standard Bible text behind the /bible reading pages, in three
 * shapes: the helloao.org export in data/bsb_complete.json (source), the
 * compact per-book shards scripts/build-bible-pages.ts commits under
 * apps/site/data/bible/bsb/ (shard), and the blocks a chapter page renders.
 * Pure and dependency-free so the build script and the tests share it.
 */

// ── Source: helloao.org complete-translation JSON ───────────────────

export type SourceInline =
  | string
  | { noteId: number }
  | { lineBreak: true }
  | { text: string; poem?: number; descriptive?: boolean };

export type SourceItem =
  | { type: 'heading'; content: string[] }
  | { type: 'hebrew_subtitle'; content: SourceInline[] }
  | { type: 'line_break' }
  | { type: 'verse'; number: number; content: SourceInline[] };

export interface SourceFootnote {
  noteId: number;
  text: string;
  reference?: { chapter: number; verse?: number };
}

export interface SourceChapter {
  number: number;
  content: SourceItem[];
  footnotes?: SourceFootnote[];
}

// ── Shard: what a chapter page needs, and nothing else ──────────────

/** Relative to apps/site; traced into the chapter route by next.config.mjs. */
export const BIBLE_TEXT_DIRECTORY = 'data/bible/bsb';

export function bibleTextFile(bookId: string): string {
  return `${bookId}.json.gz`;
}

/**
 * Inside a verse or superscription: prose text, a poetry line (`q` is the
 * indent level, 1 or 2), a footnote reference (`f` indexes the chapter's
 * notes), or `0` for a line break within prose.
 */
export type ShardInline = string | { q: number; t: string } | { f: number } | 0;

/** A section heading, a psalm superscription, a verse, or `0` for a paragraph break. */
export type ShardItem = { h: string } | { s: ShardInline[] } | { v: number; c: ShardInline[] } | 0;

/** A footnote and the verse it belongs to (0 for a psalm superscription). */
export interface ShardNote {
  v: number;
  t: string;
}

export interface ShardChapter {
  c: ShardItem[];
  n?: ShardNote[];
}

/** One book: `chapters[0]` is chapter 1. */
export interface BibleBookShard {
  book: string;
  chapters: ShardChapter[];
}

function compactInline(
  item: SourceInline,
  noteIndex: ReadonlyMap<number, number>,
  where: string
): ShardInline {
  if (typeof item === 'string') return item;
  if ('noteId' in item) {
    const index = noteIndex.get(item.noteId);
    if (index === undefined) throw new Error(`${where}: footnote ${item.noteId} has no text`);
    return { f: index };
  }
  if ('lineBreak' in item) return 0;
  // One "descriptive" line (Zechariah 12:1) is an oracle title set as plain prose.
  if (typeof item.poem === 'number') return { q: item.poem, t: item.text };
  return item.text;
}

/**
 * Source chapter → shard chapter. Footnotes are renumbered in reading order
 * so the page can letter them a, b, c. An unknown item type throws, so a
 * change in the export format is noticed at build time rather than dropped.
 */
export function compactChapter(chapter: SourceChapter, where: string): ShardChapter {
  const notesById = new Map((chapter.footnotes ?? []).map((note) => [note.noteId, note]));
  const noteIndex = new Map<number, number>();
  const notes: ShardNote[] = [];
  const index = (item: SourceInline) => {
    if (typeof item !== 'object' || !('noteId' in item) || noteIndex.has(item.noteId)) return;
    const note = notesById.get(item.noteId);
    if (!note) return;
    noteIndex.set(item.noteId, notes.length);
    notes.push({ v: note.reference?.verse ?? 0, t: note.text.trim() });
  };

  const items = chapter.content.map((item): ShardItem => {
    switch (item.type) {
      case 'heading':
        return { h: item.content.join(' ').trim() };
      case 'line_break':
        return 0;
      case 'hebrew_subtitle':
        item.content.forEach(index);
        return { s: item.content.map((part) => compactInline(part, noteIndex, where)) };
      case 'verse':
        item.content.forEach(index);
        return {
          v: item.number,
          c: item.content.map((part) => compactInline(part, noteIndex, `${where}:${item.number}`)),
        };
      default:
        throw new Error(`${where}: unknown item type ${JSON.stringify(item)}`);
    }
  });
  return notes.length ? { c: items, n: notes } : { c: items };
}

// ── Render blocks ────────────────────────────────────────────────────

export type ChapterInline =
  | { kind: 'text'; text: string }
  | { kind: 'verse'; number: number }
  | { kind: 'note'; index: number }
  | { kind: 'break' };

export interface PoetryLine {
  /** 0 for a first-level line, 1 for an indented one. */
  indent: number;
  parts: ChapterInline[];
}

export type ChapterBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'superscription'; parts: ChapterInline[] }
  | { kind: 'paragraph'; parts: ChapterInline[] }
  | { kind: 'poetry'; lines: PoetryLine[] };

/** Text that attaches to what precedes it with no space: closing quotes and punctuation. */
const ATTACHES_LEFT = /^[”’)\].,;:!?]/;
/** A poetry "line" that is only a closing quote left behind by a footnote. */
const PUNCTUATION_ONLY = /^[”’)\].,;:!?]+$/;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Appends text with the space the export leaves out between its pieces
 * ("light,” [note] and there was light."): after a word, a verse number or a
 * footnote marker, but never before closing punctuation.
 */
function pushText(parts: ChapterInline[], raw: string) {
  const text = normalise(raw);
  if (!text) return;
  const last = parts.at(-1);
  const spaced = last && last.kind !== 'break' && !ATTACHES_LEFT.test(text) ? ` ${text}` : text;
  if (last?.kind === 'text') last.text += spaced;
  else parts.push({ kind: 'text', text: spaced });
}

/** A verse number, spaced from the verse before it on the same line. */
function pushVerse(parts: ChapterInline[], number: number) {
  const last = parts.at(-1);
  if (last?.kind === 'text') last.text += ' ';
  else if (last && last.kind !== 'break') parts.push({ kind: 'text', text: ' ' });
  parts.push({ kind: 'verse', number });
}

function trimTrailingBreaks(parts: ChapterInline[]) {
  while (parts.at(-1)?.kind === 'break') parts.pop();
}

/**
 * Shard chapter → blocks. Prose runs into paragraphs until the next
 * paragraph break or heading; consecutive poetry lines form a stanza. A
 * verse's number goes before its first words, whichever block they fall in,
 * so every verse is numbered exactly once.
 */
export function chapterBlocks(chapter: ShardChapter): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  // Cast, so TypeScript does not narrow `open` to null for good: the helpers below reassign it.
  let open = null as Extract<ChapterBlock, { kind: 'paragraph' | 'poetry' }> | null;

  const close = () => {
    if (open?.kind === 'paragraph') trimTrailingBreaks(open.parts);
    open = null;
  };
  const paragraph = () => {
    if (open?.kind !== 'paragraph') {
      close();
      open = { kind: 'paragraph', parts: [] };
      blocks.push(open);
    }
    return open.parts;
  };
  /** The parts that a footnote marker or punctuation attaches to. */
  const current = () => (open?.kind === 'poetry' ? open.lines.at(-1)!.parts : paragraph());

  for (const item of chapter.c) {
    if (item === 0) {
      close();
      continue;
    }
    if ('h' in item) {
      close();
      blocks.push({ kind: 'heading', text: normalise(item.h) });
      continue;
    }
    if ('s' in item) {
      close();
      const parts: ChapterInline[] = [];
      for (const part of item.s) {
        if (typeof part === 'string') pushText(parts, part);
        else if (typeof part === 'object' && 'f' in part)
          parts.push({ kind: 'note', index: part.f });
        else if (typeof part === 'object') pushText(parts, part.t);
      }
      blocks.push({ kind: 'superscription', parts });
      continue;
    }

    let pending: number | null = item.v;
    const numbered = (parts: ChapterInline[]) => {
      if (pending !== null) pushVerse(parts, pending);
      pending = null;
      return parts;
    };

    for (const part of item.c) {
      if (part === 0) {
        // Poetry is already one line per item; in prose this is a line break,
        // which may come before the verse number (the verse starts a new line).
        const last = open?.kind === 'paragraph' ? open.parts.at(-1) : undefined;
        if (open?.kind === 'paragraph' && last && last.kind !== 'break')
          open.parts.push({ kind: 'break' });
      } else if (typeof part === 'string') {
        pushText(numbered(paragraph()), part);
      } else if ('f' in part) {
        numbered(current()).push({ kind: 'note', index: part.f });
      } else if (PUNCTUATION_ONLY.test(normalise(part.t)) && open?.kind === 'poetry') {
        pushText(numbered(current()), part.t);
      } else {
        if (open?.kind !== 'poetry') {
          close();
          open = { kind: 'poetry', lines: [] };
          blocks.push(open);
        }
        const line: PoetryLine = { indent: Math.max(0, part.q - 1), parts: [] };
        open.lines.push(line);
        pushText(numbered(line.parts), part.t);
      }
    }
    // A verse with no words of its own still gets its number and anchor.
    if (pending !== null) numbered(paragraph());
  }
  close();
  return blocks;
}

// ── Footnotes and search snippets ──────────────────────────────────

/** 0 → a, 25 → z, 26 → aa: the page's footnote markers. */
export function footnoteLabel(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(97 + ((n - 1) % 26)) + label;
  return label;
}

/** The chapter's verse text alone: no headings, superscriptions or footnotes. */
export function chapterPlainText(chapter: ShardChapter): string {
  const words: string[] = [];
  for (const item of chapter.c) {
    if (item === 0 || !('v' in item)) continue;
    for (const part of item.c) {
      if (typeof part === 'string') words.push(part);
      else if (typeof part === 'object' && 't' in part) words.push(part.t);
    }
  }
  return words
    .map(normalise)
    .filter(Boolean)
    .reduce(
      (text, word) => (!text ? word : ATTACHES_LEFT.test(word) ? text + word : `${text} ${word}`),
      ''
    );
}

/** Search results show about 155 characters of a description. */
export const CHAPTER_DESCRIPTION_MAX_LENGTH = 155;

/**
 * The opening verses as a meta description, cut at a word boundary with an
 * ellipsis when the chapter runs longer, never mid-word or after a dangling
 * comma or opening quote.
 */
export function chapterDescription(
  chapter: ShardChapter,
  max = CHAPTER_DESCRIPTION_MAX_LENGTH
): string {
  const text = chapterPlainText(chapter);
  if (text.length <= max) return text;
  const room = max - 1; // one character for the ellipsis
  const boundary = text.lastIndexOf(' ', room);
  return `${text.slice(0, boundary > 0 ? boundary : room).replace(/[\s,;:—–\-“‘(]+$/, '')}…`;
}
