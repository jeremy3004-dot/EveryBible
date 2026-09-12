import { Audio, type AVPlaybackStatus } from 'expo-av';
import type { BackgroundMusicChoice } from '../../types';
import { configureAudioMode } from './audioPlayer';
import { getBackgroundMusicOption, getBackgroundMusicSource } from './backgroundMusicCatalog';

const FADE_DURATION_MS = 2500;
const FADE_STEP_MS = 50;

class BackgroundMusicPlayer {
  private sound: Audio.Sound | null = null;
  private currentChoice: Exclude<BackgroundMusicChoice, 'off'> | null = null;
  private isConfigured = false;
  private loadRequestId = 0;
  private targetVolume = 0.2;
  private fadeTimers = new Map<Audio.Sound, ReturnType<typeof setInterval>>();
  private retiringSounds = new Set<Audio.Sound>();
  private shouldBePlaying = false;

  async configure(): Promise<void> {
    if (this.isConfigured) {
      return;
    }

    await configureAudioMode();
    this.isConfigured = true;
  }

  private clearFadeTimer(sound: Audio.Sound): void {
    const timer = this.fadeTimers.get(sound);
    if (timer != null) {
      clearInterval(timer);
      this.fadeTimers.delete(sound);
    }
  }

  private clearFadeTimers(): void {
    for (const timer of this.fadeTimers.values()) {
      clearInterval(timer);
    }
    this.fadeTimers.clear();
  }

  private async unloadCurrentSound(): Promise<void> {
    this.clearFadeTimers();

    const sounds = [...this.retiringSounds];
    if (this.sound) {
      sounds.push(this.sound);
    }

    if (sounds.length === 0) {
      return;
    }

    this.sound = null;
    this.retiringSounds.clear();

    for (const sound of sounds) {
      try {
        sound.setOnPlaybackStatusUpdate(null);
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // Ignore unload races for rapid preset switches.
      }
    }
  }

  private async unloadRetiringSounds(): Promise<void> {
    const sounds = [...this.retiringSounds];
    this.retiringSounds.clear();

    for (const sound of sounds) {
      try {
        this.clearFadeTimer(sound);
        sound.setOnPlaybackStatusUpdate(null);
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // Ignore cleanup races for rapid pause or preset switches.
      }
    }
  }

  private fadeVolume(sound: Audio.Sound, from: number, to: number, onComplete?: () => void): void {
    this.clearFadeTimer(sound);

    const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
    const delta = (to - from) / steps;
    let currentStep = 0;
    let currentVolume = from;

    const timer = setInterval(() => {
      currentStep++;
      currentVolume = Math.min(1, Math.max(0, currentVolume + delta));

      if (currentStep >= steps) {
        this.clearFadeTimer(sound);
        currentVolume = to;
        sound.setVolumeAsync(currentVolume).catch(() => {});
        onComplete?.();
        return;
      }

      sound.setVolumeAsync(currentVolume).catch(() => {});
    }, FADE_STEP_MS);

    this.fadeTimers.set(sound, timer);
  }

