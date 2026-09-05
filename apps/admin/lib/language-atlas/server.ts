import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import type { AtlasDetail, AtlasIndex } from './types';

const decompress = promisify(gunzip);

async function readSnapshot<T>(filename: string): Promise<T> {
  const compressed = await readFile(path.join(process.cwd(), 'data/language-atlas', filename));
  return JSON.parse((await decompress(compressed)).toString('utf8')) as T;
}

let indexPromise: Promise<AtlasIndex> | undefined;
// The full evidence collection is over 200 MB uncompressed. Keep only two of
// sixteen shards resident so opening a profile does not load every biography.
const detailShards = new Map<string, Promise<Map<string, AtlasDetail>>>();

export function getAtlasIndex(): Promise<AtlasIndex> {
  indexPromise ??= readSnapshot<AtlasIndex>('index.json.gz').catch((error: unknown) => {
    indexPromise = undefined;
    throw error;
  });
  return indexPromise;
}

export async function getAtlasDetail(id: string): Promise<AtlasDetail | null> {
  // Only a hexadecimal hash selects a fixed shard. IDs remain exact map keys.
  const shard = createHash('sha256').update(id).digest('hex')[0];
  let pending = detailShards.get(shard);
  if (pending) detailShards.delete(shard);
  else {
    pending = readSnapshot<Record<string, AtlasDetail>>(`details-${shard}.json.gz`)
      .then((details) => new Map(Object.entries(details)))
      .catch((error: unknown) => {
        detailShards.delete(shard);
        throw error;
      });
  }
  detailShards.set(shard, pending);
  if (detailShards.size > 2) detailShards.delete(detailShards.keys().next().value!);
  return (await pending).get(id) ?? null;
}
