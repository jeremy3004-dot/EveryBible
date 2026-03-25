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
 * AVPlaybackStatus is kept here temporarily for backward-compatibility with
 * consumers that reference it. New code should use the track-player event
 * types instead.
 */
export interface AudioPlayerCallbacks {
  onStatusUpdate?: (status: TrackPlayerProgressSnapshot) => void;
  onPlaybackFinished?: () => void;
  onError?: (error: string) => void;
}

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
  didJustFinish: false;
  error?: string;
}

// ---------------------------------------------------------------------------
// AudioPlayer class
// ---------------------------------------------------------------------------

class AudioPlayer {
  private callbacks: AudioPlayerCallbacks = {};
  private isConfigured = false;
  private subscriptions: Subscription[] = [];
  private loaded = false;

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

  private wireSubscriptions(): void {
    // Clean up any previous subscriptions
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (data: PlaybackProgressEvent) => {
        this.callbacks.onStatusUpdate?.({
          isLoaded: true,
          positionMillis: data.position * 1000,
          durationMillis: data.duration * 1000,
          isPlaying: false, // overridden by state listener below
          isBuffering: false,
          didJustFinish: false,
        });
      })
    );

    this.subscriptions.push(
      TrackPlayer.addEventListener(Event.PlaybackState, (data: PlaybackStateEvent) => {
        const isPlaying = data.state === State.Playing;
        const isBuffering =
          data.state === State.Buffering || data.state === State.Loading;

        this.callbacks.onStatusUpdate?.({
          isLoaded: true,
          positionMillis: 0, // Will be filled by progress events
          durationMillis: 0,
          isPlaying,
          isBuffering,
          didJustFinish: false,
        });
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

  async loadAndPlay(url: string, rate: PlaybackRate = 1.0): Promise<void> {
    await this.configure();
    await TrackPlayer.loadAndPlay(url, rate);
    this.loaded = true;
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
    if (!this.loaded) return;
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
    await TrackPlayer.stop();
    this.loaded = false;
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
    if (!this.loaded) return;
    try {
      await TrackPlayer.setRate(rate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set playback rate';
      this.callbacks.onError?.(message);
    }
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
