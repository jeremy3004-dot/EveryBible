import type { BibleTranslation, DailyScripture } from '../../types';

type VerseTranslation = Pick<BibleTranslation, 'id' | 'hasText' | 'hasAudio' | 'audioGranularity'>;

export interface VerseOfDayBibleService {
  getDailyScripture: (
    translation: VerseTranslation,
    audioAvailable: boolean,
    options?: { allowInitialization?: boolean }
  ) => Promise<DailyScripture>;
}

export interface VerseOfDayLoad {
  requestIdRef: { current: number };
  translation: VerseTranslation | undefined;
  remoteAudioAvailable: boolean;
  /** The screen's lazy `import()` of bibleService, kept there so Home's graph stays light. */
  loadBibleService: () => Promise<VerseOfDayBibleService>;
  setIsLoadingVerse: (isLoading: boolean) => void;
  setDailyScripture: (scripture: DailyScripture | null) => void;
}

export interface VerseOfDayLoadOptions {
  allowInitialization?: boolean;
  silent?: boolean;
}

/**
 * Loads the verse of the day from the local Bible, never the network. Only the newest
 * request may write Scripture or settle the spinner, and a request superseded while
 * the Bible module loads never starts database work.
 */
export async function loadVerseOfDay(
  load: VerseOfDayLoad,
  { allowInitialization = true, silent = false }: VerseOfDayLoadOptions = {}
): Promise<void> {
  const { requestIdRef } = load;
  const requestId = ++requestIdRef.current;
  if (!silent) {
    load.setIsLoadingVerse(true);
  }

  try {
    if (!load.translation) {
      load.setDailyScripture(null);
      return;
    }

    const { getDailyScripture } = await load.loadBibleService();
    if (requestId !== requestIdRef.current) return;
    const scripture = await getDailyScripture(load.translation, load.remoteAudioAvailable, {
      allowInitialization,
    });
    if (requestId === requestIdRef.current) {
      load.setDailyScripture(scripture);
    }
  } catch (error) {
    if (requestId === requestIdRef.current) {
      console.error('Error loading verse of the day:', error);
    }
  } finally {
    // A silent retry may supersede the initial load, so it must also settle its spinner.
    if (requestId === requestIdRef.current) {
      load.setIsLoadingVerse(false);
    }
  }
}

export interface VerseOfDayRefresh {
  load: (options?: VerseOfDayLoadOptions) => Promise<void>;
  requestIdRef: { current: number };
  appStateRef: { current: string };
  midnightTimerRef: { current: ReturnType<typeof setTimeout> | null };
  addAppStateListener: (listener: (nextAppState: string) => void) => { remove: () => void };
  runAfterInteractions: (task: () => void) => { cancel: () => void };
  msUntilNextLocalMidnight: () => number;
}

/**
 * Loads the verse once interactions settle, then refreshes it silently when the app
 * returns to the foreground and at each local midnight. Returns the effect cleanup,
 * which also makes any in-flight load stale.
 */
export function startVerseOfDayRefresh(refresh: VerseOfDayRefresh): () => void {
  const { midnightTimerRef, appStateRef } = refresh;
  const refreshVerseOfDay = () => {
    void refresh.load({ silent: true });
  };

  const scheduleMidnightRefresh = () => {
    if (midnightTimerRef.current) {
      clearTimeout(midnightTimerRef.current);
    }

    midnightTimerRef.current = setTimeout(() => {
      refreshVerseOfDay();
      scheduleMidnightRefresh();
    }, refresh.msUntilNextLocalMidnight());
  };

  const interactionHandle = refresh.runAfterInteractions(() => {
    void refresh.load();
  });

  const subscription = refresh.addAppStateListener((nextAppState) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      refreshVerseOfDay();
      scheduleMidnightRefresh();
    }

    appStateRef.current = nextAppState;
  });

  scheduleMidnightRefresh();

  return () => {
    refresh.requestIdRef.current += 1;
    interactionHandle.cancel();
    subscription.remove();

    if (midnightTimerRef.current) {
      clearTimeout(midnightTimerRef.current);
      midnightTimerRef.current = null;
    }
  };
}

/**
 * Home's eyebrow date, "TUESDAY · 8 SEPTEMBER" before casing: the weekday is split off
 * its own way so every locale keeps the EL separator instead of the locale's own comma,
 * and the year is left out.
 */
export function formatHomeDateLabel(language: string, now: Date): string {
  const parts = new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(now);
  const weekday = parts
    .filter((part) => part.type === 'weekday')
    .map((part) => part.value)
    .join('');
  const rest = parts
    .filter((part) => part.type !== 'weekday')
    .map((part) => part.value)
    .join('')
    .replace(/^[\s,.·、，]+/, '')
    .replace(/[\s,.·、，]+$/, '');
  return weekday && rest ? `${weekday} · ${rest}` : weekday || rest;
}
