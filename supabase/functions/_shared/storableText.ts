// Text Postgres will refuse. A text or jsonb value cannot hold U+0000, and a lone UTF-16
// surrogate has no UTF-8 form (supabase-js sends it as a `\udXXX` escape, which the Postgres
// JSON parser rejects). Either one in a request field used to reach the insert, fail the whole
// statement and come back as a 500, so an analytics device retried the batch forever and a
// public endpoint answered a client mistake with a server error.
//
// Deliberately free of Deno and supabase-js imports so the unit tests can load it directly.

const NUL = /\u0000/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const LONE_SURROGATE_GLOBAL = new RegExp(LONE_SURROGATE.source, 'g');

export function isStorableText(value: string): boolean {
  return !NUL.test(value) && !LONE_SURROGATE.test(value);
}

/** True when every string in `values` can be stored; non-strings are ignored. */
export function textFieldsStorable(values: unknown[]): boolean {
  return values.every((value) => typeof value !== 'string' || isStorableText(value));
}

/**
 * Whether a JSON value (keys included) can be stored as jsonb. Reads the JSON.stringify output,
 * where a NUL and a lone surrogate are the only characters written as `\u0000` / `\udXXX`
 * escapes (a valid pair is written raw), so no recursive walk of a caller-shaped object is
 * needed. An escape preceded by an even run of backslashes is literal text, not an escape.
 */
export function jsonStorable(value: unknown): boolean {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (serialized === undefined) return true;
  return !/(?:^|[^\\])(?:\\\\)*\\u(?:0000|d[89a-f][0-9a-f]{2})/i.test(serialized);
}

/** Replaces NUL and lone surrogates with U+FFFD, for text the server rewrites anyway. */
export function toStorableText(value: string): string {
  return value.replace(/\u0000/g, '�').replace(LONE_SURROGATE_GLOBAL, '�');
}
