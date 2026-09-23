import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAdmits, replayTableMigrations } from './migrationSchema';

const MIGRATIONS = [
  {
    name: '002_alter.sql',
    sql: `
      -- a comment mentioning ALTER TABLE public.prefs ADD COLUMN ghost TEXT;
      ALTER TABLE public.prefs
        ADD COLUMN IF NOT EXISTS palette TEXT NOT NULL DEFAULT 'a',
        ADD COLUMN IF NOT EXISTS legacy TEXT;
      ALTER TABLE public.prefs DROP CONSTRAINT IF EXISTS prefs_palette_check;
      ALTER TABLE public.prefs ADD CONSTRAINT prefs_palette_check
        CHECK (palette IN ('a', 'b'));
      CREATE OR REPLACE FUNCTION f() RETURNS void AS $$
      BEGIN
        ALTER TABLE public.prefs ADD COLUMN in_function TEXT;
      END;
      $$ LANGUAGE plpgsql;
      ALTER TABLE public.other ADD COLUMN unrelated TEXT;
    `,
  },
  {
    name: '001_create.sql',
    sql: `
      CREATE TABLE IF NOT EXISTS public.prefs (
        id UUID PRIMARY KEY,
        theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
        UNIQUE (id)
      );
    `,
  },
  {
    name: '003_widen.sql',
    sql: `
      ALTER TABLE prefs DROP CONSTRAINT IF EXISTS prefs_palette_check;
      ALTER TABLE prefs ADD CONSTRAINT prefs_palette_check CHECK (palette IN ('a', 'b', 'c'));
      ALTER TABLE prefs DROP COLUMN IF EXISTS legacy;
    `,
  },
];

test('replaying migrations in filename order yields the final columns', () => {
  const table = replayTableMigrations('prefs', MIGRATIONS);

  assert.deepEqual([...table.columns].sort(), ['id', 'palette', 'theme']);
});

test('inline and named IN checks reflect the latest constraint definition', () => {
  const table = replayTableMigrations('prefs', MIGRATIONS);

  assert.deepEqual(Object.fromEntries(table.checks), {
    prefs_theme_check: { column: 'theme', values: ['dark', 'light'] },
    prefs_palette_check: { column: 'palette', values: ['a', 'b', 'c'] },
  });
  assert.equal(checkAdmits(table, 'palette', 'c'), true);
  assert.equal(checkAdmits(table, 'theme', 'sepia'), false);
  assert.equal(checkAdmits(table, 'id', 'anything'), true);
});
