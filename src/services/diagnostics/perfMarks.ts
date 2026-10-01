/**
 * Timing marks for profiling a release build. Off in every shipped build: a mark does
 * nothing unless the bundle was built with `EXPO_PUBLIC_EB_PERF_MARKS=1`, and Babel
 * inlines that value at bundle time, so the check folds to a constant.
 *
 * Each mark is one `[EB-P] <name> <epoch ms> [detail]` console line. On iOS it reaches
 * the unified log (`xcrun simctl spawn <udid> log stream --level info --predicate
 * 'eventMessage CONTAINS "[EB-P]"'`), on Android logcat. Epoch time lets a host script
 * line the marks up with the process start, since simulator processes share the Mac's
 * clock. Method and scripts: docs/research/ios-profiling-2026-10-01.md.
 *
 * The always-on `[EB-T]` startup lines (App:module-start, Home:interaction-ready) are
 * separate: the Android startup benchmark parses those from every release build.
 */

export function arePerfMarksEnabled(): boolean {
  // Read at the call so Babel inlines it per site and tests can flip it.
  return process.env.EXPO_PUBLIC_EB_PERF_MARKS === '1';
}

export function perfMark(name: string, detail?: string, now: number = Date.now()): void {
  if (!arePerfMarksEnabled()) return;
  console.log(detail ? `[EB-P] ${name} ${now} ${detail}` : `[EB-P] ${name} ${now}`);
}

/** Marks when the frame after the current commit runs, a proxy for "drawn". */
export function perfMarkAfterFrame(name: string, detail?: string): void {
  if (!arePerfMarksEnabled()) return;
  requestAnimationFrame(() => perfMark(name, detail));
}
