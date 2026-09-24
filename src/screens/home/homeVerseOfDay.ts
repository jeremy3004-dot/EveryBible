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
  /** Whether today's chapter audio can play now: streamed while online, or downloaded. */
  audioAvailable: boolean;
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
    const scripture = await getDailyScripture(load.translation, load.audioAvailable, {
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
  /** Time until the greeting next changes (see getMillisecondsUntilNextGreetingChange). */
  msUntilNextGreetingChange?: () => number;
  /**
   * Called whenever the verse refreshes because time moved on (a return to the
   * foreground, a local midnight), so the date, greeting and ledger follow it.
   */
  onClockAdvance?: () => void;
}

/**
 * Loads the verse once interactions settle, then refreshes it silently when the app
 * returns to the foreground and at each local midnight. Returns the effect cleanup,
 * which also makes any in-flight load stale.
 */
export function startVerseOfDayRefresh(refresh: VerseOfDayRefresh): () => void {
  const { midnightTimerRef, appStateRef } = refresh;
  const refreshVerseOfDay = () => {
    refresh.onClockAdvance?.();
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

  // The greeting changes at noon and 17:00 too, but the verse does not, so these only
  // advance the clock.
  let greetingTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleGreetingChange = () => {
    const msUntilNextGreetingChange = refresh.msUntilNextGreetingChange;
    if (!msUntilNextGreetingChange) return;
    if (greetingTimer) {
      clearTimeout(greetingTimer);
    }

    greetingTimer = setTimeout(() => {
      refresh.onClockAdvance?.();
      scheduleGreetingChange();
    }, msUntilNextGreetingChange());
  };

  const interactionHandle = refresh.runAfterInteractions(() => {
    void refresh.load();
  });

  const subscription = refresh.addAppStateListener((nextAppState) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      refreshVerseOfDay();
      scheduleMidnightRefresh();
      scheduleGreetingChange();
    }

    appStateRef.current = nextAppState;
  });

  scheduleMidnightRefresh();
  scheduleGreetingChange();

  return () => {
    refresh.requestIdRef.current += 1;
    interactionHandle.cancel();
    subscription.remove();

    if (midnightTimerRef.current) {
      clearTimeout(midnightTimerRef.current);
      midnightTimerRef.current = null;
    }

    if (greetingTimer) {
      clearTimeout(greetingTimer);
      greetingTimer = null;
    }
  };
}

type HomeGreetingKey = 'home.goodMorning' | 'home.goodAfternoon' | 'home.goodEvening';

// The local hours at which the greeting turns to afternoon and to evening.
const AFTERNOON_HOUR = 12;
const EVENING_HOUR = 17;

export function getHomeGreetingKey(date: Date): HomeGreetingKey {
  const hour = date.getHours();
  if (hour < AFTERNOON_HOUR) return 'home.goodMorning';
  if (hour < EVENING_HOUR) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

/** Milliseconds until the next local 12:00, 17:00 or midnight, whichever comes first. */
export function getMillisecondsUntilNextGreetingChange(now: Date): number {
  const hour = now.getHours();
  const next = new Date(now);
  // setHours(24) is the next local midnight, where the greeting returns to morning.
  next.setHours(hour < AFTERNOON_HOUR ? AFTERNOON_HOUR : hour < EVENING_HOUR ? EVENING_HOUR : 24);
  next.setMinutes(0, 0, 0);
  return next.getTime() - now.getTime();
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
    .replace(/^[\s,.·、，،]+/, '')
    .replace(/[\s,.·、，،]+$/, '');
  return weekday && rest ? `${weekday} · ${rest}` : weekday || rest;
}
