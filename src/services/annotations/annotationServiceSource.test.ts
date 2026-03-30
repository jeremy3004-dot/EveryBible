import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('annotationService stays local-only and routes reads and writes through the MMKV store', () => {
  const source = readRelativeSource('./annotationService.ts');

  assert.match(
    source,
    /import \{ localAnnotationStore \} from '\.\.\/\.\.\/stores\/annotationStore';/,
    'annotationService should route all annotation reads and writes through the local MMKV-backed store'
  );

  assert.match(
    source,
    /fetchAnnotations[\s\S]*localAnnotationStore\.annotations\.filter\(isActiveAnnotation\)/s,
    'annotationService should read active annotations from the local store instead of a backend client'
  );

  assert.match(
    source,
    /upsertAnnotation[\s\S]*localAnnotationStore\.upsertAnnotation\(annotation\)/s,
    'annotationService should persist annotation writes to the local store'
  );

  assert.match(
    source,
    /getAnnotationsForChapter[\s\S]*localAnnotationStore\.annotations\.filter\(/s,
    'annotationService should resolve chapter annotations from the local store'
  );

  assert.match(
    source,
    /The app no longer syncs annotations to a backend\./,
    'annotationService should document the local-only sync path'
  );
});
