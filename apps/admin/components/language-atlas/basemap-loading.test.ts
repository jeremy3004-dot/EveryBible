import assert from 'node:assert/strict';
import test from 'node:test';
import type { StyleSpecification } from 'maplibre-gl';
import { loadAtlasBasemap } from '../../lib/atlas-basemap';

const style: StyleSpecification = { version: 8, sources: {}, layers: [] };

test('a basemap response finishing after unmount never reaches a removed map', async (context) => {
  let finishJson!: (value: StyleSpecification) => void;
  const json = new Promise<StyleSpecification>((resolve) => {
    finishJson = resolve;
  });
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: () => json }));
  const applied: StyleSpecification[] = [];
  const controller = new AbortController();
  const loading = loadAtlasBasemap(
    { setStyle: (value) => applied.push(value) },
    'light',
    controller.signal
  );
  await Promise.resolve();
  controller.abort();
  finishJson(style);
  await loading;
  assert.equal(applied.length, 0);
});

test('active basemap loading passes a parsed style and owned abort signal', async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.match(url, /dark-matter-gl-style/);
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => style };
  });
  const applied: StyleSpecification[] = [];
  await loadAtlasBasemap({ setStyle: (value) => applied.push(value) }, 'dark', controller.signal);
  assert.deepEqual(applied, [style]);
});

test('already cancelled loading starts no style request', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected request');
  });
  const controller = new AbortController();
  controller.abort();
  await loadAtlasBasemap(
    {
      setStyle: () => {
        throw new Error('Removed map');
      },
    },
    'light',
    controller.signal
  );
  assert.equal(fetch.mock.callCount(), 0);
});
