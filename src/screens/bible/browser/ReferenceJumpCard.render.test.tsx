import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../../testing/render';
import { mockModule, sourcePath } from '../../../testing/mockModules';

const harness = installRenderHarness(mock);

const chapterReads: string[] = [];
let chapterVerses: Array<{ verse: number; text: string }> = [];
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: async (translationId: string, bookId: string, chapter: number) => {
    chapterReads.push(`${translationId} ${bookId} ${chapter}`);
    return chapterVerses;
  },
});

const john316 = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };

test('a verse reference shows the verse text from the current translation', async () => {
  const { ReferenceJumpCard } = await import('./ReferenceJumpCard');
  chapterVerses = [
    { verse: 15, text: 'that everyone who believes may have eternal life in Him.' },
    { verse: 16, text: 'For God so loved the world that He gave His one and only Son.' },
  ];
  const view = await harness.render(
    <ReferenceJumpCard target={john316} translationId="bsb" onPress={() => {}} />
  );
  await view.flush();

  assert.ok(view.getByText('For God so loved the world that He gave His one and only Son.'));
  assert.equal(view.queryByText('Chapter 3 • Verse 16'), null);
  assert.ok(view.getByText('John 3:16'));
  assert.deepEqual(chapterReads, ['bsb JHN 3']);
});

test('the chapter and verse label stays when the translation has no text for the verse', async () => {
  const { ReferenceJumpCard } = await import('./ReferenceJumpCard');
  chapterVerses = [];
  const view = await harness.render(
    <ReferenceJumpCard target={john316} translationId="bsb" onPress={() => {}} />
  );
  await view.flush();

  assert.ok(view.getByText('Chapter 3 • Verse 16'));
});

test('a whole-chapter reference keeps its label and reads nothing', async () => {
  const { ReferenceJumpCard } = await import('./ReferenceJumpCard');
  chapterReads.length = 0;
  const view = await harness.render(
    <ReferenceJumpCard
      target={{ bookId: 'JHN', chapter: 3, label: 'John 3' }}
      translationId="bsb"
      onPress={() => {}}
    />
  );
  await view.flush();

  assert.ok(view.getByText('Chapter 3'));
  assert.deepEqual(chapterReads, []);
});
