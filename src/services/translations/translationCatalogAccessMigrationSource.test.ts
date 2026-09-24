/**
 * Replays the repo's migration history for `translation_catalog` access and checks the end state.
 *
 * The catalog holds unlaunched translations, gated pack URLs, and operator notes, so client
 * roles (anon, authenticated) must only ever see rows marked `is_available`. The admin app and
 * publishing scripts use the service role, which bypasses RLS.
 *
 * Shipped app builds query the table with `select('*')`, so a column-level SELECT revoke would
 * make PostgREST answer "permission denied" and empty the translation picker for every
 * installed version. The replay guards against that too.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');
const CLIENT_ROLES = ['anon', 'authenticated'] as const;
const TABLE = String.raw`(?:public\.)?"?translation_catalog"?`;

type Policy = { name: string; command: string; roles: string[]; using: string; file: string };

function normalize(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function statementsIn(file: string): string[] {
  return normalize(readFileSync(path.join(migrationsDir, file), 'utf8'))
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** Policies left on translation_catalog after every migration runs in filename order. */
function replayCatalogPolicies(): Map<string, Policy> {
  const policies = new Map<string, Policy>();
  const dropPattern = new RegExp(String.raw`^drop policy (?:if exists )?"?([\w-]+)"? on ${TABLE}$`);
  const createPattern = new RegExp(
    String.raw`^create policy "?([\w-]+)"? on ${TABLE} (?:as permissive )?for (\w+) to ([\w, ]+?) using \((.*)\)$`
  );

  for (const file of migrationFiles()) {
    for (const statement of statementsIn(file)) {
      const dropped = dropPattern.exec(statement);
      if (dropped) {
        policies.delete(dropped[1]);
        continue;
      }
      if (/^create policy .* on (?:public\.)?"?translation_catalog"? /.test(statement)) {
        const created = createPattern.exec(statement);
        assert.ok(created, `Unparsed translation_catalog policy in ${file}: ${statement}`);
        const [, name, command, roles, using] = created;
        policies.set(name, {
          name,
          command,
          roles: roles.split(',').map((role) => role.trim()),
          using: using.replace(/[()\s]/g, ''),
          file,
        });
      }
    }
  }

  return policies;
}

test('client roles can read only available translation_catalog rows after all migrations', () => {
  const clientPolicies = [...replayCatalogPolicies().values()].filter((policy) =>
    policy.roles.some(
      (role) => (CLIENT_ROLES as readonly string[]).includes(role) || role === 'public'
    )
  );

  for (const role of CLIENT_ROLES) {
    assert.ok(
      clientPolicies.some((policy) => policy.command === 'select' && policy.roles.includes(role)),
      `${role} must keep a SELECT policy so the app can list available translations`
    );
  }

  for (const policy of clientPolicies) {
    assert.equal(policy.command, 'select', `${policy.name} (${policy.file}) grants a client write`);
    assert.match(
      policy.using,
      /^is_available(?:istrue|=true)?$/,
      `${policy.name} (${policy.file}) exposes rows that are not is_available`
    );
  }
});

test('translation_catalog keeps table-level SELECT for client roles because shipped builds select *', () => {
  const selectRevoke = new RegExp(
    String.raw`^revoke (?:all(?: privileges)?|[\w, ()]*\bselect\b[\w, ()]*) on (?:table )?${TABLE} from `
  );

  for (const file of migrationFiles()) {
    for (const statement of statementsIn(file)) {
      if (!selectRevoke.test(statement)) {
        continue;
      }
      assert.ok(
        !CLIENT_ROLES.some((role) => new RegExp(String.raw`\b${role}\b`).test(statement)),
        `${file} revokes SELECT on translation_catalog from a client role: ${statement}`
      );
    }
  }
});

test('client roles hold no write privileges on translation_catalog', () => {
  const writeRevoke = new RegExp(
    String.raw`^revoke insert, update, delete, truncate, references, trigger on (?:table )?${TABLE} from anon, authenticated$`
  );

  assert.ok(
    migrationFiles().some((file) =>
      statementsIn(file).some((statement) => writeRevoke.test(statement))
    ),
    'Expected a migration that revokes catalog write privileges from anon and authenticated'
  );
});

// ---------------------------------------------------------------------------
// Admin-only columns (M3 follow-up)
//
// admin_notes, upstream_payload, upstream_external_id and sync_run_id are operator data. Because
// shipped builds select('*') and client SELECT cannot be revoked per column, the only way to hide
// them from anon/authenticated is to move them out of translation_catalog into a side table that
// client roles cannot read at all.
// ---------------------------------------------------------------------------

