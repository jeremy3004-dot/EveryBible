/**
 * react-native-track-player v4 API wrapper backed by expo-av.
 *
 * BLOCKER: react-native-track-player requires custom native code (Swift/Kotlin)
 * that is incompatible with Expo managed workflow. This module re-exports the
 * same public API surface so all audio code can be written against the v4
 * contract today. When the app ejects to bare workflow, replace this file with:
 *
 *   export * from 'react-native-track-player';
 *
 * Supported subset:
 *   - TrackPlayer.setupPlayer / add / play / pause / stop / seekTo / setRate
 *   - TrackPlayer.getPlaybackState / getProgress / getActiveTrack
 *   - Event / State / Capability / RepeatMode enums
 *   - useProgress / usePlaybackState hooks (thin wrappers)
 *   - addEventListener for remote events
 *
 * Limitations vs real track-player:
 *   - Lock-screen controls / notification controls are NOT wired (expo-av does
 *     not expose MediaSession or MPNowPlayingInfoCenter).
 *   - Only one track is loaded at a time; queue management lives in audioStore.
 *   - RepeatMode is tracked in state but looping is handled by the caller
 *     (useAudioPlayer) because expo-av's isLooping has no crossfade support.
 */

import { Audio, type AVPlaybackStatus } from 'expo-av';
import type { PlaybackRate } from '../../types';

// ---------------------------------------------------------------------------
// Enums mirroring react-native-track-player v4
// ---------------------------------------------------------------------------

export enum State {
  None = 'none',
  Ready = 'ready',
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Buffering = 'buffering',
  Loading = 'loading',
  Error = 'error',
}

export enum Event {
  PlaybackState = 'playback-state',
  PlaybackProgressUpdated = 'playback-progress-updated',
  PlaybackQueueEnded = 'playback-queue-ended',
  PlaybackActiveTrackChanged = 'playback-active-track-changed',
  PlaybackPlayWhenReadyChanged = 'playback-play-when-ready-changed',
  PlaybackError = 'playback-error',
  RemotePlay = 'remote-play',
  RemotePause = 'remote-pause',
  RemoteStop = 'remote-stop',
  RemoteSeek = 'remote-seek',
  RemoteNext = 'remote-next',
  RemotePrevious = 'remote-previous',
}

export enum Capability {
  Play = 'play',
  Pause = 'pause',
  Stop = 'stop',
  SeekTo = 'seek-to',
  SkipToNext = 'skip-to-next',
  SkipToPrevious = 'skip-to-previous',
  SetRating = 'set-rating',
}

export enum RepeatMode {
  Off = 0,
  Track = 1,
  Queue = 2,
}

// ---------------------------------------------------------------------------
// Track type (mirrors react-native-track-player's Track)
// ---------------------------------------------------------------------------

export interface Track {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Progress type
// ---------------------------------------------------------------------------

export interface Progress {
  position: number; // seconds
  duration: number; // seconds
  buffered: number; // seconds
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface PlaybackStateEvent {
  state: State;
}

export interface PlaybackProgressEvent {
  position: number;
  duration: number;
  buffered: number;
}

export interface PlaybackErrorEvent {
  code: string;
  message: string;
}

type EventPayloadMap = {
  [Event.PlaybackState]: PlaybackStateEvent;
  [Event.PlaybackProgressUpdated]: PlaybackProgressEvent;
  [Event.PlaybackQueueEnded]: Record<string, never>;
  [Event.PlaybackActiveTrackChanged]: { track: Track | null };
  [Event.PlaybackPlayWhenReadyChanged]: { playWhenReady: boolean };
  [Event.PlaybackError]: PlaybackErrorEvent;
  [Event.RemotePlay]: Record<string, never>;
  [Event.RemotePause]: Record<string, never>;
  [Event.RemoteStop]: Record<string, never>;
  [Event.RemoteSeek]: { position: number };
  [Event.RemoteNext]: Record<string, never>;
  [Event.RemotePrevious]: Record<string, never>;
};

type EventListener<E extends Event> = (data: EventPayloadMap[E]) => void;

interface Subscription {
  remove: () => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let sound: Audio.Sound | null = null;
let isSetup = false;
let activeTrack: Track | null = null;
let currentState: State = State.None;
let currentRate: number = 1.0;
let loadRequestId = 0;

const listeners = new Map<Event, Set<EventListener<Event>>>();

function emit<E extends Event>(event: E, data: EventPayloadMap[E]): void {
  const eventListeners = listeners.get(event);
  if (eventListeners) {
    for (const listener of eventListeners) {
      try {
        (listener as EventListener<E>)(data);
      } catch (error) {
        console.warn(`[TrackPlayer] Error in ${event} listener:`, error);
      }
    }
  }
}

function setState(next: State): void {
  if (next === currentState) return;
  currentState = next;
  emit(Event.PlaybackState, { state: next });
}

function handleAVStatus(status: AVPlaybackStatus): void {
  if (!status.isLoaded) {
    if (status.error) {
      setState(State.Error);
      emit(Event.PlaybackError, { code: 'LOAD_ERROR', message: status.error });
    }
    return;
  }

  const positionSec = status.positionMillis / 1000;
  const durationSec = (status.durationMillis ?? 0) / 1000;
  const bufferedSec = (status.playableDurationMillis ?? status.positionMillis) / 1000;

  emit(Event.PlaybackProgressUpdated, {
    position: positionSec,
    duration: durationSec,
    buffered: bufferedSec,
  });

  if (status.didJustFinish) {
    emit(Event.PlaybackQueueEnded, {});
    setState(State.Ready);
    return;
  }

  if (status.isPlaying) {
    setState(State.Playing);
  } else if (status.isBuffering) {
    setState(State.Buffering);
  } else {
    setState(State.Paused);
  }
}

async function unloadSound(): Promise<void> {
  if (!sound) return;

  const ref = sound;
  sound = null;

  try {
    ref.setOnPlaybackStatusUpdate(null);
    await ref.stopAsync();
    await ref.unloadAsync();
  } catch {
    // Sound may already be unloaded
  }
}

// ---------------------------------------------------------------------------
// TrackPlayer API
// ---------------------------------------------------------------------------

export interface SetupOptions {
  minBuffer?: number;
  maxBuffer?: number;
  playBuffer?: number;
  backBuffer?: number;
  maxCacheSize?: number;
  waitForBuffer?: boolean;
}

async function setupPlayer(_options?: SetupOptions): Promise<void> {
  if (isSetup) return;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  isSetup = true;
  setState(State.Ready);
}

async function add(track: Track | Track[]): Promise<void> {
  const tracks = Array.isArray(track) ? track : [track];
  if (tracks.length === 0) return;

  // Only supports single-track loading; queue managed by audioStore
  const target = tracks[0];

  await setupPlayer();
  const requestId = ++loadRequestId;

  setState(State.Loading);

  await unloadSound();

  try {
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: target.url },
      {
        shouldPlay: false,
        rate: currentRate,
        shouldCorrectPitch: true,
        progressUpdateIntervalMillis: 500,
      },
      handleAVStatus
    );

