import { audioPlayer, backgroundMusicPlayer } from '../../services/audio';
import { hasSleepTimerExpired } from '../../services/audio/audioSleepTimerModel';
import { useAudioStore } from '../../stores/audioStore';
import {
  SELAH_BED_FADE_OUT_MS,
  SELAH_FADE_MS,
  canSelah,
  resolveSelahDeadline,
  resolveSelahResumePositionMs,
  type SelahDeadlineReason,
} from '../../stores/audioSelahModel';
import { loadChapterVerseTimings, peekChapterVerseTimings } from './passageRepeat';

// Selah: "pause the reading, keep the music". The narration fades out and pauses while
// the music bed plays on (backgroundMusicFollow keeps the bed playing for a narration
// Selah holds). Play of any kind (reader, bar, lock screen, headset) resumes it through
// resumePlayback, which picks up a little earlier and fades the narration back in.
//
// Like the music bed and the lock-screen commands, this outlives the reader: its state is
// module-level, its timers keep running with the reader closed, and it drives whichever
// player mounted last (provideSelahTransport).
//
// The narration's volume: whenever no fade runs it is exactly the listener's Voice level
// (narrationVolumeFollow sets that level on every change). A fade scales the live Voice
// level at every step, so a Voice change mid-fade is followed, and ends on it.

/** The player actions Selah drives. */
export interface SelahTransport {
  /** Pauses the narration for Selah: the player's pause, keeping Selah on. */
  holdNarration: () => Promise<void>;
  /** The player's resume, which takes Selah's pick-up point (resumePlayback). */
  resume: () => Promise<void>;
  /** The player's normal pause: it ends Selah, so the bed stops with the narration. */
  pause: () => Promise<void>;
}

const FADE_STEP_MS = 50;

let transport: SelahTransport | null = null;
let subscription: (() => void) | null = null;

/**
 * Where Selah is: 'fading-out' while the narration fades before its pause, 'held' from
 * the pause on (or at once, for Selah over a paused chapter), 'resuming' while a resume
 * brings the narration back (the flag stays on until it plays, so the bed never dips),
 * 'off' otherwise.
 */
let phase: 'off' | 'fading-out' | 'held' | 'resuming' = 'off';
/** The resume under way, and where it picks up (see takeSelahResume). */
let resumeTicket = 0;
let resumePositionMs = 0;
/** Bumped whenever Selah starts or ends, so steps of an earlier Selah stand down. */
let selahToken = 0;
let heldSinceMs = 0;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
/** Set while Selah itself turns the store flag off, so the subscription leaves it be. */
let endingSelah = false;

// --- the narration fade -----------------------------------------------------------

/** The share of the Voice level the narration is at. 1 whenever no fade runs. */
let fadeLevel = 1;
let fade: { timer: ReturnType<typeof setInterval>; settle: (done: boolean) => void } | null = null;

function applyFadeLevel(level: number): Promise<void> {
  fadeLevel = level;
  return audioPlayer.setVolume(useAudioStore.getState().narrationVolume * level);
}

/** Stops a running fade where it is. */
function stopNarrationFade(): void {
  const running = fade;
  if (!running) return;
  fade = null;
  clearInterval(running.timer);
  running.settle(false);
}

/**
 * Fades the narration to `target` (a share of the Voice level) over the part of
 * SELAH_FADE_MS it has left to go. Resolves true once there, false if stopped first.
 */
function fadeNarration(target: 0 | 1): Promise<boolean> {
  stopNarrationFade();
  const from = fadeLevel;
  const steps = Math.max(1, Math.round((SELAH_FADE_MS * Math.abs(target - from)) / FADE_STEP_MS));
  return new Promise<boolean>((resolve) => {
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      const done = step >= steps;
      void applyFadeLevel(done ? target : from + ((target - from) * step) / steps);
      if (!done) return;
      clearInterval(timer);
      fade = null;
      resolve(true);
    }, FADE_STEP_MS);
    fade = { timer, settle: resolve };
  });
}

