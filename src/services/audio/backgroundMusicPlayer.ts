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
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private shouldBePlaying = false;

  async configure(): Promise<void> {
    if (this.isConfigured) {
      return;
    }

    await configureAudioMode();
    this.isConfigured = true;
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer != null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private async unloadCurrentSound(): Promise<void> {
    this.clearFadeTimer();

    if (!this.sound) {
      return;
    }

    const sound = this.sound;
    this.sound = null;

    try {
      sound.setOnPlaybackStatusUpdate(null);
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      // Ignore unload races for rapid preset switches.
    }
  }

  private fadeVolume(
    sound: Audio.Sound,
    from: number,
    to: number,
    onComplete?: () => void
  ): void {
    this.clearFadeTimer();

    const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
    const delta = (to - from) / steps;
    let currentStep = 0;
    let currentVolume = from;

    this.fadeTimer = setInterval(() => {
      currentStep++;
      currentVolume = Math.min(1, Math.max(0, currentVolume + delta));

      if (currentStep >= steps) {
        this.clearFadeTimer();
        currentVolume = to;
        sound.setVolumeAsync(currentVolume).catch(() => {});
        onComplete?.();
        return;
      }

      sound.setVolumeAsync(currentVolume).catch(() => {});
    }, FADE_STEP_MS);
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

    try {
      // Create the next sound instance starting at volume 0
      const { sound: newSound } = await Audio.Sound.createAsync(source, {
        shouldPlay: true,
        isLooping: false,
        volume: 0,
        progressUpdateIntervalMillis: 500,
      });

      // Fade out old, fade in new simultaneously
      this.fadeVolume(oldSound, this.targetVolume, 0, () => {
        oldSound.stopAsync().catch(() => {});
        oldSound.unloadAsync().catch(() => {});
      });

      this.sound = newSound;
      newSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
      this.fadeVolume(newSound, 0, this.targetVolume);
    } catch {
      // If crossfade fails, fall back to simple restart
      try {
        await oldSound.setPositionAsync(0);
        oldSound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
      } catch {
        // Ignore
      }
    }
  }

  private async ensureLoaded(choice: Exclude<BackgroundMusicChoice, 'off'>): Promise<void> {
    if (this.currentChoice === choice && this.sound) {
      return;
    }

    await this.configure();

    const source = getBackgroundMusicSource(choice);
    const option = getBackgroundMusicOption(choice);
    if (!source || !option) {
      return;
    }

    const requestId = ++this.loadRequestId;
    this.targetVolume = option.defaultVolume;

    await this.unloadCurrentSound();

    const { sound } = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      isLooping: false,
      volume: 0,
      progressUpdateIntervalMillis: 500,
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
    if (choice === 'off') {
      this.shouldBePlaying = false;
      this.currentChoice = null;
      this.loadRequestId += 1;
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
        this.loadRequestId += 1;
        await this.unloadCurrentSound();
        return;
      }

      try {
        this.fadeVolume(this.sound, this.targetVolume, 0, () => {
          this.sound?.pauseAsync().catch(() => {});
        });
      } catch {
        // Ignore pause races; the next sync pass will reconcile.
      }
      return;
    }

    await this.ensureLoaded(choice);

    if (!this.sound) {
      return;
    }

    this.shouldBePlaying = true;

    try {
      await this.sound.playAsync();
      this.fadeVolume(this.sound, 0, this.targetVolume);
    } catch {
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
