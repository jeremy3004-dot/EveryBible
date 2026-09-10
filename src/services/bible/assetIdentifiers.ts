/**
 * Path-safety guard for server-supplied identifiers that end up inside on-device file
 * paths (per-translation SQLite files, downloaded audio directories).
 *
 * A catalog is remote data. Without this guard an id like `../../Library` escapes the
 * sandbox directory it is interpolated into, and those interpolated paths are handed to
 * FileSystem.downloadAsync / moveAsync / deleteAsync — i.e. arbitrary write and delete
 * outside the intended folder. Validate at BOTH ends: drop bad entries where a catalog is
 * parsed, and assert again at the path builders so no future caller can bypass the parser.
 *
 * The shape is deliberately narrow but covers every id the app actually ships: `bsb`,
 * `web`, `eng-asv`, `spaRV1909`, `engBBE`, `el-bhujel`, `lqdtest`, and every USFM book id
 * (`GEN`, `1SA`, `SNG`, …). No slashes, no leading dot (so `.`, `..` and dotfiles are out),
 * and a length ceiling so an id cannot blow past filesystem name limits.
 */
const SAFE_ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isSafeAssetId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ASSET_ID_RE.test(value);
}

/**
 * Throws unless `value` is safe to interpolate into a filesystem path. `label` names the
 * kind of id (e.g. 'translation id') so the failure is diagnosable from a log line.
 */
export function assertSafeAssetId(value: string, label: string): string {
  if (!isSafeAssetId(value)) {
    throw new Error(`Unsafe ${label} rejected: ${JSON.stringify(value)}`);
  }
  return value;
}
