/** The selected window includes today and uses UTC calendar days everywhere. */
export function analyticsWindowStart(days: number, now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1)
  ).toISOString();
}
