import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('bibleStore cancelDownload targets the real running job id instead of reconstructing a mismatched one', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.equal(
    source.includes("`${progress.translationId}:${progress.bookId ?? 'all'}`"),
    false,
    'cancelDownload should not hand-build a job id string that omits the audio-download: prefix and scope segment'
  );

  // The translation's own activeDownloadJob is authoritative; downloadProgress.jobId is the
  // fallback mirror. Neither may be rebuilt by hand. (N22)
  assert.match(
    source,
    /cancelDownload:\s*\(\)\s*=>\s*\{[\s\S]{0,1200}activeDownloadJob\s*\r?\n?\s*\?\.id[\s\S]{0,200}progress\?\.jobId/,
    'cancelDownload should target the running translation job id, falling back to downloadProgress.jobId'
  );

  assert.match(
    source,
    /requestAudioDownloadCancellation/,
    'cancelDownload should signal the in-JS abort token so a running download loop actually stops, not just the native transport'
  );
});

test('downloadProgress updates carry the real job id from the underlying audio download job record', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /function mapAudioDownloadProgress\(job: AudioDownloadJobRecord\): TranslationDownloadProgress \{\s*return \{\s*translationId: job\.translationId,\s*jobId: job\.id,/,
    'mapAudioDownloadProgress should propagate job.id onto downloadProgress as jobId'
  );

  assert.match(
    source,
    /const handleAudioBookProgress = \(\{[\s\S]{0,200}jobId[\s\S]{0,400}downloadProgress: \{[\s\S]{0,200}jobId,/,
    'per-chapter book progress updates should keep carrying jobId forward instead of dropping it'
  );

  assert.match(
    source,
    /const handleAudioBookComplete = \(\{[\s\S]{0,200}jobId[\s\S]{0,1200}downloadProgress: \{[\s\S]{0,200}jobId,/,
    'per-book collection progress updates should keep carrying jobId forward instead of dropping it'
  );

  // (N25) The collection path must also report chapter-level aggregate progress, not only
  // whole-book completions, and that event carries the translation-scope job id.
  assert.match(
    source,
    /const handleAudioCollectionProgress = \(\{[\s\S]{0,200}jobId[\s\S]{0,600}downloadProgress: \{[\s\S]{0,200}jobId,/,
    'aggregate collection progress updates should carry the translation job id forward'
  );
  assert.match(
    source,
    /onProgress: handleAudioCollectionProgress/,
    'the translation-scope download should subscribe to aggregate chapter progress'
  );
});