const ADMIN_ONLY_COLUMNS = [
  'admin_notes',
  'upstream_payload',
  'upstream_external_id',
  'sync_run_id',
] as const;
const SIDE_TABLE = String.raw`(?:public\.)?"?translation_catalog_admin"?`;

/** Columns of translation_catalog added or dropped by ALTER TABLE, replayed in filename order. */
function replayAdminOnlyCatalogColumns(): Set<string> {
  const present = new Set<string>();
  const alterPattern = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?${TABLE} (.*)$`);
  const columnChange = /\b(add|drop) column (?:if (?:not )?exists )?"?(\w+)"?/g;

  for (const file of migrationFiles()) {
    for (const statement of statementsIn(file)) {
      const altered = alterPattern.exec(statement);
      if (!altered) {
        continue;
      }
      for (const [, action, column] of altered[1].matchAll(columnChange)) {
        if (!(ADMIN_ONLY_COLUMNS as readonly string[]).includes(column)) {
          continue;
        }
        if (action === 'add') {
          present.add(column);
        } else {
          present.delete(column);
        }
      }
    }
  }

  return present;
}

test('admin-only columns no longer live on translation_catalog after all migrations', () => {
  assert.deepEqual([...replayAdminOnlyCatalogColumns()], []);
});

test('the admin-only side table exists with RLS on and no client access', () => {
  const statements = migrationFiles().flatMap((file) => statementsIn(file));

  assert.ok(
    statements.some((statement) =>
      new RegExp(String.raw`^create table (?:if not exists )?${SIDE_TABLE} \(`).test(statement)
    ),
    'Expected a migration that creates translation_catalog_admin'
  );
  for (const column of ADMIN_ONLY_COLUMNS) {
    assert.ok(
      statements.some(
        (statement) =>
          new RegExp(String.raw`^create table (?:if not exists )?${SIDE_TABLE} \(`).test(
            statement
          ) && new RegExp(String.raw`\b${column}\b`).test(statement)
      ),
      `translation_catalog_admin must carry ${column}`
    );
  }
  assert.ok(
    statements.some((statement) =>
      new RegExp(String.raw`^alter table ${SIDE_TABLE} enable row level security$`).test(statement)
    ),
    'translation_catalog_admin must have RLS enabled'
  );
  assert.ok(
    statements.some((statement) =>
      new RegExp(
        String.raw`^revoke all(?: privileges)? on (?:table )?${SIDE_TABLE} from (?=.*\banon\b)(?=.*\bauthenticated\b)`
      ).test(statement)
    ),
    'translation_catalog_admin must revoke the default client grants'
  );
  for (const statement of statements) {
    assert.doesNotMatch(
      statement,
      new RegExp(String.raw`^create policy .* on ${SIDE_TABLE} `),
      'translation_catalog_admin must have no RLS policies (service role only)'
    );
    if (new RegExp(String.raw`^grant .* on (?:table )?${SIDE_TABLE} to `).test(statement)) {
      assert.ok(
        !CLIENT_ROLES.some((role) => new RegExp(String.raw`\b${role}\b`).test(statement)),
        `translation_catalog_admin must not be granted to a client role: ${statement}`
      );
    }
  }
});

test('the column drop runs in a later migration than the side table, after the mirror trigger is removed', () => {
  const files = migrationFiles();
  const createFile = files.find((file) =>
    statementsIn(file).some((statement) =>
      new RegExp(String.raw`^create table (?:if not exists )?${SIDE_TABLE} \(`).test(statement)
    )
  );
  const dropFile = files.find((file) =>
    statementsIn(file).some((statement) =>
      new RegExp(String.raw`^alter table (?:if exists )?${TABLE} .*\bdrop column\b`).test(statement)
    )
  );
  assert.ok(createFile && dropFile, 'Expected both the side-table and the column-drop migrations');
  assert.ok(
    createFile < dropFile,
    'Columns must be dropped in a separate, later migration so the old admin build keeps working until the new one is deployed'
  );

  const dropStatements = statementsIn(dropFile);
  const dropTriggerIndex = dropStatements.findIndex((statement) =>
    new RegExp(String.raw`^drop trigger (?:if exists )?\w+ on ${TABLE}$`).test(statement)
  );
  const dropColumnIndex = dropStatements.findIndex((statement) =>
    /\bdrop column\b/.test(statement)
  );
  assert.ok(
    dropTriggerIndex >= 0 && dropTriggerIndex < dropColumnIndex,
    'The transition mirror trigger must be dropped before its columns'
  );
});
