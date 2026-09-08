import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';

const reader = readFileSync(new URL('./BibleReaderScreen.tsx', import.meta.url), 'utf8');

for (const direction of ['Next', 'Previous']) {
  for (const status of ['paused', 'playing']) {
    test(`${direction} listen arrow with another chapter displayed preserves ${status} playback`, async () => {
      const source = reader.match(
        new RegExp(
          `const handle${direction}ListenChapter = (async \\(\\) => \\{[\\s\\S]*?\\n  \\});`
        )
      )?.[1];
      assert.ok(source);
      const played: unknown[] = [];
      const navigated: unknown[] = [];
      const target = { bookId: 'JHN', chapter: direction === 'Next' ? 5 : 3 };
      const handler = runInNewContext(`(${source})`, {
        isCurrentAudioChapter: false,
        nextNavigationTarget: target,
        previousNavigationTarget: target,
        useAudioStore: { getState: () => ({ status }) },
        playChapter: async (...args: unknown[]) => played.push(args),
        syncReaderReference: (...args: unknown[]) => navigated.push(args),
      }) as () => Promise<void>;
      await handler();
      assert.equal(played.length, status === 'paused' ? 0 : 1);
      assert.deepEqual(navigated, [['JHN', target.chapter]]);
    });
  }
}
