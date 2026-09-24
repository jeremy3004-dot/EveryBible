/**
 * Device-debugging breadcrumbs for the reader's screen-reader layout switch: what the
 * app was told about VoiceOver/TalkBack, and which verse layout the reader drew as a
 * result. Nothing here changes behaviour or what the user sees.
 *
 * Each entry is also written as one `[EB-A11Y]` console line, which a release Android
 * build still sends to logcat (`adb logcat -s ReactNativeJS:I | grep EB-A11Y`). Lines
 * are written only when the signal arrives or the layout changes, a handful per
 * chapter, never per render or per scroll.
 *
 * Why it exists: `adb shell uiautomator dump` connects UiAutomation without
 * FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES, which unbinds TalkBack for the length of
 * the dump. The app is then correctly told touch exploration is off and redraws the
 * sighted layout before the dump's idle wait ends, so the dump shows the paragraph
 * layout even though the reader works under TalkBack. The `source=event` lines around
 * a dump show that happening. Safe to delete together with its three call sites.
 */

/** Where the screen-reader value came from: the initial native query or a change event. */
export type ScreenReaderSignalSource = 'query' | 'event' | 'queryFailed';

/**
 * `inlineParagraphs`: prose paragraphs are one Text with a span per verse (sighted).
 * `perVerse`: every verse is its own element (screen reader on, or the legacy reader).
 */
export type ReaderVerseLayout = 'inlineParagraphs' | 'perVerse';

export type ScreenReaderTraceEntry =
  | { kind: 'signal'; at: number; enabled: boolean; source: ScreenReaderSignalSource }
  | {
      kind: 'layout';
      at: number;
      layout: ReaderVerseLayout;
      virtualized: boolean;
      screenReaderEnabled: boolean;
    };

export const MAX_SCREEN_READER_TRACE_ENTRIES = 20;
const LOG_TAG = '[EB-A11Y]';

let entries: ScreenReaderTraceEntry[] = [];

function append(entry: ScreenReaderTraceEntry, line: string): void {
  entries = [...entries, entry].slice(-MAX_SCREEN_READER_TRACE_ENTRIES);
  try {
    console.info(`${LOG_TAG} ${line}`);
  } catch {
    // A diagnostics line must never break the reader.
  }
}

export function traceScreenReaderSignal(
  enabled: boolean,
  source: ScreenReaderSignalSource,
  now: number = Date.now()
): void {
  append(
    { kind: 'signal', at: now, enabled, source },
    `screenReader=${enabled ? 'on' : 'off'} source=${source} at=${now}`
  );
}

/** Recorded when the reader's verse layout changes; a repeat of the last layout is ignored. */
export function traceReaderVerseLayout(
  layout: ReaderVerseLayout,
  { virtualized, screenReaderEnabled }: { virtualized: boolean; screenReaderEnabled: boolean },
  now: number = Date.now()
): void {
  const last = [...entries].reverse().find((entry) => entry.kind === 'layout');
  if (
    last?.kind === 'layout' &&
    last.layout === layout &&
    last.virtualized === virtualized &&
    last.screenReaderEnabled === screenReaderEnabled
  ) {
    return;
  }
  append(
    { kind: 'layout', at: now, layout, virtualized, screenReaderEnabled },
    `readerLayout=${layout} virtualized=${virtualized ? 1 : 0} screenReader=${
      screenReaderEnabled ? 'on' : 'off'
    } at=${now}`
  );
}

/** Oldest first. */
export function getScreenReaderTrace(): readonly ScreenReaderTraceEntry[] {
  return entries;
}

export function clearScreenReaderTrace(): void {
  entries = [];
}
