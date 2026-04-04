import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { generateR2TextPackManifest } from './generate-r2-text-pack-manifest';

type Mapping = {
  kind: 'dir' | 'file';
  source: string;
  destination: string;
};

type ParsedArgs = {
  dryRun: boolean;
  repoRoot: string;
};

type GeneratedCatalogRecord = {
  catalogFile: string;
  outputFile: string;
  translationId: string;
};

function parseArgs(): ParsedArgs {
  return {
    dryRun: process.argv.includes('--dry-run'),
    repoRoot: path.resolve(path.dirname(process.argv[1] ?? '.'), '..'),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listOpenBibleImportDirs(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
}

async function buildMappings(repoRoot: string): Promise<Mapping[]> {
  const mappings: Mapping[] = [];
  const bundledDbPath = path.join(repoRoot, 'assets', 'databases', 'bible-bsb-v2.db');

  if (await pathExists(bundledDbPath)) {
    mappings.push({
      kind: 'file',
      source: bundledDbPath,
      destination: 'text/bsb/bible-bsb-v2.db',
    });
  }

  for (const translationId of ['BSB', 'WEB']) {
    const timingDir = path.join(repoRoot, 'assets', 'timestamps', translationId);

    if (await pathExists(timingDir)) {
      mappings.push({
        kind: 'dir',
        source: timingDir,
        destination: `timing/${translationId.toLowerCase()}`,
      });
    }
  }

  const importDirs = await listOpenBibleImportDirs(path.join(repoRoot, 'tmp', 'open-bible-import'));

  for (const importDir of importDirs) {
    const translationId = path.basename(importDir).toLowerCase();
    const audioDir = path.join(importDir, 'audio');
    const timingDir = path.join(importDir, 'timing');

    if (await pathExists(audioDir)) {
      mappings.push({
        kind: 'dir',
        source: audioDir,
        destination: `audio/${translationId}`,
      });
    }

    if (await pathExists(timingDir)) {
      mappings.push({
        kind: 'dir',
        source: timingDir,
        destination: `timing/${translationId}`,
      });
    }
  }

  const textPackDir = path.join(repoRoot, 'tmp', 'r2-text-packs', 'text');

  if (await pathExists(textPackDir)) {
    mappings.push({
      kind: 'dir',
      source: textPackDir,
      destination: 'text',
    });
  }

  return mappings;
}

function runAwsCommand(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('aws', args, {
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`aws ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function generateR2Catalogs(repoRoot: string): Promise<GeneratedCatalogRecord[]> {
  const importDirs = await listOpenBibleImportDirs(path.join(repoRoot, 'tmp', 'open-bible-import'));
  const generated: GeneratedCatalogRecord[] = [];

  for (const importDir of importDirs) {
    const catalogFile = path.join(importDir, 'catalog.json');

    if (!(await pathExists(catalogFile))) {
      continue;
    }

    const translationId = path.basename(importDir).toLowerCase();
    const raw = await readFile(catalogFile, 'utf8');
    const catalog = JSON.parse(raw) as Record<string, unknown>;
    const nextCatalog = {
      ...catalog,
      audio: {
        ...((catalog.audio as Record<string, unknown> | undefined) ?? {}),
        baseUrl: `audio/${translationId}`,
      },
      timing: {
        ...((catalog.timing as Record<string, unknown> | undefined) ?? {}),
        baseUrl: `timing/${translationId}`,
      },
    };

    const outputFile = path.join(importDir, 'catalog.r2.json');
    await writeFile(outputFile, `${JSON.stringify(nextCatalog, null, 2)}\n`);
    generated.push({
      catalogFile,
      outputFile,
      translationId,
    });
  }

  return generated;
}

async function main(): Promise<void> {
  const { dryRun, repoRoot } = parseArgs();
  const bucket = requireEnv('R2_BUCKET');
  const endpoint = requireEnv('R2_ENDPOINT');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const mappings = await buildMappings(repoRoot);
  const generatedCatalogs = await generateR2Catalogs(repoRoot);

  if (mappings.length === 0) {
    throw new Error('No local Bible asset directories were found to publish.');
  }

  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          bucket,
          endpoint,
          mappings,
          generatedCatalogs,
        },
        null,
        2
      )
    );
    return;
  }

  for (const mapping of mappings) {
    if (mapping.kind === 'dir') {
      await runAwsCommand(
        [
          's3',
          'sync',
          mapping.source,
          `s3://${bucket}/${mapping.destination}`,
          '--endpoint-url',
          endpoint,
        ],
        awsEnv
      );
      continue;
    }

    await runAwsCommand(
      [
        's3',
        'cp',
        mapping.source,
        `s3://${bucket}/${mapping.destination}`,
        '--endpoint-url',
        endpoint,
      ],
      awsEnv
    );
  }

  const textPackManifestPath = path.join(
    repoRoot,
    'apps',
    'site',
    'lib',
    'r2-text-pack-manifest.json'
  );
  const textPackManifest = await generateR2TextPackManifest(textPackManifestPath);
  const uploadedSummaryPath = path.join(repoRoot, 'tmp', 'r2-publish-summary.json');
  await writeFile(
    uploadedSummaryPath,
    `${JSON.stringify({ bucket, endpoint, mappings, generatedCatalogs, textPackManifest }, null, 2)}\n`
  );

  console.log(
    JSON.stringify(
      {
        bucket,
        uploadedMappings: mappings.length,
        generatedCatalogs: generatedCatalogs.map((item) => item.outputFile),
        textPackManifest: textPackManifest.outputPath,
        summaryFile: uploadedSummaryPath,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
