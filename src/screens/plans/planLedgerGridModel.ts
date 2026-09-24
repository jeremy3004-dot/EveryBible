// Kept free of react-native imports so the node test runner can load it.

/**
 * Splits the plan card's day squares into rows of `columns`, padding the last
 * row with `null` slots. Every row then spans the card's full width, so each
 * square can size itself with flex + aspectRatio and the grid has its final
 * height on the first frame, with no width measurement that lands a frame late.
 */
export function getPlanLedgerGridRows<T>(items: readonly T[], columns: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let start = 0; start < items.length; start += columns) {
    const row: (T | null)[] = items.slice(start, start + columns);
    while (row.length < columns) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}
