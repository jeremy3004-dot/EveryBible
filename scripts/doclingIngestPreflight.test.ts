import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_OUT, buildManifest, parseArgs, writeManifest } from './docling-ingest-preflight';

const source = readFileSync(
  path.join(process.cwd(), 'scripts', 'docling-ingest-preflight.ts'),
  'utf8'
);

test('docling preflight source keeps Docling server-side only', () => {
  assert.match(source, /Docling server-side only/);
  assert.match(source, /server-side worker, batch job, or MCP-backed ingestion service/);
  assert.doesNotMatch(source, /from ['"]docling/);
});

test('docling preflight source does not import React Native or mobile runtimes', () => {
  assert.doesNotMatch(source, /from ['"]react-native/);
  assert.doesNotMatch(source, /from ['"]expo/);
  assert.doesNotMatch(source, /@react-native/);
});

test('docling preflight defaults output under tmp', () => {
  assert.equal(DEFAULT_OUT, path.join('tmp', 'docling-preflight.json'));
  assert.equal(parseArgs(['--source', 'fixtures/sample.pdf', '--kind', 'pdf']).out, DEFAULT_OUT);
});

test('docling preflight includes license and provenance gates', async () => {
  const manifest = await buildManifest(
    {
      source: 'https://example.com/source.pdf',
      kind: 'pdf',
      out: DEFAULT_OUT,
    },
    new Date('2026-05-09T00:00:00.000Z')
  );

  assert.equal(manifest.detected.location, 'remote');
  assert.equal(manifest.state, 'needs_review');
  assert.ok(manifest.requiredGates.some((gate) => gate.id === 'license-provenance'));
  assert.match(JSON.stringify(manifest.requiredGates), /license identifier/);
  assert.match(JSON.stringify(manifest.requiredGates), /reviewer provenance/);
});

test('docling preflight rejects missing local inputs before future server job handoff', async () => {
  const manifest = await buildManifest(
    {
      source: path.join(os.tmpdir(), 'everybible-missing-docling-source.pdf'),
      kind: 'pdf',
      out: DEFAULT_OUT,
    },
    new Date('2026-05-09T00:00:00.000Z')
  );

  assert.equal(manifest.detected.location, 'local');
  assert.equal(manifest.detected.exists, false);
  assert.equal(manifest.state, 'reject');
});

test('docling preflight writes manifest JSON to the requested path', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'everybible-docling-preflight-'));
  const sourcePath = path.join(tempDir, 'source.pdf');
  const outPath = path.join(tempDir, 'manifest.json');

  try {
    await writeFile(sourcePath, 'placeholder pdf bytes', 'utf8');
    const manifest = await buildManifest(
      {
        source: sourcePath,
        kind: 'pdf',
        out: outPath,
      },
      new Date('2026-05-09T00:00:00.000Z')
    );
    await writeManifest(manifest, outPath);

    const written = JSON.parse(await readFile(outPath, 'utf8')) as Awaited<
      ReturnType<typeof buildManifest>
    >;
    assert.equal(written.source, sourcePath);
    assert.equal(written.kind, 'pdf');
    assert.equal(written.detected.location, 'local');
    assert.equal(written.detected.exists, true);
    assert.equal(written.state, 'ready');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
