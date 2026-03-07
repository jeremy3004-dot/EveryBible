// expo-av audio player wrapper for Bible audio playback
import { Audio, AVPlaybackStatus } from 'expo-av';
import type { PlaybackRate } from '../../types';

// Configure audio mode for background playback
export async function configureAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('Error configuring audio mode:', error);
  }
}

export interface AudioPlayerCallbacks {
  onStatusUpdate?: (status: AVPlaybackStatus) => void;
  onPlaybackFinished?: () => void;
  onError?: (error: string) => void;
}

class AudioPlayer {
  private sound: Audio.Sound | null = null;
  private callbacks: AudioPlayerCallbacks = {};
  private isConfigured = false;

  async configure(): Promise<void> {
    if (this.isConfigured) return;
    await configureAudioMode();
    this.isConfigured = true;
  }

  setCallbacks(callbacks: AudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  private handleStatusUpdate = (status: AVPlaybackStatus): void => {
    this.callbacks.onStatusUpdate?.(status);

    if (status.isLoaded && status.didJustFinish) {
      this.callbacks.onPlaybackFinished?.();
    }
  };

  async loadAndPlay(url: string, rate: PlaybackRate = 1.0): Promise<void> {
    await this.configure();

    // Unload any existing sound
    await this.stop();

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        {
          shouldPlay: true,
          rate,
          shouldCorrectPitch: true,
          progressUpdateIntervalMillis: 500,
        },
        this.handleStatusUpdate
      );

      this.sound = sound;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load audio';
      this.callbacks.onError?.(message);
      throw error;
    }
  }

  async play(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.playAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play audio';
      this.callbacks.onError?.(message);
    }
  }

  async pause(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.pauseAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause audio';
      this.callbacks.onError?.(message);
    }
  }

  async resume(): Promise<void> {
    await this.play();
  }

  async stop(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.stopAsync();
      await this.sound.unloadAsync();
      this.sound = null;
    } catch {
      // Sound may already be unloaded, ignore errors
      this.sound = null;
    }
  }

  async seekTo(positionMs: number): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.setPositionAsync(positionMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seek';
      this.callbacks.onError?.(message);
    }
  }

  async setRate(rate: PlaybackRate): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.setRateAsync(rate, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set playback rate';
      this.callbacks.onError?.(message);
    }
  }

  async getStatus(): Promise<AVPlaybackStatus | null> {
    if (!this.sound) return null;

    try {
      return await this.sound.getStatusAsync();
    } catch {
      return null;
    }
  }

  isLoaded(): boolean {
    return this.sound !== null;
  }
}

// Singleton instance for global audio playback
export const audioPlayer = new AudioPlayer();
