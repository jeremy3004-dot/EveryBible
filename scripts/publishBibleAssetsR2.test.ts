import test, { after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../src/testing/mockModules';

// The real R2 publish sequence against a temp repo, with the aws CLI and the text-pack
// manifest generator replaced by recorders.
const steps: string[] = [];
mockModule(mock, 'node:child_process', {
  spawn: (command: string, args: string[]) => {
    steps.push(`${command} ${args[0]} ${args[1]} -> ${args[3]}`);
    const child = new EventEmitter();
    setImmediate(() => child.emit('close', 0));
    return child;
  },
});
mockModule(
  mock,
  fileURLToPath(new URL('./generate-r2-text-pack-manifest.ts', import.meta.url).href),
  {
    generateR2TextPackManifest: async (outputPath: string) => {
      steps.push(`manifest ${outputPath}`);
      return { outputPath, packs: 1 };
    },
  }
);
mock.method(console, 'log', () => undefined);

const env = {
  R2_BUCKET: 'everybible-media',
  R2_ENDPOINT: 'https://r2.example',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
};
const originalEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
Object.assign(process.env, env);

let repoRoot = '';
beforeEach(async () => {
  steps.length = 0;
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  repoRoot = await mkdtemp(path.join(tmpdir(), 'r2-publish-'));
  await mkdir(path.join(repoRoot, 'assets', 'timestamps', 'BSB'), { recursive: true });
  await mkdir(path.join(repoRoot, 'tmp'), { recursive: true });
});

after(async () => {
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const load = () => import('./publish-bible-assets-r2');

test('after the uploads, the committed site text-pack manifest is regenerated', async () => {
  const { publishBibleAssets } = await load();

  await publishBibleAssets({ dryRun: false, repoRoot });

  assert.deepEqual(steps, [
    `aws s3 sync -> s3://everybible-media/timing/bsb`,
    `manifest ${path.join(repoRoot, 'apps', 'site', 'lib', 'r2-text-pack-manifest.json')}`,
  ]);
  const summary = JSON.parse(
    await readFile(path.join(repoRoot, 'tmp', 'r2-publish-summary.json'), 'utf8')
  ) as { textPackManifest: { outputPath: string } };
  assert.match(
    summary.textPackManifest.outputPath,
    /apps[/\\]site[/\\]lib[/\\]r2-text-pack-manifest\.json$/
  );
});

test('a dry run uploads nothing and leaves the manifest alone', async () => {
  const { publishBibleAssets } = await load();

  await publishBibleAssets({ dryRun: true, repoRoot });

  assert.deepEqual(steps, []);
});
