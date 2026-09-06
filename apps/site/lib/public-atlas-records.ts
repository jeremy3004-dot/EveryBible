import type { AtlasRecordKind } from '../../admin/lib/language-atlas/types';

export function selectPublicAtlasRecords<T extends { kind: AtlasRecordKind }>(
  records: readonly T[]
): T[] {
  return records.filter((record) => record.kind === 'language' || record.kind === 'dialect');
}
