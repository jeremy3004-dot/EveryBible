import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import type { RepeatPassage } from '../types';
import {
  PASSAGE_BOUNDARY_SCHEDULE_WINDOW_MS,
  PASSAGE_TIMESTAMP_LEAD_MS,
  checkPassageEndBoundary,
  isPassageChapter,
  isPassagePosition,
  normalizeRepeatPassage,
  resolvePassageChapterAdvance,
  resolvePassageChapterBounds,
  resolvePassageLoopStart,
  resolvePassageLoopStartMs,
  resolvePassageVerseEndMs,
  resolvePassageVerseStartMs,
  type PassageVerseTimings,
} from './audioRepeatPassageModel';

// FC_SEED=$RANDOM FC_RUNS=20000 node --test --import tsx src/stores/audioRepeatPassageModel.test.ts
const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260926),
  numRuns: Number(process.env.FC_RUNS ?? 500),
};

const LEAD = PASSAGE_TIMESTAMP_LEAD_MS;

// John 3's first verses as bundled for BSB: the heading is read before verse 1.
const JOHN_3: PassageVerseTimings = { 1: 4.92, 2: 10.04, 3: 22.04, 4: 29.3, 5: 37.64, 6: 46.42 };

const passage = (
  bookId: string,
  start: [number, number],
  end: [number, number]
): RepeatPassage => ({
  bookId,
  start: { chapter: start[0], verse: start[1] },
  end: { chapter: end[0], verse: end[1] },
});

test('a verse starts at its recorded time, a little early so its first word is kept', () => {
  assert.equal(resolvePassageVerseStartMs(JOHN_3, 3), 22_040 - LEAD);
});

test('a passage from verse 1 starts at the top, keeping the spoken chapter heading', () => {
  assert.equal(resolvePassageVerseStartMs(JOHN_3, 1), 0);
});

test('without timings a passage starts at the top of the chapter', () => {
  assert.equal(resolvePassageVerseStartMs(null, 5), 0);
  assert.equal(resolvePassageVerseEndMs(null, 5), null);
});

test('a start verse missing from the timings starts at the timed verse before it', () => {
  const gappy: PassageVerseTimings = { 1: 4.92, 2: 10.04, 5: 37.64 };
  assert.equal(resolvePassageVerseStartMs(gappy, 4), 10_040 - LEAD);
});

test('a start verse past the chapter clamps to its last verse', () => {
  assert.equal(resolvePassageVerseStartMs(JOHN_3, 40), 46_420 - LEAD);
});

test('a start verse before every timed verse starts at the top', () => {
  assert.equal(resolvePassageVerseStartMs({ 4: 29.3, 5: 37.64 }, 2), 0);
});

test('a verse ends where the next verse starts', () => {
  assert.equal(resolvePassageVerseEndMs(JOHN_3, 3), 29_300 - LEAD);
});

test('the last verse, or one past it, runs to the end of the chapter', () => {
  assert.equal(resolvePassageVerseEndMs(JOHN_3, 6), null);
  assert.equal(resolvePassageVerseEndMs(JOHN_3, 99), null);
});

test('an end verse whose successor has no timing ends at the next timed verse', () => {
  assert.equal(resolvePassageVerseEndMs({ 1: 4.92, 2: 10.04, 5: 37.64 }, 2), 37_640 - LEAD);
});

test('unusable timing entries are ignored', () => {
  const noisy = { 1: 4.92, 2: Number.NaN, 3: -1, 4: 29.3 } as PassageVerseTimings;
  assert.equal(resolvePassageVerseEndMs(noisy, 1), 29_300 - LEAD);
  assert.equal(resolvePassageVerseStartMs(noisy, 3), 4_920 - LEAD);
});

test('a single-verse passage covers exactly that verse', () => {
  const single = passage('JHN', [3, 3], [3, 3]);
  assert.deepEqual(resolvePassageChapterBounds(single, 3, JOHN_3), {
    startMs: 22_040 - LEAD,
    endMs: 29_300 - LEAD,
  });
});

