import assert from 'node:assert/strict';
import test from 'node:test';

import { getSiteServerEnv } from './env';

const KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('getSiteServerEnv reads the Supabase url and service role key from process.env', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  assert.deepEqual(getSiteServerEnv(), {
    serviceRoleKey: 'service-role',
    supabaseUrl: 'https://project.supabase.test',
  });
});

test('getSiteServerEnv fails with the names of the missing server variables', () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ' ';

  assert.throws(() => getSiteServerEnv(), {
    message:
      'Site server env is missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
  });
});
