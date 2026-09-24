import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';
import type { LessonSection } from '../../types/course';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

async function renderSection(section: LessonSection, onScripturePress?: (ref: string) => void) {
  const { LessonSectionRenderer } = await import('./LessonSectionRenderer');
  return harness.render(
    <LessonSectionRenderer section={section} onScripturePress={onScripturePress} />
  );
}

test('discussion, practice and prayer sections are labelled by kind above their text', async () => {
  for (const [type, labelKey] of [
    ['discussion', 'harvest.discussionLabel'],
    ['activity', 'harvest.practiceActivity'],
    ['prayer', 'harvest.prayerLabel'],
  ] as const) {
    const view = await renderSection({ type, content: `A ${type} prompt` });

    assert.ok(view.getByText(t(labelKey)), `${type} is labelled`);
    assert.ok(view.getByText(`A ${type} prompt`));
  }
});

test('a bullets section shows its title and every item', async () => {
  const view = await renderSection({
    type: 'bullets',
    content: 'Remember',
    items: ['Pray first', 'Share the story'],
  });

  assert.ok(view.getByText('Remember'));
  assert.ok(view.getByText('Pray first'));
  assert.ok(view.getByText('Share the story'));
});

test('a bullets section without a title shows only its items', async () => {
  const view = await renderSection({ type: 'bullets', content: '', items: ['Only item'] });

  assert.deepEqual(
    view.queryAllByType('Text').map((node) => node.props.children),
    ['Only item']
  );
});

test('a scripture with a reference opens it in context when the screen supports that', async () => {
  const opened: string[] = [];
  const view = await renderSection(
    { type: 'scripture', content: 'In the beginning...', reference: 'Genesis 1:1' },
    (reference) => opened.push(reference)
  );

  const card = view.getByRole('button');
  assert.equal(card.props.accessibilityHint, t('harvest.readInContext'));
  assert.ok(view.getByText(t('harvest.readInContext')));
  await view.press(card);
  assert.deepEqual(opened, ['Genesis 1:1']);
});

test('a scripture is plain text when there is no reference or nowhere to open it', async () => {
  const opened: string[] = [];
  const unreferenced = await renderSection(
    { type: 'scripture', content: 'A quoted verse' },
    (reference) => opened.push(reference)
  );
  assert.equal(unreferenced.queryByRole('button'), null);
  await unreferenced.press(unreferenced.getByText('A quoted verse'));

  const noHandler = await renderSection({
    type: 'scripture',
    content: 'In the beginning...',
    reference: 'Genesis 1:1',
  });
  assert.ok(noHandler.getByText('Genesis 1:1'));
  assert.equal(noHandler.queryByRole('button'), null);
  assert.equal(noHandler.queryByText(t('harvest.readInContext')), null);
  assert.deepEqual(opened, []);
});

test('text, and any section kind the app does not know, render as plain paragraphs', async () => {
  const text = await renderSection({ type: 'text', content: 'Plain paragraph' });
  assert.ok(text.getByText('Plain paragraph'));

  const unknown = await renderSection({
    type: 'video' as LessonSection['type'],
    content: 'From a newer course file',
  });
  assert.ok(unknown.getByText('From a newer course file'));
});
