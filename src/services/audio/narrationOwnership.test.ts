import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { claimNarration, resetNarrationOwnership } from './narrationOwnership';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => resetNarrationOwnership());

test('a cross-player claim suspends the old owner immediately and awaits its drain', async () => {
  const bible = {};
  const gate = deferred();
  let paused = 0;
  const old = claimNarration('bible', bible, async () => {
    paused += 1;
    await gate.promise;
  });
  await old.ready;
  const lesson = claimNarration('lesson', {}, async () => {});
  assert.equal(paused, 1);
  assert.equal(old.isCurrent(), false);
  let ready = false;
  void lesson.ready.then(() => {
    ready = true;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  gate.resolve();
  await lesson.ready;
  assert.equal(lesson.isCurrent(), true);
});

test('same-owner Bible claims do not pause themselves and carry a prior cross-player drain', async () => {
  const bible = {};
  const gate = deferred();
  let pauses = 0;
  claimNarration('lesson', {}, () => gate.promise);
  const first = claimNarration('bible', bible, async () => {
    pauses += 1;
  });
  const second = claimNarration('bible', bible, async () => {
    pauses += 1;
  });
  assert.equal(first.isCurrent(), false);
  assert.equal(pauses, 0);
  let ready = false;
  void second.ready.then(() => {
    ready = true;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  gate.resolve();
  await second.ready;
  assert.equal(second.isCurrent(), true);
});

test('rapid Bible-lesson-Bible alternation waits for drains and leaves only the last claim current', async () => {
  const bible = {};
  const lessonOwner = {};
  const gate = deferred();
  const first = claimNarration('bible', bible, () => gate.promise);
  const lesson = claimNarration('lesson', lessonOwner, async () => {});
  const latest = claimNarration('bible', bible, async () => {});
  assert.equal(first.isCurrent(), false);
  assert.equal(lesson.isCurrent(), false);
  gate.resolve();
  await latest.ready;
  assert.equal(latest.isCurrent(), true);
});

test('failed opposing suspension blocks start but a new claim can retry it', async () => {
  let attempts = 0;
  claimNarration('bible', {}, async () => {
    if (++attempts === 1) throw new Error('pause failed');
  });
  const lessonOwner = {};
  const first = claimNarration('lesson', lessonOwner, async () => {});
  await assert.rejects(first.ready, /pause failed/);
  const retry = claimNarration('lesson', lessonOwner, async () => {});
  await retry.ready;
  assert.equal(attempts, 2);
  assert.equal(retry.isCurrent(), true);
});

test('cancelling a waiting claim leaves its drain intact and invalidates its ticket', async () => {
  const gate = deferred();
  claimNarration('bible', {}, () => gate.promise);
  const lesson = claimNarration('lesson', {}, async () => {});
  lesson.cancel();
  assert.equal(lesson.isCurrent(), false);
  const next = claimNarration('bible', {}, async () => {});
  gate.resolve();
  await next.ready;
  assert.equal(next.isCurrent(), true);
});
