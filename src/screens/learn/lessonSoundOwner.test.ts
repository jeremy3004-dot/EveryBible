import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonSoundOwner } from './lessonSoundOwner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class FakeSound {
  plays = 0;
  unloaded = false;
  constructor(readonly url: string) {}
  async playAsync() {
    this.plays += 1;
  }
  async unloadAsync() {
    this.unloaded = true;
  }
}

function createHarness() {
  const creations: Array<{ url: string; sound: ReturnType<typeof deferred<FakeSound>> }> = [];
  const owner = createLessonSoundOwner<FakeSound>();
  const loader = (url: string) => () => {
    const sound = deferred<FakeSound>();
    creations.push({ url, sound });
    return sound.promise;
  };
  const finishCreation = (index: number) => {
    const creation = creations[index]!;
    const sound = new FakeSound(creation.url);
    creation.sound.resolve(sound);
    return sound;
  };
  return { owner, creations, finishCreation, loader };
}

test('a sound created after the lesson audio was released is unloaded, never left playing', async () => {
  const h = createHarness();

  const play = h.owner.play(h.loader('https://audio.test/old.mp3'));
  // The passage finished loading and changed the audio source while the sound was loading.
  h.owner.release();
  const late = h.finishCreation(0);

  assert.equal(await play, false);
  assert.equal(late.plays, 0, 'a released sound must not start');
  assert.equal(late.unloaded, true);
  assert.equal(h.owner.getSound(), null);
});

test('a second Play while the sound is still loading shares it instead of creating another', async () => {
  const h = createHarness();

  const first = h.owner.play(h.loader('https://audio.test/a.mp3'));
  const second = h.owner.play(h.loader('https://audio.test/a.mp3'));
  const sound = h.finishCreation(0);

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.creations.length, 1);
  assert.equal(sound.plays, 1);
  assert.equal(h.owner.getSound(), sound);
});

test('an owned sound is started once loaded and resumed on the next Play', async () => {
  const h = createHarness();

  const first = h.owner.play(h.loader('https://audio.test/a.mp3'));
  const sound = h.finishCreation(0);
  assert.equal(await first, true);
  assert.equal(await h.owner.play(h.loader('https://audio.test/a.mp3')), true);

  assert.equal(h.creations.length, 1);
  assert.equal(sound.plays, 2);
});

test('releasing unloads the owned sound, and the next Play loads a fresh one', async () => {
  const h = createHarness();

  const first = h.owner.play(h.loader('https://audio.test/a.mp3'));
  const old = h.finishCreation(0);
  await first;
  h.owner.release();

  assert.equal(old.unloaded, true);
  assert.equal(h.owner.getSound(), null);

  const next = h.owner.play(h.loader('https://audio.test/b.mp3'));
  const fresh = h.finishCreation(1);
  assert.equal(await next, true);
  assert.equal(h.owner.getSound(), fresh);
  assert.equal(fresh.url, 'https://audio.test/b.mp3');
});

test('a failed load leaves nothing owned and lets Play try again', async () => {
  let attempts = 0;
  const owner = createLessonSoundOwner<FakeSound>();
  const create = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('network');
    return new FakeSound('https://audio.test/a.mp3');
  };

  await assert.rejects(owner.play(create), /network/);
  assert.equal(owner.getSound(), null);
  assert.equal(await owner.play(create), true);
  assert.equal(owner.getSound()?.plays, 1);
});