test('the chapters between the ends of a passage are whole', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.deepEqual(resolvePassageChapterBounds(across, 3, JOHN_3), {
    startMs: 22_040 - LEAD,
    endMs: null,
  });
  assert.deepEqual(resolvePassageChapterBounds(across, 4, JOHN_3), { startMs: 0, endMs: null });
  assert.deepEqual(resolvePassageChapterBounds(across, 5, JOHN_3), {
    startMs: 0,
    endMs: 22_040 - LEAD,
  });
});

test('timings that run backwards leave the passage running to the chapter end', () => {
  const backwards: PassageVerseTimings = { 1: 0, 2: 30, 3: 10 };
  assert.deepEqual(resolvePassageChapterBounds(passage('JHN', [3, 2], [3, 2]), 3, backwards), {
    startMs: 30_000 - LEAD,
    endMs: null,
  });
});

test('normalizeRepeatPassage keeps a passage that fits its book', () => {
  const fits = passage('JHN', [3, 16], [3, 21]);
  assert.deepEqual(normalizeRepeatPassage(fits, 21), fits);
});

test('normalizeRepeatPassage clamps chapters past the book, running the end to its chapter end', () => {
  assert.deepEqual(normalizeRepeatPassage(passage('JUD', [1, 3], [4, 2]), 1), {
    bookId: 'JUD',
    start: { chapter: 1, verse: 3 },
    end: { chapter: 1, verse: Number.MAX_SAFE_INTEGER },
  });
  assert.deepEqual(normalizeRepeatPassage(passage('JUD', [3, 5], [4, 2]), 1), {
    bookId: 'JUD',
    start: { chapter: 1, verse: 1 },
    end: { chapter: 1, verse: Number.MAX_SAFE_INTEGER },
  });
});

test('normalizeRepeatPassage puts a reversed passage in order and rejects a book without chapters', () => {
  assert.deepEqual(normalizeRepeatPassage(passage('JHN', [5, 2], [3, 3]), 21), {
    bookId: 'JHN',
    start: { chapter: 3, verse: 3 },
    end: { chapter: 5, verse: 2 },
  });
  assert.equal(normalizeRepeatPassage(passage('JHN', [1, 1], [1, 1]), 0), null);
});

test('a position is inside the passage only between the start and end verses', () => {
  const single = passage('JHN', [3, 3], [3, 3]);
  const at = (positionMs: number, chapter = 3, bookId = 'JHN') =>
    isPassagePosition(single, { bookId, chapter, positionMs }, JOHN_3);
  assert.equal(at(22_040 - LEAD), true);
  assert.equal(at(25_000), true);
  assert.equal(at(10_000), false, 'before the start verse');
  assert.equal(at(29_300 - LEAD), false, 'at the end of the end verse');
  assert.equal(at(25_000, 4), false, 'another chapter');
  assert.equal(at(25_000, 3, 'MRK'), false, 'another book');
});

test('without timings every position in a passage chapter is inside it', () => {
  const single = passage('JHN', [3, 3], [3, 3]);
  assert.equal(isPassagePosition(single, { bookId: 'JHN', chapter: 3, positionMs: 0 }, null), true);
  assert.equal(
    isPassagePosition(single, { bookId: 'JHN', chapter: 3, positionMs: 600_000 }, null),
    true
  );
});

test('a chapter-finish inside a passage goes on to its next chapter', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.deepEqual(resolvePassageChapterAdvance(across, { bookId: 'JHN', chapter: 3 }), {
    bookId: 'JHN',
    chapter: 4,
    loops: false,
  });
});

test('the end chapter finishing loops back to the start chapter', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.deepEqual(resolvePassageChapterAdvance(across, { bookId: 'JHN', chapter: 5 }), {
    bookId: 'JHN',
    chapter: 3,
    loops: true,
  });
});

test('a chapter outside the passage finishing returns to the passage start', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.deepEqual(resolvePassageChapterAdvance(across, { bookId: 'JHN', chapter: 9 }), {
    bookId: 'JHN',
    chapter: 3,
    loops: true,
  });
  assert.deepEqual(resolvePassageChapterAdvance(across, { bookId: 'GEN', chapter: 4 }), {
    bookId: 'JHN',
    chapter: 3,
    loops: true,
  });
});

