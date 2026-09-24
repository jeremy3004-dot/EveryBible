import type { AtlasIndex, AtlasLocation, AtlasRecord } from '../../admin/lib/language-atlas/types';

interface PackedAtlas extends Omit<AtlasIndex, 'schemaVersion' | 'records'> {
  schemaVersion: 2;
  recordFields: string[][];
  locationFields: string[][];
  locations: unknown[][];
  records: unknown[][];
}

/** Rows (records plus locations) decoded between pauses: about 2 ms on a laptop. */
export const PUBLIC_ATLAS_DECODE_SLICE = 2_000;

/* One pass over the packed snapshot that pauses (yields) after every slice
   of rows, so the sliced decoder can hand the main thread back to the page
   while the synchronous decoder simply runs it to the end. */
function* decodeSteps(value: unknown): Generator<void, AtlasIndex> {
  const packed = value as Partial<PackedAtlas> | null;
  if (
    packed?.schemaVersion !== 2 ||
    !Array.isArray(packed.records) ||
    !Array.isArray(packed.recordFields) ||
    !Array.isArray(packed.locationFields) ||
    !Array.isArray(packed.locations)
  )
    throw new Error('Invalid atlas');
  const unpack = (row: unknown, layouts: string[][]): Record<string, unknown> => {
    if (!Array.isArray(row)) throw new Error('Invalid atlas row');
    const layout = row[0];
    const fields =
      typeof layout === 'number' && Number.isInteger(layout) ? layouts[layout] : undefined;
    if (!fields || fields.length !== row.length - 1) throw new Error('Invalid atlas row');
    const unpacked: Record<string, unknown> = {};
    for (let index = 0; index < fields.length; index += 1) unpacked[fields[index]] = row[index + 1];
    return unpacked;
  };
  const {
    recordFields,
    locationFields,
    locations: packedLocations,
    records: packedRecords,
    ...metadata
  } = packed as PackedAtlas;
  let sinceLastPause = 0;
  const locations: AtlasLocation[] = [];
  for (const row of packedLocations) {
    locations.push(unpack(row, locationFields) as unknown as AtlasLocation);
    if (++sinceLastPause === PUBLIC_ATLAS_DECODE_SLICE) {
      sinceLastPause = 0;
      yield;
    }
  }
  const location = (id: unknown): AtlasLocation => {
    if (typeof id !== 'number' || !Number.isInteger(id) || !locations[id])
      throw new Error('Invalid atlas location');
    return locations[id];
  };
  const records: AtlasRecord[] = [];
  for (const row of packedRecords) {
    const record = unpack(row, recordFields);
    record.location = record.location === null ? null : location(record.location);
    if (Array.isArray(record.locations)) record.locations = record.locations.map(location);
    // The startup download omits the generated summary; the shared map's
    // fallback hover text still expects a string.
    if (typeof record.summary !== 'string') record.summary = '';
    records.push(record as unknown as AtlasRecord);
    if (++sinceLastPause === PUBLIC_ATLAS_DECODE_SLICE) {
      sinceLastPause = 0;
      yield;
    }
  }
  return { ...metadata, schemaVersion: 1, records };
}

/** Restore the existing model once, before any map, search or profile consumes it. */
export function decodePublicAtlas(value: unknown): AtlasIndex {
  const steps = decodeSteps(value);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/* scheduler.yield() (Chrome 129+) resumes ahead of other queued work;
   setTimeout lets input and rendering run in between everywhere else. */
const yieldToPage = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield
    ? scheduler.yield()
    : new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/**
 * The same decode, awaiting `pause` between slices. Decoding the whole
 * snapshot at once is a 35 ms task on a laptop and several times that on a
 * phone, which blocks taps while the homepage is still starting up.
 */
export async function decodePublicAtlasInSlices(
  value: unknown,
  pause: () => Promise<void> = yieldToPage
): Promise<AtlasIndex> {
  const steps = decodeSteps(value);
  let step = steps.next();
  while (!step.done) {
    await pause();
    step = steps.next();
  }
  return step.value;
}
