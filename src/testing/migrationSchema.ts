/**
 * Replays the repo's SQL migrations for one table to recover the columns and
 * `col IN (...)` CHECK constraints a database built from them would have.
 *
 * The Supabase fake accepts any payload, so a client write can drift away from
 * the real schema with every mock-backed test still green (that is how
 * `hide_play_button_from_reading_tab` and the EL palette ids reached production
 * unsynced). Tests use this to pin client payloads to the migrated schema.
 *
 * Deliberately small: it understands the DDL shapes this repo's migrations use
 * for plain tables (CREATE TABLE, ALTER TABLE ADD/DROP COLUMN, ADD/DROP
 * CONSTRAINT ... CHECK (col IN (...))), not general SQL.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations'
);

export interface InCheck {
  column: string;
  values: string[];
}

export interface MigratedTable {
  columns: Set<string>;
  /** Keyed by constraint name, as Postgres names inline checks: `<table>_<column>_check`. */
  checks: Map<string, InCheck>;
}

export interface MigrationSource {
  name: string;
  sql: string;
}

const CONSTRAINT_KEYWORDS = new Set([
  'constraint',
  'primary',
  'unique',
  'check',
  'foreign',
  'exclude',
]);

const stripComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

// Function bodies contain `;` and unrelated DDL-looking text; table DDL never
// lives inside them in this repo, so drop them before splitting statements.
const stripDollarQuoted = (sql: string): string =>
  sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''");

const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (const char of text) {
    if (char === "'") inString = !inString;
    if (!inString) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === separator && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const unquoteIdentifier = (identifier: string): string => identifier.replace(/^"|"$/g, '');

const parseInCheck = (text: string): InCheck | null => {
  const match = /check\s*\(\s*\(?\s*"?([a-z_][a-z0-9_]*)"?\s+in\s*\(([^)]*)\)/i.exec(text);
  if (!match) return null;
  const values = [...match[2].matchAll(/'((?:[^']|'')*)'/g)].map((value) =>
    value[1].replace(/''/g, "'")
  );
  return { column: match[1].toLowerCase(), values };
};

const tablePattern = (table: string): string => `(?:public\\.)?"?${table}"?`;

const applyColumnDefinition = (table: string, state: MigratedTable, definition: string): void => {
  const [rawName] = definition.split(/\s+/);
  const column = unquoteIdentifier(rawName).toLowerCase();
  state.columns.add(column);
  const check = parseInCheck(definition);
  if (check && check.column === column) state.checks.set(`${table}_${column}_check`, check);
};

const applyStatement = (table: string, state: MigratedTable, statement: string): void => {
  const create = new RegExp(
    `^create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tablePattern(table)}\\s*\\(`,
    'i'
  ).exec(statement);
  if (create) {
    const body = statement.slice(create[0].length, statement.lastIndexOf(')'));
    for (const entry of splitTopLevel(body, ',')) {
      const keyword = entry.split(/\s+/)[0].toLowerCase();
      if (!CONSTRAINT_KEYWORDS.has(keyword)) applyColumnDefinition(table, state, entry);
    }
    return;
  }

  const alter = new RegExp(
    `^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${tablePattern(table)}\\s+`,
    'i'
  ).exec(statement);
  if (!alter) return;

  for (const action of splitTopLevel(statement.slice(alter[0].length), ',')) {
    let match = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(action);
    if (match) {
      applyColumnDefinition(table, state, match[1]);
      continue;
    }
    match = /^drop\s+column\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/i.exec(action);
    if (match) {
      const column = match[1].toLowerCase();
      state.columns.delete(column);
      for (const [name, check] of state.checks) {
        if (check.column === column) state.checks.delete(name);
      }
      continue;
    }
    match = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/i.exec(action);
    if (match) {
      state.checks.delete(match[1].toLowerCase());
      continue;
    }
    match = /^add\s+constraint\s+"?([a-z0-9_]+)"?\s+([\s\S]+)$/i.exec(action);
    if (match) {
      const check = parseInCheck(match[2]);
      if (check) state.checks.set(match[1].toLowerCase(), check);
    }
  }
};

export const replayTableMigrations = (
  table: string,
  migrations: readonly MigrationSource[]
): MigratedTable => {
  const state: MigratedTable = { columns: new Set(), checks: new Map() };
  const ordered = [...migrations].sort((left, right) => left.name.localeCompare(right.name));
  for (const migration of ordered) {
    const sql = stripDollarQuoted(stripComments(migration.sql));
    for (const statement of splitTopLevel(sql, ';')) {
      applyStatement(table, state, statement.replace(/\s+/g, ' ').trim());
    }
  }
  return state;
};

export const readRepoMigrations = (): MigrationSource[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8') }));

/** True when `value` satisfies every IN-list CHECK on `column` in the migrated table. */
export const checkAdmits = (table: MigratedTable, column: string, value: unknown): boolean =>
  [...table.checks.values()]
    .filter((check) => check.column === column)
    .every((check) => typeof value === 'string' && check.values.includes(value));
