import { Audio, type AVPlaybackStatus } from 'expo-av';
import type { BackgroundMusicChoice } from '../../types';
import { configureAudioMode } from './audioPlayer';
import { getBackgroundMusicOption, getBackgroundMusicSource } from './backgroundMusicCatalog';

const FADE_DURATION_MS = 2500;
const FADE_STEP_MS = 50;
/** How often expo-av reports the position, so the loop's end is seen in time. */
const PROGRESS_UPDATE_INTERVAL_MS = 250;
/**
 * Time allowed to load the replacement before its fade starts. The crossfade begins this
 * much before the fade itself would need to, so the outgoing copy reaches silence before
 * its file runs out instead of stopping mid-fade.
 */
const CROSSFADE_LOAD_MARGIN_MS = 750;
const MIN_FADE_OUT_MS = 250;

class BackgroundMusicPlayer {
  private sound: Audio.Sound | null = null;
  private currentChoice: Exclude<BackgroundMusicChoice, 'off'> | null = null;
  private isConfigured = false;
  private loadRequestId = 0;
  private targetVolume = 0.2;
  private fadeTimers = new Map<Audio.Sound, ReturnType<typeof setInterval>>();
  /** The last volume set on each sound, so a fade-out can start from where it is. */
  private volumes = new Map<Audio.Sound, number>();
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
    this.volumes.clear();

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

  private setVolume(sound: Audio.Sound, volume: number): void {
    this.volumes.set(sound, volume);
    sound.setVolumeAsync(volume).catch(() => {});
  }

  private fadeVolume(
    sound: Audio.Sound,
    from: number,
    to: number,
    onComplete?: () => void,
    durationMs: number = FADE_DURATION_MS
  ): void {
    this.clearFadeTimer(sound);

    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    const delta = (to - from) / steps;
    let currentStep = 0;
    let currentVolume = from;

    const timer = setInterval(() => {
      currentStep++;
      currentVolume = Math.min(1, Math.max(0, currentVolume + delta));

      if (currentStep >= steps) {
        this.clearFadeTimer(sound);
        currentVolume = to;
        this.setVolume(sound, currentVolume);
        onComplete?.();
        return;
      }

      this.setVolume(sound, currentVolume);
    }, FADE_STEP_MS);

    this.fadeTimers.set(sound, timer);
  }

  /** Fades a sound that is no longer the active loop to silence, then releases it. */
  private retireSound(sound: Audio.Sound, durationMs: number): void {
    sound.setOnPlaybackStatusUpdate(null);
    this.retiringSounds.add(sound);
    this.fadeVolume(
      sound,
      this.volumes.get(sound) ?? this.targetVolume,
      0,
      () => {
        this.retiringSounds.delete(sound);
        this.volumes.delete(sound);
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
      },
      durationMs
    );
  }

  private handlePlaybackStatus = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) {
      return;
    }

    // Approaching the end of the file: crossfade into a fresh copy from the top.
    const { durationMillis, positionMillis } = status;
    if (
      durationMillis != null &&
      durationMillis > 0 &&
      durationMillis - positionMillis <= FADE_DURATION_MS + CROSSFADE_LOAD_MARGIN_MS &&
      this.sound &&
      this.shouldBePlaying
    ) {
      void this.crossfadeRestart(durationMillis - positionMillis);
    }
  };

  private async crossfadeRestart(remainingMillis: number): Promise<void> {
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
        progressUpdateIntervalMillis: PROGRESS_UPDATE_INTERVAL_MS,
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

      // Fade out old, fade in new simultaneously so the loop boundary is masked. The
      // fade-out must reach silence before the old file ends (a late position update
      // leaves less time), or the loop would stop abruptly mid-fade.
      const fadeOutMs = Math.max(
        MIN_FADE_OUT_MS,
        Math.min(FADE_DURATION_MS, remainingMillis - CROSSFADE_LOAD_MARGIN_MS / 3)
      );
      this.retireSound(oldSound, fadeOutMs);

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
    requestId: number,
    crossfadeFromCurrent = false
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

    if (crossfadeFromCurrent && this.sound) {
      // Switching presets mid-listen: the old loop fades out under the new one's fade-in.
      const previous = this.sound;
      this.sound = null;
      this.retireSound(previous, FADE_DURATION_MS);
    } else {
      await this.unloadCurrentSound();
    }
    if (requestId !== this.loadRequestId) {
      return;
    }

    const { sound } = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      isLooping: false,
      volume: 0,
      progressUpdateIntervalMillis: PROGRESS_UPDATE_INTERVAL_MS,
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

    const wasAudible = this.shouldBePlaying && this.sound != null;
    this.shouldBePlaying = false;
    await this.ensureLoaded(choice, requestId, wasAudible);

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
