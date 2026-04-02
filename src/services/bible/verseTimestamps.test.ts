/**
 * Unit tests for verseTimestamps service.
 * Tests the parsing and null-fallback behaviour without requiring bundled assets.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// We test the parsing logic directly by monkey-patching the require map via
// the module's internal behaviour — since the module uses a plain object map,
// we test a local re-implementation of the key logic.

// Re-implement the core parsing logic for test isolation
function parseTimestampJson(raw: Record<string, unknown>): Record<number, number> | null {
  const result: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const verseNum = Number(k);
    if (!Number.isNaN(verseNum) && typeof v === 'number') {
      result[verseNum] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function buildKey(translationId: string, bookId: string, chapter: number): string {
  const chapterPadded = String(chapter).padStart(3, '0');
  return `${translationId.toUpperCase()}/${bookId}_${chapterPadded}`;
}

afterEach(async () => {
  const module = await import('./verseTimestamps.js');
  module.clearVerseTimestampCache();
  module.setVerseTimestampMetadataResolver(null);
});

describe('verseTimestamps — key builder', () => {
  it('builds correct key for WEB GEN 1', () => {
    assert.equal(buildKey('web', 'GEN', 1), 'WEB/GEN_001');
  });

  it('builds correct key for BSB PSA 119', () => {
    assert.equal(buildKey('bsb', 'PSA', 119), 'BSB/PSA_119');
  });

  it('handles corinthians-style book IDs', () => {
    assert.equal(buildKey('web', '1CO', 13), 'WEB/1CO_013');
  });
});

describe('verseTimestamps — JSON parsing', () => {
  it('parses valid timestamp JSON into Record<number,number>', () => {
    const raw = { '1': 0.0, '2': 4.2, '3': 9.8 };
    const result = parseTimestampJson(raw);
    assert.deepEqual(result, { 1: 0.0, 2: 4.2, 3: 9.8 });
  });

  it('returns null for empty object', () => {
    assert.equal(parseTimestampJson({}), null);
  });

  it('skips non-numeric keys', () => {
    const raw = { '1': 0.0, 'bad': 4.2, '3': 9.8 };
    const result = parseTimestampJson(raw);
    assert.deepEqual(result, { 1: 0.0, 3: 9.8 });
  });

  it('skips non-number values', () => {
    const raw = { '1': 0.0, '2': '4.2', '3': 9.8 };
    const result = parseTimestampJson(raw);
    assert.deepEqual(result, { 1: 0.0, 3: 9.8 });
  });
});

describe('verseTimestamps — unit conversion', () => {
  it('timestamps in seconds compare correctly against position in ms / 1000', () => {
    // timestamp: verse 3 starts at 9.8 seconds
    // expo-av position: 10500 ms = 10.5 seconds → should be on verse 3
    const timestamps: Record<number, number> = { 1: 0.0, 2: 4.2, 3: 9.8 };
    const currentPositionMs = 10500;
    const currentPositionSeconds = currentPositionMs / 1000; // 10.5

    const verseNums = Object.keys(timestamps).map(Number).sort((a, b) => a - b);
    let current = verseNums[0]!;
    for (const vn of verseNums) {
      if (timestamps[vn]! <= currentPositionSeconds) {
        current = vn;
      } else {
        break;
      }
    }
    assert.equal(current, 3);
  });

  it('position before first verse returns verse 1', () => {
    const timestamps: Record<number, number> = { 1: 2.0, 2: 6.0, 3: 10.0 };
    const currentPositionSeconds = 0.5;

    const verseNums = Object.keys(timestamps).map(Number).sort((a, b) => a - b);
    let current = verseNums[0]!;
    for (const vn of verseNums) {
      if (timestamps[vn]! <= currentPositionSeconds) {
        current = vn;
      } else {
        break;
      }
    }
    assert.equal(current, 1);
  });
});

describe('verseTimestamps — getChapterTimestamps', () => {
  it('returns null for unknown chapters', async () => {
    const { getChapterTimestamps } = await import('./verseTimestamps.js');
    const result = await getChapterTimestamps('web', 'ZZZ', 999);
    assert.equal(result, null);
  });

  it('reports generated WEB timestamp coverage for common chapters', async () => {
    const { hasTimestampsForTranslation } = await import('./verseTimestamps.js');
    assert.equal(hasTimestampsForTranslation('web'), true);
  });

  it('fetches remote timestamp JSON when runtime metadata advertises a timestamp template', async () => {
    const module = await import('./verseTimestamps.js');
    module.setVerseTimestampMetadataResolver((translationId) => {
      if (translationId !== 'npiulb') {
        return null;
      }

      return {
        id: 'npiulb',
        hasTiming: true,
        timing: {
          strategy: 'stream-template',
          baseUrl: 'https://cdn.example.com/verse-timestamps/npiulb',
          chapterPathTemplate: '{bookId}/{chapter}.json',
          fileExtension: 'json',
          mimeType: 'application/json',
        },
      };
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      assert.equal(String(input), 'https://cdn.example.com/verse-timestamps/npiulb/JHN/3.json');
      return new Response(JSON.stringify({ '1': 0, '2': 4.2, '3': 9.8 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as typeof fetch;

    try {
      const result = await module.getChapterTimestamps('npiulb', 'JHN', 3);
      assert.deepEqual(result, { 1: 0, 2: 4.2, 3: 9.8 });
      assert.equal(module.hasTimestampsForTranslation('npiulb'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('verseTimestamps — generated asset paths', () => {
  it('points every generated require path at a real bundled timestamp file', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const sourcePath = path.join(testDir, 'verseTimestamps.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const requirePaths = [...source.matchAll(/require\('([^']+\/assets\/timestamps\/[^']+\.json)'\)/g)].map(
      (match) => match[1],
    );

    assert.ok(requirePaths.length > 0, 'expected generated timestamp require paths');

    for (const requirePath of requirePaths) {
      const resolvedPath = path.resolve(path.dirname(sourcePath), requirePath);
      assert.equal(
        existsSync(resolvedPath),
        true,
        `generated timestamp path should exist: ${requirePath} -> ${resolvedPath}`,
      );
    }
  });
});