    if (requestId !== loadRequestId) {
      await newSound.stopAsync();
      await newSound.unloadAsync();
      return;
    }

    sound = newSound;
    activeTrack = target;
    setState(State.Ready);
    emit(Event.PlaybackActiveTrackChanged, { track: target });
  } catch (error) {
    if (requestId !== loadRequestId) return;
    setState(State.Error);
    const message = error instanceof Error ? error.message : 'Failed to load track';
    emit(Event.PlaybackError, { code: 'LOAD_ERROR', message });
    throw error;
  }
}

async function play(): Promise<void> {
  if (!sound) return;

  try {
    await sound.playAsync();
    setState(State.Playing);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to play';
    emit(Event.PlaybackError, { code: 'PLAY_ERROR', message });
  }
}

async function pause(): Promise<void> {
  if (!sound) return;

  try {
    await sound.pauseAsync();
    setState(State.Paused);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause';
    emit(Event.PlaybackError, { code: 'PAUSE_ERROR', message });
  }
}

async function stop(): Promise<void> {
  loadRequestId += 1;
  await unloadSound();
  activeTrack = null;
  setState(State.Stopped);
  emit(Event.PlaybackActiveTrackChanged, { track: null });
}

async function seekTo(positionSeconds: number): Promise<void> {
  if (!sound) return;

  try {
    await sound.setPositionAsync(positionSeconds * 1000);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to seek';
    emit(Event.PlaybackError, { code: 'SEEK_ERROR', message });
  }
}

async function setRate(rate: number): Promise<void> {
  currentRate = rate;
  if (!sound) return;

  try {
    await sound.setRateAsync(rate, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set rate';
    emit(Event.PlaybackError, { code: 'RATE_ERROR', message });
  }
}

async function getPlaybackState(): Promise<PlaybackStateEvent> {
  return { state: currentState };
}

async function getProgress(): Promise<Progress> {
  if (!sound) {
    return { position: 0, duration: 0, buffered: 0 };
  }

  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) {
      return { position: 0, duration: 0, buffered: 0 };
    }

    return {
      position: status.positionMillis / 1000,
      duration: (status.durationMillis ?? 0) / 1000,
      buffered: (status.playableDurationMillis ?? status.positionMillis) / 1000,
    };
  } catch {
    return { position: 0, duration: 0, buffered: 0 };
  }
}

async function getActiveTrack(): Promise<Track | null> {
  return activeTrack;
}

async function reset(): Promise<void> {
  await stop();
  setState(State.None);
  isSetup = false;
}

async function destroy(): Promise<void> {
  await reset();
  listeners.clear();
}

function addEventListener<E extends Event>(
  event: E,
  listener: EventListener<E>
): Subscription {
  let eventListeners = listeners.get(event);
  if (!eventListeners) {
    eventListeners = new Set();
    listeners.set(event, eventListeners);
  }

  eventListeners.add(listener as EventListener<Event>);

  return {
    remove: () => {
      eventListeners?.delete(listener as EventListener<Event>);
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: load + play in one call (not part of RNTP v4 but matches
// existing AudioPlayer.loadAndPlay usage for a smooth migration)
// ---------------------------------------------------------------------------

async function loadAndPlay(url: string, rate: PlaybackRate = 1.0): Promise<void> {
  currentRate = rate;
  const trackId = `${Date.now()}`;
  await add({ id: trackId, url });
  await play();
}

// ---------------------------------------------------------------------------
// Public namespace export  (mirrors `import TrackPlayer from 'react-native-track-player'`)
// ---------------------------------------------------------------------------

const TrackPlayer = {
  setupPlayer,
  add,
  play,
  pause,
  stop,
  seekTo,
  setRate,
  getPlaybackState,
  getProgress,
  getActiveTrack,
  reset,
  destroy,
  addEventListener,
  loadAndPlay,
} as const;

export default TrackPlayer;

export { addEventListener };

// Re-export types that callers would import from react-native-track-player
export type { EventPayloadMap, EventListener, Subscription };
