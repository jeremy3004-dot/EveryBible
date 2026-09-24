/**
 * AudioPlayer singleton — thin facade over the track-player wrapper.
 *
 * Every consumer (useAudioPlayer, backgroundMusicPlayer) imports this module.
 * Internally it delegates to `./trackPlayer.ts` which currently uses expo-av
 * but can be swapped for the real react-native-track-player package when the
 * app ejects from Expo managed workflow.
 *
 * The public surface is intentionally narrow:
 *   configure / setCallbacks / loadAndPlay / play / pause / resume /
 *   stop / seekTo / setRate / getStatus / isLoaded
 *
 * configureAudioMode is re-exported so backgroundMusicPlayer can call it.
 */

import TrackPlayer, {
  Event,
  State,
  type PlaybackProgressEvent,
  type PlaybackStateEvent,
  type PlaybackErrorEvent,
  type Subscription,
} from './trackPlayer';
import type { PlaybackRate } from '../../types';

// ---------------------------------------------------------------------------
// Audio-mode configuration (re-exported for backgroundMusicPlayer)
// ---------------------------------------------------------------------------

/**
 * Configure the global audio session for background playback.
 * Delegates to TrackPlayer.setupPlayer which calls Audio.setAudioModeAsync.
 */
export async function configureAudioMode(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer();
  } catch (error) {
    console.error('Error configuring audio mode:', error);
  }
}

// ---------------------------------------------------------------------------
// Callback interface (unchanged from original)
// ---------------------------------------------------------------------------

/**
 * Snapshot that onStatusUpdate receives. It mirrors the subset of
 * AVPlaybackStatus that useAudioPlayer actually reads. Using our own type
 * decouples the hook from expo-av.
 */
export interface TrackPlayerProgressSnapshot {
  isLoaded: true;
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
  isBuffering: boolean;
  /** True only on the stopped snapshot reported as the track reaches its end. */
  didJustFinish: boolean;
  error?: string;
}

export interface AudioPlayerCallbacks {
  onStatusUpdate?: (status: TrackPlayerProgressSnapshot) => void;
  onPlaybackFinished?: () => void;
  onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// AudioPlayer class
// ---------------------------------------------------------------------------

class AudioPlayer {
  private callbacks: AudioPlayerCallbacks = {};
  private isConfigured = false;
  private subscriptions: Subscription[] = [];
  private loaded = false;
  private loadRequestId = 0;
  private pendingLoadRequestId: number | null = null;

  // Merged state — progress and playback-state arrive as separate events from
  // the track-player wrapper. We merge them here so onStatusUpdate always
  // delivers a complete snapshot to useAudioPlayer.
  private lastPositionMillis = 0;
  private lastDurationMillis = 0;
  private lastIsPlaying = false;
  private lastIsBuffering = false;

  async configure(): Promise<void> {
    if (this.isConfigured) return;
    await configureAudioMode();
    this.wireSubscriptions();
    this.isConfigured = true;
  }