/** Puts the narration back at the Voice level, ending any fade. */
export function restoreNarrationVolume(): void {
  stopNarrationFade();
  if (fadeLevel !== 1) void applyFadeLevel(1);
}

/** As restoreNarrationVolume, unless a fade is running: it belongs to a newer command. */
function restoreNarrationVolumeUnlessFading(): void {
  if (!fade) restoreNarrationVolume();
}

// --- starting and ending ------------------------------------------------------------

function clearDeadline(): void {
  if (deadlineTimer) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
}

/** Ends Selah from here: the flag, its timers, and any step still to come. */
function endSelahState(): void {
  selahToken += 1;
  phase = 'off';
  clearDeadline();
  endingSelah = true;
  try {
    useAudioStore.getState().setSelahActive(false);
  } finally {
    endingSelah = false;
  }
}

/** Ends playback the way Pause does, which ends Selah and pauses the bed. */
async function pauseEverything(): Promise<void> {
  if (transport) {
    await transport.pause();
    return;
  }
  endSelahState();
  restoreNarrationVolume();
}

async function onDeadline(reason: SelahDeadlineReason, token: number): Promise<void> {
  deadlineTimer = null;
  const store = useAudioStore.getState();
  if (token !== selahToken || !store.selahActive) return;
  if (reason === 'sleep-timer') {
    // The sleep timer ends everything, in Selah as out of it.
    if (!hasSleepTimerExpired(store.sleepTimerEndTime, Date.now())) {
      scheduleDeadline();
      return;
    }
    store.clearSleepTimer();
    await pauseEverything();
    return;
  }
  // Held long enough: whoever was listening has likely gone. Let the music fade away.
  backgroundMusicPlayer.fadeOut(SELAH_BED_FADE_OUT_MS);
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    if (token === selahToken && useAudioStore.getState().selahActive) void pauseEverything();
  }, SELAH_BED_FADE_OUT_MS);
}

/** Times the end of this Selah: the sleep timer running out, or the hold limit. */
function scheduleDeadline(): void {
  clearDeadline();
  const token = selahToken;
  const deadline = resolveSelahDeadline({
    heldSinceMs,
    sleepTimerEndTime: useAudioStore.getState().sleepTimerEndTime,
  });
  deadlineTimer = setTimeout(
    () => void onDeadline(deadline.reason, token),
    Math.max(0, deadline.atMs - Date.now())
  );
}

async function enterSelah(): Promise<void> {
  const store = useAudioStore.getState();
  const { currentTranslationId, currentBookId, currentChapter, status } = store;
  // Resuming may pick up at a verse start; have the timings ready by then.
  if (currentTranslationId && currentBookId && currentChapter) {
    void loadChapterVerseTimings(currentTranslationId, currentBookId, currentChapter);
  }
  selahToken += 1;
  const token = selahToken;
  heldSinceMs = Date.now();
  phase = status === 'paused' ? 'held' : 'fading-out';
  store.setSelahActive(true);
  scheduleDeadline();
  if (phase === 'held') return;

  const faded = await fadeNarration(0);
  if (!faded || token !== selahToken || !useAudioStore.getState().selahActive || !transport) {
    return;
  }
  // From here the pause is under way; leaving Selah resumes rather than fading back.
  phase = 'held';
  await transport.holdNarration();
}

async function leaveSelah(): Promise<void> {
  if (phase === 'resuming') return;
  if (phase === 'fading-out') {
    // The narration never paused: bring it back from wherever the fade got to.
    endSelahState();
    await fadeNarration(1);
    return;
  }
  if (transport) {
    await transport.resume();
    return;
  }
  endSelahState();
  restoreNarrationVolume();
}

/**
 * Selah on or off. On: fades the narration out and pauses it, the music playing on (a
 * paused chapter just starts the music). Off: resumes the narration, as Play does. Does
 * nothing while Selah is unavailable (no background sound, or no chapter).
 */
export async function toggleSelah(): Promise<void> {
  const state = useAudioStore.getState();
  if (state.selahActive) {
    await leaveSelah();
    return;
  }
  if (!transport || !canSelah(state)) return;
  await enterSelah();
}

