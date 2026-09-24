/**
 * True when stamp `left` is strictly later than `right`. An unparseable `left` is never
 * later; an unparseable or missing `right` is earlier than any real stamp.
 *
 * Stamps are compared as times, not strings: Postgres returns `+00:00` offsets while the
 * app writes `Z`, so the same instant can be spelled two ways.
 */
export const isStampLater = (
  left: string | null | undefined,
  right: string | null | undefined
): boolean => {
  const leftTime = typeof left === 'string' ? Date.parse(left) : Number.NaN;
  if (!Number.isFinite(leftTime)) {
    return false;
  }
  const rightTime = typeof right === 'string' ? Date.parse(right) : Number.NaN;
  return !Number.isFinite(rightTime) || leftTime > rightTime;
};