  setCallbacks(callbacks: AudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  // -- event wiring --------------------------------------------------------

  private emitSnapshot(didJustFinish = false): void {
    this.callbacks.onStatusUpdate?.({
      isLoaded: true,
      positionMillis: this.lastPositionMillis,
      durationMillis: this.lastDurationMillis,
      isPlaying: this.lastIsPlaying,
      isBuffering: this.lastIsBuffering,
      didJustFinish,
    });
  }

  private wireSubscriptions(): void {
    // Clean up any previous subscriptions
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (data: PlaybackProgressEvent) => {
        this.lastPositionMillis = data.position * 1000;
        this.lastDurationMillis = data.duration * 1000;
        this.emitSnapshot();
      })
    );

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackState, (data: PlaybackStateEvent) => {
        // The wrapper has dropped a failed or released sound: nothing is left to
        // resume, so Play has to load the chapter again.
        if (data.state === State.Error) this.loaded = false;
        this.lastIsPlaying = data.state === State.Playing;
        // Until Play starts a chapter being loaded, its first status (paused) and
        // Ready are part of loading it, not a pause.
        const isStartingChapter =
          this.pendingLoadRequestId !== null &&
          (data.state === State.Paused || data.state === State.Ready);
        this.lastIsBuffering =
          data.state === State.Buffering || data.state === State.Loading || isStartingChapter;
        this.emitSnapshot(data.state === State.Ended);
      })
    );

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        this.callbacks.onPlaybackFinished?.();
      })
    );

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackError, (data: PlaybackErrorEvent) => {
        this.callbacks.onError?.(data.message);
      })
    );
  }

  // -- playback controls ---------------------------------------------------

  /** `startPositionMs` resumes the chapter at that offset instead of the top. */
  async loadAndPlay(url: string, rate: PlaybackRate = 1.0, startPositionMs = 0): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.pendingLoadRequestId = requestId;
    this.loaded = false;
    try {
      await this.configure();
      if (requestId !== this.loadRequestId) return;
      // Reset merged state for new track
      this.lastPositionMillis = startPositionMs;
      this.lastDurationMillis = 0;
      this.lastIsPlaying = false;
      this.lastIsBuffering = true;
      if (startPositionMs > 0) {
        await TrackPlayer.loadAndPlay(url, rate, startPositionMs / 1000);
      } else {
        await TrackPlayer.loadAndPlay(url, rate);
      }
      if (requestId === this.loadRequestId) this.loaded = true;
    } finally {
      if (this.pendingLoadRequestId === requestId) this.pendingLoadRequestId = null;
    }
  }

  async play(): Promise<void> {
    if (!this.loaded) return;
    try {
      await TrackPlayer.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play audio';
      this.callbacks.onError?.(message);
    }
  }

  async pause(): Promise<void> {
    if (!this.loaded && this.pendingLoadRequestId === null) return;
    this.loadRequestId += 1;
    this.pendingLoadRequestId = null;
    try {
      await TrackPlayer.pause();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause audio';
      this.callbacks.onError?.(message);
    }
  }

  async resume(): Promise<void> {
    await this.play();
  }

  async stop(): Promise<void> {
    this.loadRequestId += 1;
    this.pendingLoadRequestId = null;
    this.loaded = false;
    this.lastPositionMillis = 0;
    this.lastDurationMillis = 0;
    this.lastIsPlaying = false;
    this.lastIsBuffering = false;
    await TrackPlayer.stop();
  }

  async seekTo(positionMs: number): Promise<void> {
    if (!this.loaded) return;
    try {
      await TrackPlayer.seekTo(positionMs / 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      this.callbacks.onError?.(message);
    }
  }

  async setRate(rate: PlaybackRate): Promise<void> {
    // A chapter still loading takes the new speed too; the wrapper applies it once
    // the sound exists.
    if (!this.loaded && this.pendingLoadRequestId === null) return;
    try {
      await TrackPlayer.setRate(rate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set playback rate';
      this.callbacks.onError?.(message);
    }
  }

  /**
   * Checks that the loaded sound still exists natively. A released one is reported
   * through onError and leaves the player unloaded, so Play loads the chapter again.
   */
  async verifyLoaded(): Promise<void> {
    if (!this.loaded) return;
    await TrackPlayer.verifyActiveTrack();
  }

  async getStatus(): Promise<TrackPlayerProgressSnapshot | null> {
    if (!this.loaded) return null;

    try {
      const progress = await TrackPlayer.getProgress();
      const { state } = await TrackPlayer.getPlaybackState();

      return {
        isLoaded: true,
        positionMillis: progress.position * 1000,
        durationMillis: progress.duration * 1000,
        isPlaying: state === State.Playing,
        isBuffering: state === State.Buffering || state === State.Loading,
        didJustFinish: false,
      };
    } catch {
      return null;
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

// Singleton instance for global audio playback
export const audioPlayer = new AudioPlayer();
