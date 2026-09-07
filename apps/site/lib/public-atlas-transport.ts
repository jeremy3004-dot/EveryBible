import type { AtlasIndex, AtlasLocation, AtlasRecord } from '../../admin/lib/language-atlas/types';

interface PackedAtlas extends Omit<AtlasIndex, 'schemaVersion' | 'records'> {
  schemaVersion: 2;
  recordFields: string[][];
  locationFields: string[][];
  locations: unknown[][];
  records: unknown[][];
}

/** Restore the existing model once, before any map, search or profile consumes it. */
export function decodePublicAtlas(value: unknown): AtlasIndex {
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
    return Object.fromEntries(fields.map((field, index) => [field, row[index + 1]]));
  };
  const {
    recordFields,
    locationFields,
    locations: packedLocations,
    records: packedRecords,
    ...metadata
  } = packed as PackedAtlas;
  const locations = packedLocations.map(
    (row) => unpack(row, locationFields) as unknown as AtlasLocation
  );
  const location = (id: unknown): AtlasLocation => {
    if (typeof id !== 'number' || !Number.isInteger(id) || !locations[id])
      throw new Error('Invalid atlas location');
    return locations[id];
  };
  const records = packedRecords.map((row) => {
    const record = unpack(row, recordFields);
    record.location = record.location === null ? null : location(record.location);
    if (Array.isArray(record.locations)) record.locations = record.locations.map(location);
    return record as unknown as AtlasRecord;
  });
  return { ...metadata, schemaVersion: 1, records };
}
