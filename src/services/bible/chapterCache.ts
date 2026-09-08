import type { Verse } from '../../types';

function copyVerses(verses: Verse[]): Verse[] {
  return verses.map((verse) => ({
    ...verse,
    ...(verse.formatting
      ? {
          formatting: {
            ...verse.formatting,
            lines: verse.formatting.lines.map((line) => ({ ...line })),
          },
        }
      : {}),
  }));
}

/** Small LRU of chapter text; pending reads are shared, never serialized. */
export class ChapterCache {
  private readonly recent = new Map<string, Verse[]>();
  private readonly pending = new Map<string, Promise<Verse[]>>();
  private generation = 0;

  constructor(private readonly capacity = 8) {}

  clear(): void {
    this.generation++;
    this.recent.clear();
    this.pending.clear();
  }

  async get(keySource: string | (() => string), load: () => Promise<Verse[]>): Promise<Verse[]> {
    const resolveKey = typeof keySource === 'string' ? () => keySource : keySource;
    const key = resolveKey();
    const cached = this.recent.get(key);
    if (cached) {
      this.recent.delete(key);
      this.recent.set(key, cached);
      return copyVerses(cached);
    }
    const readGeneration = this.generation;
    let request = this.pending.get(key);
    if (!request) {
      const generation = this.generation;
      request = load().then((verses) => {
        const stored = copyVerses(verses);
        if (generation === this.generation && key === resolveKey() && stored.length > 0) {
          this.recent.set(key, stored);
          if (this.recent.size > this.capacity) {
            this.recent.delete(this.recent.keys().next().value!);
          }
        }
        return stored;
      });
      this.pending.set(key, request);
    }
    try {
      const verses = await request;
      if (readGeneration !== this.generation || key !== resolveKey()) {
        return this.get(keySource, load);
      }
      return copyVerses(verses);
    } finally {
      if (this.pending.get(key) === request) this.pending.delete(key);
    }
  }
}

export const chapterCache = new ChapterCache();
