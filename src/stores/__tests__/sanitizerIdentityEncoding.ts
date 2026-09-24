/** Canonical text encoding for sanitizer outcomes, used by the sanitizer identity test. */
import type { SanitizerApi, SanitizerIdentityCase } from './sanitizerIdentityCorpus';

const UNDEFINED_TAG = '$undefined';
const NUMBER_TAG = '$number';
const THREW_TAG = '$threw';

const encodeValue = (value: unknown): unknown => {
  if (value === undefined) return { [UNDEFINED_TAG]: true };
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    return { [NUMBER_TAG]: Object.is(value, -0) ? '-0' : String(value) };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, encodeValue((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};

const decodeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record[UNDEFINED_TAG] === true) return undefined;
  if (typeof record[NUMBER_TAG] === 'string') {
    return record[NUMBER_TAG] === '-0' ? -0 : Number(record[NUMBER_TAG]);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, decodeValue(entry)])
  );
};

/** Runs a case and returns its outcome (value or thrown error) in the canonical text encoding. */
export const runSanitizerIdentityCase = (
  identityCase: SanitizerIdentityCase,
  api: SanitizerApi
): string => {
  try {
    return JSON.stringify(encodeValue(identityCase.run(api)));
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return JSON.stringify({ [THREW_TAG]: message });
  }
};

/** Inverse of the encoding, so assertions compare real values (undefined keys, NaN, -0 included). */
export const decodeSanitizerIdentityOutcome = (encoded: string): unknown =>
  decodeValue(JSON.parse(encoded));