// --- the player's side ----------------------------------------------------------------

export interface SelahResume {
  positionMs: number;
  ticket: number;
}

/**
 * Called by resumePlayback. With Selah holding the narration, returns where it picks up
 * (a little earlier, or its verse's start); null otherwise. Selah stays on until the
 * resume completes (completeSelahResume) or gives way (abandonSelahResume), so the bed
 * plays straight through. A second resume meanwhile picks up at the same place.
 */
export function takeSelahResume(): SelahResume | null {
  const state = useAudioStore.getState();
  if (!state.selahActive) return null;
  if (phase !== 'resuming') {
    const { currentTranslationId, currentBookId, currentChapter, currentPosition } = state;
    const timings =
      currentTranslationId && currentBookId && currentChapter
        ? peekChapterVerseTimings(currentTranslationId, currentBookId, currentChapter)
        : null;
    resumePositionMs = resolveSelahResumePositionMs(currentPosition, timings);
    selahToken += 1;
    phase = 'resuming';
    clearDeadline();
  }
  resumeTicket += 1;
  return { positionMs: resumePositionMs, ticket: resumeTicket };
}

/** Silences the narration before a Selah resume starts it, so it can fade in. */
export async function silenceNarrationForSelahResume(): Promise<void> {
  stopNarrationFade();
  await applyFadeLevel(0);
}

/** The narration plays again: Selah ends, and the narration fades back in if silenced. */
export function completeSelahResume({ ticket }: SelahResume, fadeIn: boolean): void {
  if (ticket !== resumeTicket) return;
  if (phase === 'resuming') endSelahState();
  if (fadeIn) void fadeNarration(1);
}

/**
 * A Selah resume that did not get the narration playing (a newer command took over, or
 * the sound had gone): Selah ends, and the narration is left at the Voice level. A newer
 * resume of the same Selah carries on instead.
 */
export function abandonSelahResume({ ticket }: SelahResume): void {
  if (ticket !== resumeTicket) return;
  if (phase === 'resuming' && useAudioStore.getState().selahActive) endSelahState();
  restoreNarrationVolumeUnlessFading();
}

/**
 * Called by a normal Pause as it starts: Selah ends (so the bed stops with the
 * narration) and a narration fade stops where it is. The pause restores the Voice level
 * once the narration is paused (restoreNarrationVolume).
 */
export function endSelahForPause(): void {
  if (useAudioStore.getState().selahActive) endSelahState();
  stopNarrationFade();
}

function followStore(): void {
  subscription ??= useAudioStore.subscribe((next, previous) => {
    if (previous.selahActive && !next.selahActive) {
      if (endingSelah) return;
      // The store ended it: a chapter was selected, or playback stopped or failed.
      selahToken += 1;
      phase = 'off';
      clearDeadline();
      restoreNarrationVolume();
      return;
    }
    if (!next.selahActive) return;
    if (next.backgroundMusicChoice === 'off' && previous.backgroundMusicChoice !== 'off') {
      // Nothing left to listen to in Selah: the reading carries on.
      void leaveSelah();
      return;
    }
    if (phase === 'held' && next.status === 'playing' && previous.status !== 'playing') {
      // The narration was started some other way: Selah is over.
      endSelahState();
      restoreNarrationVolume();
      return;
    }
    if (next.sleepTimerEndTime !== previous.sleepTimerEndTime) scheduleDeadline();
  });
}

/**
 * Points Selah at a mounted player's actions, replacing the previous player's. The store
 * subscription is created once, however many players mount, and outlives them.
 */
export function provideSelahTransport(next: SelahTransport): void {
  transport = next;
  followStore();
}

/** Forgets every in-memory Selah decision and timer (each test starts from nothing). */
export function resetSelahState(): void {
  stopNarrationFade();
  clearDeadline();
  selahToken += 1;
  resumeTicket += 1;
  phase = 'off';
  fadeLevel = 1;
  heldSinceMs = 0;
}
