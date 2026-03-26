import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs(): {
  translationId: string;
  catalogJson: string | null;
  catalogFile: string | null;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let translationId = '';
  let catalogJson: string | null = null;
  let catalogFile: string | null = null;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--translation' && args[index + 1]) {
      translationId = args[index + 1]!.trim();
      index += 1;
      continue;
    }

    if (arg === '--catalog-json' && args[index + 1]) {
      catalogJson = args[index + 1]!;
      index += 1;
      continue;
    }

    if (arg === '--catalog-file' && args[index + 1]) {
      catalogFile = args[index + 1]!;
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  if (!translationId) {
    throw new Error('Missing required --translation <id> argument.');
  }

  if (!catalogJson && !catalogFile) {
    throw new Error('Provide --catalog-json <json> or --catalog-file <path>.');
  }

  if (catalogJson && catalogFile) {
    throw new Error('Use either --catalog-json or --catalog-file, not both.');
  }

  return {
    translationId: translationId.toUpperCase(),
    catalogJson,
    catalogFile,
    dryRun,
  };
}

function loadCatalogJson(catalogJson: string | null, catalogFile: string | null): unknown {
  if (!catalogJson && !catalogFile) {
    throw new Error('No catalog payload provided.');
  }

  const raw = catalogJson ?? readFileSync(resolve(catalogFile ?? ''), 'utf8');
  return JSON.parse(raw);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const { translationId, catalogJson, catalogFile, dryRun } = parseArgs();
  const catalog = loadCatalogJson(catalogJson, catalogFile);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          translationId,
          catalog,
        },
        null,
        2
      )
    );
    return;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('translation_catalog')
    .update({
      catalog,
      has_audio: Boolean((catalog as { audio?: unknown }).audio),
      has_text: Boolean((catalog as { text?: unknown }).text),
      is_available: true,
    })
    .eq('translation_id', translationId)
    .select('translation_id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update translation_catalog for ${translationId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      `translation_catalog row not found for ${translationId}. Import or seed the translation before attaching catalog metadata.`
    );
  }

  console.log(`Updated translation catalog metadata for ${translationId}.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
