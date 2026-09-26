// Isolated in-memory Postgres verification; never connects to Supabase.
// Install @electric-sql/pglite in a temporary folder, then run:
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-profile-policies-sql.mjs
//
// Replays only the four canonical migrations listed below, not the full schema.
// The minimal Auth, Storage, and translation-catalog substrate satisfies that
// slice's dependencies. Local role/grant probes do not prove live permissions.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const MIGRATIONS = [
  '20240101000000_initial_schema.sql',
  '20260401130000_create_web_admin_platform.sql',
  '20260905015543_protect_profile_admin_role.sql',
  '20260923233721_protect_profile_email.sql',
];
const db = new PGlite();

try {
  // Minimal test substrate, not replacements for production migrations.
  // Default table grants must precede replay so hardening can revoke them.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb default '{}'
    );
    create table public.translation_catalog (id text primary key);
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (bucket_id text);
    alter table storage.objects enable row level security;
    grant usage on schema auth, public, storage to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public, storage
      to anon, authenticated, service_role;
    alter default privileges in schema public, storage
      grant select, insert, update, delete on tables to anon, authenticated, service_role;
  `);
  for (const name of MIGRATIONS) {
    await db.exec(
      await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
    );
  }
  for (const name of ['profile_admin_role.sql', 'profile_email_integrity.sql']) {
    // Execute the committed regression SQL unchanged, including its rollback.
    await db.exec(await fs.readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS: unchanged supabase/tests/${name}`);
  }

  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'a@example.invalid', '{"display_name":"Account A"}'),
            ($2, 'b@example.invalid', '{"display_name":"Account B"}')`,
    [A, B]
  );

  const as = (uid, sql, params = []) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
      return tx.query(sql, params);
    });
  const blocked = async (request) => {
    const affected = await request.then(
      (result) => result.affectedRows,
      (error) => {
        assert.match(String(error), /row-level security|permission denied/);
        return 0;
      }
    );
    assert.equal(affected, 0);
  };
  const tables = [
    { name: 'profiles', owner: 'id', field: 'display_name', value: 'Owner updated' },
    { name: 'user_progress', owner: 'user_id', field: 'current_book', value: 'MAT' },
    { name: 'user_preferences', owner: 'user_id', field: 'language', value: 'ne' },
  ];
  for (const { name, owner, field, value } of tables) {
    const otherBefore = (await db.query(`select * from ${name} where ${owner} = $1`, [B])).rows;
    for (const uid of [A, B]) {
      const visible = await as(uid, `select ${owner} from ${name}`);
      assert.deepEqual(visible.rows, [{ [owner]: uid }], `${name}: only own row visible`);
    }
    assert.deepEqual((await as(null, `select * from ${name}`)).rows, []);
    assert.equal(
      (await as(A, `update ${name} set ${field} = $1 where ${owner} = $2`, [value, A]))
        .affectedRows,
      1,
      `${name}: owner update succeeds`
    );
    assert.equal(
      (await as(A, `select ${field} from ${name} where ${owner} = $1`, [A])).rows[0][field],
      value
    );
    await blocked(as(A, `update ${name} set ${field} = $1 where ${owner} = $2`, [value, B]));
    await blocked(as(null, `update ${name} set ${field} = $1`, [value]));
    await assert.rejects(
      as(A, `update ${name} set ${owner} = $1 where ${owner} = $2`, [B, A]),
      /row-level security/,
      `${name}: UPDATE WITH CHECK prevents reassignment`
    );
    for (const uid of [A, null]) {
      await assert.rejects(
        as(uid, `insert into ${name} (${owner}, ${field}) values ($1, $2)`, [B, value]),
        /row-level security|permission denied/,
        `${name}: other-account and anonymous inserts denied`
      );
    }
    assert.deepEqual(
      (await db.query(`select * from ${name} where ${owner} = $1`, [B])).rows,
      otherBefore,
      `${name}: other account remains unchanged`
    );
    console.log(
      `PASS: ${name} owner/other/anon reads and updates; ownership and foreign inserts denied`
    );
  }

  // Signup already inserts each row. Remove A's rows as the fixture owner to
  // exercise fresh owner INSERTs; deleting the profile cascades its dependents.
  await db.query('delete from profiles where id = $1', [A]);
  for (const { name, owner, field, value } of tables) {
    const inserted = await as(
      A,
      `insert into ${name} (${owner}, ${field}) values ($1, $2) returning ${owner}, ${field}`,
      [A, value]
    );
    assert.deepEqual(inserted.rows, [{ [owner]: A, [field]: value }]);
    assert.equal((await as(B, `select * from ${name} where ${owner} = $1`, [A])).rows.length, 0);
    console.log(`PASS: ${name} owner INSERT succeeds and remains private`);
  }
} finally {
  await db.close();
}
