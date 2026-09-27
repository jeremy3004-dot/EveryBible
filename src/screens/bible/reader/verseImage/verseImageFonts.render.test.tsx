import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockPackage } from '../../../../testing/mockModules';
import { installRenderHarness } from '../../../../testing/render';

const harness = installRenderHarness(mock);

const loads: string[][] = [];
let outcome: 'resolve' | 'reject' = 'resolve';
mockPackage(mock, 'expo-font', {
  loadAsync: (sources: Record<string, unknown>) => {
    loads.push(Object.keys(sources).sort());
    return outcome === 'resolve' ? Promise.resolve() : Promise.reject(new Error('no font'));
  },
});

afterEach(() => {
  loads.length = 0;
  outcome = 'resolve';
});

async function renderProbe(active: boolean) {
  const { useVerseImageFonts } = await import('./verseImageFonts');
  const { Text } = harness.rn;
  function Probe({ open }: { open: boolean }) {
    return <Text>{useVerseImageFonts(open) ? 'ready' : 'waiting'}</Text>;
  }
  const view = await harness.render(<Probe open={active} />);
  return { view, rerender: (open: boolean) => view.rerender(<Probe open={open} />) };
}

test('nothing loads until the picture editor opens', async () => {
  const { view } = await renderProbe(false);
  await view.flush();

  assert.deepEqual(loads, []);
  assert.ok(view.getByText('waiting'));
});

test('opening the editor loads the six extra faces once, then reports them ready', async () => {
  const { view, rerender } = await renderProbe(true);
  await view.flush();

  assert.deepEqual(loads, [
    [
      'AlfaSlabOne_400Regular',
      'Anton_400Regular',
      'Caveat_600SemiBold',
      'DancingScript_600SemiBold',
      'PlayfairDisplay_600SemiBold_Italic',
      'SpecialElite_400Regular',
    ],
  ]);
  assert.ok(view.getByText('ready'));

  await rerender(false);
  await rerender(true);
  await view.flush();
  assert.equal(loads.length, 1, 'not loaded again');
});

test('a face that fails to load leaves the editor usable on the platform font', async () => {
  outcome = 'reject';
  const { view } = await renderProbe(true);
  await view.flush();

  assert.ok(view.getByText('ready'));
});