  private handlePlaybackStatus = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) {
      return;
    }

    // Detect when the track is approaching the end — begin crossfade
    const { durationMillis, positionMillis } = status;
    if (
      durationMillis != null &&
      durationMillis > 0 &&
      positionMillis >= durationMillis - FADE_DURATION_MS &&
      this.sound &&
      this.shouldBePlaying
    ) {
      this.crossfadeRestart();
    }
  };

  private async crossfadeRestart(): Promise<void> {
    const oldSound = this.sound;
    if (!oldSound || !this.currentChoice) {
      return;
    }

    // Prevent re-entrant crossfade
    oldSound.setOnPlaybackStatusUpdate(null);

    const source = getBackgroundMusicSource(this.currentChoice);
    if (!source) {
      return;
    }

    // Snapshot the request ID before the async gap so we can detect if
    // stop() or sync('off') was called while we were awaiting createAsync.
    const capturedRequestId = this.loadRequestId;

    try {
      // Create the next sound instance starting at volume 0
      const { sound: newSound } = await Audio.Sound.createAsync(source, {
        shouldPlay: true,
        isLooping: false,
        volume: 0,
        progressUpdateIntervalMillis: 1000,
      });

      // If stop() or sync('off') fired while we were loading, discard the new
      // sound immediately — do not assign it to this.sound.
      if (capturedRequestId !== this.loadRequestId) {
        newSound.setOnPlaybackStatusUpdate(null);
        newSound.stopAsync().catch(() => {});
        newSound.unloadAsync().catch(() => {});
        if (this.sound === oldSound) {
          oldSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
        }
        return;
      }

      // Fade out old, fade in new simultaneously so the loop boundary is masked.
      this.retiringSounds.add(oldSound);
      this.fadeVolume(oldSound, this.targetVolume, 0, () => {
        this.retiringSounds.delete(oldSound);
        oldSound.stopAsync().catch(() => {});
        oldSound.unloadAsync().catch(() => {});
      });

      this.sound = newSound;
      newSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
      this.fadeVolume(newSound, 0, this.targetVolume);
    } catch {
      if (capturedRequestId !== this.loadRequestId) {
        if (this.sound === oldSound) {
          oldSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
        }
        return;
      }
      // If crossfade fails, fall back to simple restart (only if still valid)
      if (capturedRequestId === this.loadRequestId) {
        try {
          await oldSound.setPositionAsync(0);
          oldSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
        } catch {
          // Ignore
        }
      }
    }
  }

  private async ensureLoaded(
    choice: Exclude<BackgroundMusicChoice, 'off'>,
    requestId: number
  ): Promise<void> {
    if (this.currentChoice === choice && this.sound) {
      return;
    }

    await this.configure();
    if (requestId !== this.loadRequestId) {
      return;
    }

    const source = getBackgroundMusicSource(choice);
    const option = getBackgroundMusicOption(choice);
    if (!source || !option) {
      return;
    }

    this.targetVolume = option.defaultVolume;

    await this.unloadCurrentSound();
    if (requestId !== this.loadRequestId) {
      return;
    }

    const { sound } = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      isLooping: false,
      volume: 0,
      progressUpdateIntervalMillis: 1000,
    });

    if (requestId !== this.loadRequestId) {
      await sound.unloadAsync();
      return;
    }

    sound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
    this.sound = sound;
    this.currentChoice = choice;
  }

  async sync(choice: BackgroundMusicChoice, shouldPlay: boolean): Promise<void> {
    if (
      choice !== 'off' &&
      shouldPlay &&
      this.shouldBePlaying &&
      this.currentChoice === choice &&
      this.sound
    ) {
      return;
    }

    // Capture the user's command before any async work, including configuration.
    // Pause must cancel pending loads and crossfades as well as playing sounds.
    const requestId = ++this.loadRequestId;
    if (choice === 'off') {
      this.shouldBePlaying = false;
      this.currentChoice = null;
      await this.unloadCurrentSound();
      return;
    }

    const option = getBackgroundMusicOption(choice);
    if (option) {
      this.targetVolume = option.defaultVolume;
    }

    if (!shouldPlay) {
      this.shouldBePlaying = false;

      if (!this.sound) {
        this.currentChoice = choice;
        return;
      }

      const choiceChanged = this.currentChoice !== choice;
      this.currentChoice = choice;

      if (choiceChanged) {
        await this.unloadCurrentSound();
        return;
      }

      try {
        const sound = this.sound;
        this.clearFadeTimers();
        await this.unloadRetiringSounds();
        if (requestId !== this.loadRequestId || this.sound !== sound) return;
        await sound.setVolumeAsync(0);
        if (requestId !== this.loadRequestId || this.sound !== sound) return;
        await sound.pauseAsync();
      } catch {
        // Ignore pause races; the next sync pass will reconcile.
      }
      return;
    }

    this.shouldBePlaying = false;
    await this.ensureLoaded(choice, requestId);

    if (requestId !== this.loadRequestId || !this.sound) {
      return;
    }

    this.shouldBePlaying = true;
    const sound = this.sound;

    try {
      await sound.playAsync();
      if (requestId === this.loadRequestId && this.sound === sound) {
        this.fadeVolume(sound, 0, this.targetVolume);
      }
    } catch {
      if (requestId === this.loadRequestId) {
        this.shouldBePlaying = false;
      }
      // Ignore play races; the next sync pass will reconcile.
    }
  }

  async stop(): Promise<void> {
    this.shouldBePlaying = false;
    this.currentChoice = null;
    this.loadRequestId += 1;
    await this.unloadCurrentSound();
  }
}

export const backgroundMusicPlayer = new BackgroundMusicPlayer();
