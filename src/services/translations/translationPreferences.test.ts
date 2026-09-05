import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

function loadPreferences(readResult: {
  data: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}) {
  const writes: Record<string, unknown>[] = [];
  const exported: Record<string, unknown> = {};
  const compiled = ts.transpileModule(
    readFileSync(new URL('./translationService.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (name: string) => {
      if (name === './translationCatalogModel') return {};
      assert.equal(name, '../supabase');
      return {
        isSupabaseConfigured: () => true,
        getCurrentUserId: async () => 'fixture-user',
        supabase: {
          from: (table: string) => {
            assert.equal(table, 'user_translation_preferences');
            return {
              select: () => ({ eq: () => ({ single: async () => readResult }) }),
              upsert: async (payload: Record<string, unknown>) => {
                writes.push(payload);
                return { error: null };
              },
            };
          },
        },
      };
    },
  });
  return {
    writes,
    set: exported.setUserTranslationPreferences as typeof import('./translationService').setUserTranslationPreferences,
  };
}

test('a failed preference read cannot reset the saved secondary and audio translations', async () => {
  const service = loadPreferences({
    data: null,
    error: { code: '503', message: 'Network unavailable' },
  });
  const result = await service.set({ primary: 'asv' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Network unavailable');
  assert.equal(service.writes.length, 0);
});

test('a missing preference row still allows creating the first selection', async () => {
  const service = loadPreferences({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
  assert.equal((await service.set({ primary: 'asv' })).success, true);
  assert.equal(service.writes.length, 1);
  assert.equal(service.writes[0].primary_translation, 'asv');
  assert.equal(service.writes[0].user_id, 'fixture-user');
});

test('preference changes preserve omitted fields and honor explicit null', async () => {
  const service = loadPreferences({
    data: { primary_translation: 'bsb', secondary_translation: 'asv', audio_translation: 'web' },
    error: null,
  });
  assert.equal((await service.set({ primary: 'ylt', secondary: null })).success, true);
  assert.equal(service.writes[0].primary_translation, 'ylt');
  assert.equal(service.writes[0].secondary_translation, null);
  assert.equal(service.writes[0].audio_translation, 'web');
});
