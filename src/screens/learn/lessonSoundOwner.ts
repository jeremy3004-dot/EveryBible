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
   * `isCurrent` also guards native callbacks during loading and playback; release or a
   * newer load invalidates it.
   */
  play: (create: (isCurrent: () => boolean) => Promise<S>) => Promise<boolean>;
  /** Unloads the owned sound and disowns one still loading (source change, unmount). */
  release: () => Promise<void>;
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
  const plays = new Map<S, Set<Promise<unknown>>>();
  const retired = new Set<S>();
  const releases = new Map<S, Promise<void>>();

  const start = async (playing: S) => {
    const operation = playing.playAsync();
    const pending = plays.get(playing) ?? new Set<Promise<unknown>>();
    pending.add(operation);
    plays.set(playing, pending);
    const clear = () => {
      pending.delete(operation);
      if (pending.size === 0) plays.delete(playing);
    };
    void operation.then(clear, clear);
    await operation;
  };

  const releaseRetired = (): Promise<void> => {
    for (const released of retired) {
      if (releases.has(released)) continue;
      const pending = [...(plays.get(released) ?? [])];
      const release =
        pending.length > 0
          ? Promise.allSettled(pending)
              .then(() => released.unloadAsync())
              .then(() => undefined)
          : released.unloadAsync().then(() => undefined);
      releases.set(released, release);
      void release.then(
        () => {
          retired.delete(released);
          releases.delete(released);
        },
        () => releases.delete(released)
      );
    }
    const release = Promise.all([...releases.values()]).then(() => undefined);
    void release.catch(() => undefined);
    return release;
  };

  const load = (create: (isCurrent: () => boolean) => Promise<S>): Promise<S | null> => {
    const loadGeneration = ++generation;
    // Native callbacks can arrive before creation returns, or after release.
    const attempt = create(() => loadGeneration === generation).then(async (created) => {
      if (loadGeneration !== generation) {
        retired.add(created);
        await releaseRetired().catch(() => undefined);
        return null;
      }
      sound = created;
      await start(created);
      return loadGeneration === generation && sound === created ? created : null;
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
      // A failed unload leaves a retired native sound that may still be audible.
      // Retry its release before a fresh lesson recording can be created.
      if (retired.size > 0) await releaseRetired();
      if (sound) {
        const playing = sound;
        const playGeneration = generation;
        await start(playing);
        return playGeneration === generation && sound === playing;
      }
      return (await (loading ?? load(create))) !== null;
    },

    release: () => {
      generation += 1;
      loading = null;
      const released = sound;
      sound = null;
      if (released) retired.add(released);
      return releaseRetired();
    },
  };
}