test('a whole-book passage walks every chapter and loops from the last to the first', () => {
  const book = passage('JUD', [1, 1], [1, Number.MAX_SAFE_INTEGER]);
  assert.deepEqual(resolvePassageChapterAdvance(book, { bookId: 'JUD', chapter: 1 }), {
    bookId: 'JUD',
    chapter: 1,
    loops: true,
  });
  const ruth = passage('RUT', [1, 1], [4, 22]);
  assert.deepEqual(
    [1, 2, 3, 4].map((chapter) => resolvePassageChapterAdvance(ruth, { bookId: 'RUT', chapter })),
    [
      { bookId: 'RUT', chapter: 2, loops: false },
      { bookId: 'RUT', chapter: 3, loops: false },
      { bookId: 'RUT', chapter: 4, loops: false },
      { bookId: 'RUT', chapter: 1, loops: true },
    ]
  );
});

test('sparse coverage skips passage chapters without audio', () => {
  const psalms = passage('PSA', [116, 1], [118, 29]);
  assert.deepEqual(resolvePassageChapterAdvance(psalms, { bookId: 'PSA', chapter: 117 }, [117]), {
    bookId: 'PSA',
    chapter: 117,
    loops: true,
  });
  assert.deepEqual(resolvePassageLoopStart(psalms, [23, 117, 118]), {
    bookId: 'PSA',
    chapter: 117,
    loops: true,
  });
  assert.equal(resolvePassageChapterAdvance(psalms, { bookId: 'PSA', chapter: 117 }, [23]), null);
});

test('a loop starts at the start verse only when it begins in the start chapter', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.equal(resolvePassageLoopStartMs(across, 3, JOHN_3), 22_040 - LEAD);
  // The start chapter has no audio: the loop begins at the top of the next one.
  assert.equal(resolvePassageLoopStartMs(across, 4, JOHN_3), 0);
});

test('the end boundary loops when playback crosses it by playing', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 28_500,
      positionMs: 29_500,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'loop' }
  );
});

test('a start at or past the end boundary is left to play on', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: null,
      positionMs: 40_000,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'none' }
  );
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 31_000,
      positionMs: 32_000,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'none' }
  );
});

test('a seek across the end boundary is not a crossing', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 20_000,
      positionMs: 30_000,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'none' }
  );
});

test('faster playback allows proportionally bigger steps between reports', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 24_000,
      positionMs: 30_000,
      endMs: 29_150,
      playbackRate: 2,
    }),
    { kind: 'loop' }
  );
});

test('shortly before the end boundary a timer is asked for, scaled by speed', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 27_000,
      positionMs: 28_150,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'schedule', delayMs: 1000 }
  );
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 26_000,
      positionMs: 27_150,
      endMs: 29_150,
      playbackRate: 2,
    }),
    { kind: 'schedule', delayMs: 1000 }
  );
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 20_000,
      positionMs: 21_000,
      endMs: 29_150,
      playbackRate: 1,
    }),
    { kind: 'none' }
  );
});

test('no end boundary means nothing to watch', () => {
  assert.deepEqual(
    checkPassageEndBoundary({
      previousPositionMs: 1,
      positionMs: 2,
      endMs: null,
      playbackRate: 1,
    }),
    { kind: 'none' }
  );
});

// --- properties --------------------------------------------------------------

/** Increasing verse start times, as the generators write them, with random gaps. */
const timingsArb = fc
  .array(fc.tuple(fc.boolean(), fc.double({ min: 0.5, max: 30, noNaN: true })), {
    minLength: 1,
    maxLength: 60,
  })
  .map((slots) => {
    const timings: Record<number, number> = {};
    let seconds = 0;
    slots.forEach(([present, gap], index) => {
      seconds += gap;
      if (present || index === 0) timings[index + 1] = Number(seconds.toFixed(2));
    });
    return timings as PassageVerseTimings;
  });

const passageArb = fc
  .tuple(
    fc.integer({ min: 1, max: 60 }),
    fc.integer({ min: 1, max: 200 }),
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 1, max: 200 })
  )
  .map(([startChapter, startVerse, extraChapters, endVerse]) => {
    const endChapter = startChapter + extraChapters;
    return passage(
      'PSA',
      [startChapter, startVerse],
      [endChapter, endChapter === startChapter ? Math.max(startVerse, endVerse) : endVerse]
    );
  });

