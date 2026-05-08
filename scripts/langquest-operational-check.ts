import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  detail?: string;
  name: string;
  status: CheckStatus;
}

const envFiles = ['.env', 'apps/admin/.env.local', 'apps/site/.env.production.local'];

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    const value = rawValue
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n$/g, '')
      .trim();

    if (!value) continue;

    process.env[key] = value;
  }
}

for (const envFile of envFiles) {
  loadEnvFile(resolve(process.cwd(), envFile));
}

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? null;
}

function envCheck(name: string, keys: string[], optional = false): CheckResult {
  const missing = keys.filter((key) => !has(key));
  if (!missing.length) {
    return { name, status: 'pass' };
  }

  return {
    detail: `missing ${missing.join(', ')}`,
    name,
    status: optional ? 'warn' : 'fail',
  };
}

function everyBibleSupabaseEnvCheck(): CheckResult {
  const missing = ['SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !has(key));
  if (!supabaseUrl()) {
    missing.unshift('NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  }

  if (!missing.length) {
    return { name: 'EveryBible Supabase service env', status: 'pass' };
  }

  return {
    detail: `missing ${missing.join(', ')}`,
    name: 'EveryBible Supabase service env',
    status: 'fail',
  };
}

async function checkSupabaseTable(
  label: string,
  table: string,
  select = 'id'
): Promise<CheckResult> {
  const url = supabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      detail: 'missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY',
      name: label,
      status: 'fail',
    };
  }

  const response = await fetch(`${url}/rest/v1/${table}?select=${select}&limit=1`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (response.ok || response.status === 406) {
    return { name: label, status: 'pass' };
  }

  const body = await response.text();
  return {
    detail: `status ${response.status}: ${body.slice(0, 160).replace(/\s+/g, ' ')}`,
    name: label,
    status: 'fail',
  };
}

async function checkR2(): Promise<CheckResult> {
  const required = ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const missing = required.filter((key) => !has(key));
  if (missing.length) {
    return {
      detail: `missing ${missing.join(', ')}`,
      name: 'Cloudflare R2 bucket access',
      status: 'fail',
    };
  }

  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    endpoint: process.env.R2_ENDPOINT!,
    forcePathStyle: true,
    region: 'auto',
  });

  await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET!,
      MaxKeys: 1,
      Prefix: 'langquest/',
    })
  );

  return { name: 'Cloudflare R2 bucket access', status: 'pass' };
}

function print(result: CheckResult) {
  const marker = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${marker} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`);
}

async function main() {
  const results: CheckResult[] = [
    everyBibleSupabaseEnvCheck(),
    envCheck('Trigger.dev deploy and enqueue env', [
      'TRIGGER_ACCESS_TOKEN',
      'TRIGGER_SECRET_KEY',
      'TRIGGER_PROJECT_REF',
    ]),
    envCheck('LangQuest source env', [
      'LANGQUEST_SUPABASE_URL',
      'LANGQUEST_SUPABASE_SERVICE_ROLE_KEY',
      'LANGQUEST_STORAGE_BUCKET',
      'LANGQUEST_ALLOWED_PROJECT_IDS',
    ]),
  ];

  results.push(await checkSupabaseTable('workflow_runs live table', 'workflow_runs'));
  results.push(
    await checkSupabaseTable(
      'langquest_translation_candidates live table',
      'langquest_translation_candidates'
    )
  );
  results.push(
    await checkSupabaseTable(
      'langquest_selected_translations live table',
      'langquest_selected_translations'
    )
  );
  results.push(
    await checkSupabaseTable(
      'langquest_chapter_artifacts live table',
      'langquest_chapter_artifacts'
    )
  );

  try {
    results.push(await checkR2());
  } catch (error) {
    results.push({
      detail: error instanceof Error ? error.message : String(error),
      name: 'Cloudflare R2 bucket access',
      status: 'fail',
    });
  }

  for (const result of results) {
    print(result);
  }

  if (results.some((result) => result.status === 'fail')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
