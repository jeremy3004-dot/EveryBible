// Shared parse primitives for EL media payloads (catalog + manifest).
// Kept dependency-free so both parsers can guard untrusted JSON identically.

/** Matches a lowercase 64-char hex SHA-256 digest. */
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export const isSha256Hex = (value: unknown): value is string =>
  isNonEmptyString(value) && SHA256_HEX_RE.test(value);

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
