import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseFake, makeFakeSession } from './supabaseFake';

test('query builder records the chain and resolves the scripted per-table result', async () => {
  const fake = createSupabaseFake();
  fake.respondTo('profiles', (call) => ({
    data: { id: 'u1', columns: call.columns, steps: call.steps.map((step) => step.method) },
  }));

  const result = await fake.client
    .from('profiles')
    .select('id, display_name')
    .eq('id', 'u1')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  assert.equal(result.error, null);
  assert.deepEqual(result.data, {
    id: 'u1',
    columns: 'id, display_name',
    steps: ['select', 'eq', 'order', 'limit', 'maybeSingle'],
  });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].operation, 'select');
  assert.equal(fake.calls[0].maybeSingle, true);
  assert.deepEqual(fake.calls[0].steps[1], { method: 'eq', args: ['id', 'u1'] });
});

test('write operations capture payload and options; unscripted tables resolve empty', async () => {
  const fake = createSupabaseFake();

  const upsert = await fake.client
    .from('user_progress')
    .upsert({ user_id: 'u1', streak_days: 3 }, { onConflict: 'user_id' });
  const single = await fake.client.from('user_progress').select('*').single();
  const removed = await fake.client.from('groups').delete().eq('id', 'g1');

  assert.deepEqual(upsert, { data: [], error: null, count: null, status: 200, statusText: 'OK' });
  assert.equal(single.data, null, 'single() defaults to null data');
  assert.equal(removed.error, null);
  assert.equal(fake.calls[0].operation, 'upsert');
  assert.deepEqual(fake.calls[0].payload, { user_id: 'u1', streak_days: 3 });
  assert.deepEqual(fake.calls[0].options, { onConflict: 'user_id' });
  assert.equal(fake.calls[2].operation, 'delete');
  assert.deepEqual(fake.callsFor('groups').length, 1);
});

test('scripted errors flow back through the thenable', async () => {
  const fake = createSupabaseFake();
  fake.respondTo('groups', () => ({ data: null, error: { message: 'boom', code: '42501' } }));

  const { data, error } = await fake.client.from('groups').select('*');

  assert.equal(data, null);
  assert.deepEqual(error, { message: 'boom', code: '42501' });
});

test('rpc and edge functions are recorded and scriptable', async () => {
  const fake = createSupabaseFake();
  fake.respondToRpc('delete_current_user', () => ({ data: true }));
  fake.respondToFunction((name, options) => ({ data: { echoed: name, options } }));

  const rpc = await fake.client.rpc('delete_current_user', { reason: 'test' });
  const fn = await fake.client.functions.invoke('track-analytics-events', { body: { n: 1 } });

  assert.equal(rpc.data, true);
  assert.deepEqual(fake.callsFor('rpc:delete_current_user')[0].payload, { reason: 'test' });
  assert.deepEqual(fn.data, { echoed: 'track-analytics-events', options: { body: { n: 1 } } });
  assert.deepEqual(fake.functionCalls, [
    { name: 'track-analytics-events', options: { body: { n: 1 } } },
  ]);
});

test('auth reports the fake session, records calls, and notifies subscribers', async () => {
  const fake = createSupabaseFake();
  const events: string[] = [];
  const {
    data: { subscription },
  } = fake.client.auth.onAuthStateChange((event) => {
    events.push(event);
  });

  const signedOut = await fake.client.auth.getSession();
  assert.equal(signedOut.data.session, null);

  const session = makeFakeSession({ user: { id: 'u-42' } as never });
  fake.auth.setSession(session);
  fake.auth.emit('SIGNED_IN', session);

  const { data } = await fake.client.auth.getUser();
  assert.equal(data.user?.id, 'u-42');

  await fake.client.auth.signOut();
  assert.equal(fake.auth.session, null);
  assert.deepEqual(events, ['SIGNED_IN', 'SIGNED_OUT']);
  assert.deepEqual(
    fake.authCalls.map((call) => call.method),
    ['onAuthStateChange', 'getSession', 'getUser', 'signOut']
  );

  subscription.unsubscribe();
  assert.equal(fake.auth.listenerCount, 0);
});

test('auth handlers can be overridden per test', async () => {
  const fake = createSupabaseFake();
  fake.auth.handlers.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: { message: 'Invalid login credentials', code: 'invalid_credentials' } as never,
  });

  const result = await fake.client.auth.signInWithPassword({ email: 'a@b.c', password: 'x' });

  assert.equal(result.error?.message, 'Invalid login credentials');
});

test('storage buckets record calls and build public URLs', async () => {
  const fake = createSupabaseFake();

  const upload = await fake.client.storage
    .from('avatars')
    .upload('u1/avatar.jpg', new Uint8Array());
  const url = fake.client.storage.from('avatars').getPublicUrl('u1/avatar.jpg');

  assert.deepEqual(upload, { data: { path: 'u1/avatar.jpg' }, error: null });
  assert.equal(url.data.publicUrl, `${fake.storage.publicUrlBase}/avatars/u1/avatar.jpg`);
  assert.deepEqual(
    fake.storageCalls.map((call) => `${call.bucket}.${call.method}`),
    ['avatars.upload', 'avatars.getPublicUrl']
  );
});

test('reset clears recordings and responders but keeps auth state', async () => {
  const fake = createSupabaseFake();
  fake.auth.setSession(makeFakeSession());
  fake.respondTo('profiles', () => ({ data: [{ id: 1 }] }));
  await fake.client.from('profiles').select();

  fake.reset();

  assert.equal(fake.calls.length, 0);
  assert.notEqual(fake.auth.session, null);
  const { data } = await fake.client.from('profiles').select();
  assert.deepEqual(data, []);
});
