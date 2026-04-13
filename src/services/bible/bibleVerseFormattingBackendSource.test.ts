import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRepoFile = (relativePath: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

const FORMAT_MIGRATION =
  'supabase/migrations/20260412113000_add_formatting_to_bible_verses.sql';

test('bible_verses formatting rollout adds a dedicated Supabase migration', () => {
  const migrationPath = path.join(REPO_ROOT, FORMAT_MIGRATION);

  assert.equal(
    existsSync(migrationPath),
    true,
    `Expected a dedicated migration at ${FORMAT_MIGRATION}`
  );

  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /ALTER TABLE IF EXISTS public\.bible_verses\s+ADD COLUMN IF NOT EXISTS formatting JSONB;/,
    'Expected the rollout migration to add a nullable JSONB formatting column to public.bible_verses'
  );
  assert.match(
    migration,
    /COMMENT ON COLUMN public\.bible_verses\.formatting IS/,
    'Expected the rollout migration to document the formatting column purpose'
  );
});

test('remote text-pack pipeline preserves verse formatting payloads from Supabase', () => {
  const supabaseTypes = readRepoFile('src/services/supabase/types.ts');
  const exportScript = readRepoFile('scripts/export_translation_text_packs.py');
  const cloudBootstrap = readRepoFile('src/services/bible/cloudTranslationService.ts');

  assert.match(
    supabaseTypes,
    /formatting\?: unknown \| null;/,
    'Expected Supabase bible verse rows to expose the optional formatting payload'
  );
  assert.match(
    exportScript,
    /["']select["']:\s*["']\*["']/,
    'Expected text-pack export to fetch the full bible_verses row, including formatting'
  );
  assert.match(
    exportScript,
    /formatting TEXT/,
    'Expected exported SQLite text packs to include a formatting column'
  );
  assert.match(
    exportScript,
    /json\.dumps\(row\["formatting"\]/,
    'Expected exported text packs to serialize formatting payloads from Supabase rows'
  );
  assert.match(
    cloudBootstrap,
    /serializeVerseFormatting\(row\.formatting\)/,
    'Expected downloaded translations to write Supabase formatting payloads into the local SQLite cache'
  );
});
