/**
 * Dependency-free guard primitives shared by every persisted-state sanitizer: each coerces an
 * untrusted persisted value to the expected type or to null.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export const sanitizeRequiredString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

export const sanitizeOptionalFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const sanitizeIsoDateString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
};
