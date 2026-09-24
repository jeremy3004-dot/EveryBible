import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertVerifiedCatalogRows } from './open-bible-audio-r2-pilot';

// The real catalog step of the Open Bible R2 pilot, with the R2 check and the Supabase
// upsert replaced by recorders.
type Row = Parameters<typeof upsertVerifiedCatalogRows>[0][number]['catalogRow'];
const summary = (id: string) => ({ id, catalogRow: { translation_id: id } as unknown as Row });

test('each catalog row is written only after its published assets are verified', async () => {
  const steps: string[] = [];

  await upsertVerifiedCatalogRows([summary('a'), summary('b')], {
    verify: async (item) => {
      steps.push(`verify ${item.id}`);
    },
    upsert: async (row) => {
      steps.push(`upsert ${(row as { translation_id: string }).translation_id}`);
    },
  });

  assert.deepEqual(steps, ['verify a', 'upsert a', 'verify b', 'upsert b']);
});

test('a translation whose assets are missing is never advertised, nor are later ones', async () => {
  const upserted: string[] = [];

  await assert.rejects(
    upsertVerifiedCatalogRows([summary('a'), summary('b'), summary('c')], {
      verify: async (item) => {
        if (item.id === 'b') throw new Error('Expected published R2 object missing: b/JHN/1.mp3');
      },
      upsert: async (row) => {
        upserted.push((row as { translation_id: string }).translation_id);
      },
    }),
    /Expected published R2 object missing/
  );
  assert.deepEqual(upserted, ['a']);
});