test('property: a passage chapter always covers a non-empty stretch that starts where it says', () => {
  fc.assert(
    fc.property(passageArb, timingsArb, (raw, timings) => {
      const fitted = normalizeRepeatPassage(raw, 150);
      assert.ok(fitted);
      for (let chapter = fitted.start.chapter; chapter <= fitted.end.chapter; chapter += 1) {
        const { startMs, endMs } = resolvePassageChapterBounds(fitted, chapter, timings);
        assert.ok(startMs >= 0);
        assert.ok(endMs === null || endMs > startMs);
        assert.equal(
          isPassagePosition(fitted, { bookId: 'PSA', chapter, positionMs: startMs }, timings),
          true
        );
        if (endMs !== null) {
          assert.equal(
            isPassagePosition(fitted, { bookId: 'PSA', chapter, positionMs: endMs }, timings),
            false
          );
        }
      }
    }),
    FC_PARAMS
  );
});

test('property: normalized passages lie inside the book, in order', () => {
  fc.assert(
    fc.property(passageArb, fc.integer({ min: 1, max: 150 }), (raw, totalChapters) => {
      const fitted = normalizeRepeatPassage(raw, totalChapters);
      assert.ok(fitted);
      assert.ok(fitted.start.chapter >= 1 && fitted.end.chapter <= totalChapters);
      assert.ok(fitted.start.verse >= 1 && fitted.end.verse >= 1);
      assert.ok(
        fitted.start.chapter < fitted.end.chapter ||
          (fitted.start.chapter === fitted.end.chapter && fitted.start.verse <= fitted.end.verse)
      );
    }),
    FC_PARAMS
  );
});

test('property: following chapter-finishes from the loop start visits each covered passage chapter once, then loops', () => {
  fc.assert(
    fc.property(
      passageArb,
      fc.uniqueArray(fc.integer({ min: 1, max: 150 }), { maxLength: 40 }),
      fc.boolean(),
      (raw, coverage, sparse) => {
        const fitted = normalizeRepeatPassage(raw, 150);
        assert.ok(fitted);
        const available = sparse ? coverage : undefined;
        const expected: number[] = [];
        for (let chapter = fitted.start.chapter; chapter <= fitted.end.chapter; chapter += 1) {
          if (!available || available.includes(chapter)) expected.push(chapter);
        }

        const first = resolvePassageLoopStart(fitted, available);
        if (expected.length === 0) {
          assert.equal(first, null);
          return;
        }
        assert.ok(first);
        const visited = [first.chapter];
        let target = resolvePassageChapterAdvance(fitted, first, available);
        while (target && !target.loops) {
          visited.push(target.chapter);
          target = resolvePassageChapterAdvance(fitted, target, available);
        }
        assert.deepEqual(visited, expected);
        assert.deepEqual(target, { bookId: 'PSA', chapter: expected[0], loops: true });
      }
    ),
    FC_PARAMS
  );
});

test('property: continuous playback toward the end boundary loops exactly once', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 600_000 }),
      fc.integer({ min: 1, max: 600_000 }),
      fc.constantFrom(0.75, 1, 1.5, 2, 2.5),
      (startMs, lengthMs, rate) => {
        const endMs = startMs + lengthMs;
        let previous: number | null = null;
        let loops = 0;
        let scheduled = false;
        // One report per second of wall clock, until well past the end.
        for (let position = startMs; position < endMs + 5_000 * rate; position += 1000 * rate) {
          const check = checkPassageEndBoundary({
            previousPositionMs: previous,
            positionMs: position,
            endMs,
            playbackRate: rate,
          });
          if (check.kind === 'loop') loops += 1;
          if (check.kind === 'schedule') {
            scheduled = true;
            assert.ok(check.delayMs <= PASSAGE_BOUNDARY_SCHEDULE_WINDOW_MS);
          }
          previous = position;
        }
        assert.equal(loops, 1);
        assert.equal(scheduled, true);
      }
    ),
    FC_PARAMS
  );
});

test('isPassageChapter reads the fitted chapter range', () => {
  const across = passage('JHN', [3, 3], [5, 2]);
  assert.deepEqual(
    [2, 3, 4, 5, 6].map((chapter) => isPassageChapter(across, { bookId: 'JHN', chapter })),
    [false, true, true, true, false]
  );
});
