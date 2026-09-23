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
