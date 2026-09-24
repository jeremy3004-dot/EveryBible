export interface OwnedLessonSound {
  playAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
}

export interface LessonSoundOwner<S extends OwnedLessonSound> {
  /** The sound the lesson screen controls (pause, seek, rate), once it has loaded. */
  getSound: () => S | null;
  /**
   * Starts the lesson audio, loading it with `create` first if nothing is owned or loading.
   * `create` must return the sound without starting it: it only plays once it is known to
   * still be wanted. Resolves false when the sound was released while it loaded; that
   * sound is unloaded and never plays. Rejects when the load fails, leaving nothing owned
   * so Play can try again.
   */
  play: (create: () => Promise<S>) => Promise<boolean>;
  /** Unloads the owned sound and disowns one still loading (source change, unmount). */
  release: () => void;
}

/**
 * One owner for the lesson screen's sound. Loading takes a network round trip, and the
 * screen can swap the audio source (the passage finishing its load changes which
 * translation's recording is used) or unmount during it. Without an owner, the sound
 * created after that landed in a ref nobody would clear again and played on, untracked;
 * two quick taps on Play could also create two sounds.
 */
export function createLessonSoundOwner<S extends OwnedLessonSound>(): LessonSoundOwner<S> {
  let sound: S | null = null;
  let loading: Promise<S | null> | null = null;
  let generation = 0;

  const load = (create: () => Promise<S>): Promise<S | null> => {
    const loadGeneration = generation;
    const attempt = create().then(async (created) => {
      if (loadGeneration !== generation) {
        await created.unloadAsync().catch(() => undefined);
        return null;
      }
      sound = created;
      await created.playAsync();
      return created;
    });
    loading = attempt;
    const clear = () => {
      if (loading === attempt) loading = null;
    };
    attempt.then(clear, clear);
    return attempt;
  };

  return {
    getSound() {
      return sound;
    },

    play: async (create) => {
      if (sound) {
        await sound.playAsync();
        return true;
      }
      return (await (loading ?? load(create))) !== null;
    },

    release: () => {
      generation += 1;
      loading = null;
      const released = sound;
      sound = null;
      void released?.unloadAsync().catch(() => undefined);
    },
  };
}
