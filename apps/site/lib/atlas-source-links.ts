import { safeSourceUrl } from '../../admin/lib/language-atlas/model';
import type { AtlasRecordKind, AtlasSource } from '../../admin/lib/language-atlas/types';

interface SourceRecord {
  kind: AtlasRecordKind;
  iso6393: string | null;
  glottocode: string | null;
  rolvCode: string | null;
}

/**
 * The provider's page for this record when its code identifies one, else the
 * source's home page. These URL patterns are also used by the snapshot importer.
 */
export function atlasSourceUrl(
  source: AtlasSource | Pick<AtlasSource, 'id' | 'url'>,
  record?: SourceRecord
) {
  const recordUrl =
    source.id === 'glottolog' && record?.glottocode
      ? `https://glottolog.org/resource/languoid/id/${encodeURIComponent(record.glottocode)}`
      : source.id === 'grn' && record?.rolvCode
        ? `https://globalrecordings.net/en/language/${encodeURIComponent(record.rolvCode)}`
        : source.id === 'joshua' && record?.kind === 'language' && record.iso6393
          ? `https://joshuaproject.net/languages/${encodeURIComponent(record.iso6393)}`
          : source.url;
  return safeSourceUrl(recordUrl);
}

/** Joshua Project's permission requires this exact acknowledgment wording. */
export function atlasSourceLabel(source: Pick<AtlasSource, 'name'>): string {
  return /joshua/i.test(source.name) ? 'Data provided by Joshua Project' : source.name;
}
