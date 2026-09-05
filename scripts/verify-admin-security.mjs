// Explicit integration check: creates one disposable, confirmed auth account,
// exercises the public API, and deletes that account even when an assertion fails.
// Run: EB_SECURITY_TEST_ALLOW_CREATE_USER=true node --env-file=.env scripts/verify-admin-security.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

assert.equal(
  process.env.EB_SECURITY_TEST_ALLOW_CREATE_USER,
  'true',
  'Opt in to the disposable account check'
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && publicKey && serviceKey, 'Supabase URL, anon key, and service key are required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const client = createClient(url, publicKey, options);
const email = `security-check-${randomUUID()}@example.invalid`;
const password = randomUUID();
let userId;
const checks = [];

async function callAggregation(token) {
  // A new random UUID has no progress: authorized calls exercise the handler
  // without recalculating any real user's engagement summary.
  const response = await fetch(`${url}/functions/v1/aggregate-engagement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publicKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user_id: randomUUID() }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() };
}

try {
  const anonymousAuthorization = await client.rpc('authorize_engagement_refresh');
  assert.equal(anonymousAuthorization.error?.code, '42501', 'Anonymous RPC must be denied');
  const backendAuthorization = await service.rpc('authorize_engagement_refresh');
  assert.equal(backendAuthorization.error, null);
  assert.equal(backendAuthorization.data, true, 'Verified service role must be authorized');
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, 'Disposable signup must succeed');
  userId = created.data.user.id;
  checks.push('signup');
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, 'Disposable account sign-in must succeed');
  const userAuthorization = await client.rpc('authorize_engagement_refresh');
  assert.equal(userAuthorization.error?.code, '42501', 'Ordinary user RPC must be denied');
  checks.push('RPC role authorization');

  const normal = await client
    .from('profiles')
    .upsert({ id: userId, email, display_name: 'Security regression fixture', avatar_url: null });
  assert.equal(normal.error, null, 'Normal mobile profile sync must remain allowed');
  checks.push('normal profile upsert');

  const update = await client
    .from('profiles')
    .update({ admin_role: 'super_admin' })
    .eq('id', userId);
  assert.equal(update.error?.code, '42501', 'Self-promotion UPDATE must be denied');
  const upsert = await client.from('profiles').upsert({ id: userId, admin_role: 'super_admin' });
  assert.equal(upsert.error?.code, '42501', 'Self-promotion INSERT/upsert must be denied');
  const current = await client.from('profiles').select('admin_role').eq('id', userId).single();
  assert.equal(current.error, null);
  assert.equal(current.data.admin_role, null);
  checks.push('client role writes denied');

  const promote = await service
    .from('profiles')
    .update({ admin_role: 'super_admin' })
    .eq('id', userId);
  assert.equal(promote.error, null, 'Service role assignment must remain allowed');
  const promoted = await service.from('profiles').select('admin_role').eq('id', userId).single();
  assert.equal(promoted.data?.admin_role, 'super_admin');
  const demote = await service.from('profiles').update({ admin_role: null }).eq('id', userId);
  assert.equal(demote.error, null);
  checks.push('service role assignment');

  assert.equal((await callAggregation()).status, 401, 'Anonymous aggregation must be denied');
  assert.equal(
    (await callAggregation('eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.')).status,
    401,
    'Forged service-role claim must be denied'
  );
  assert.equal(
    (await callAggregation(signedIn.data.session.access_token)).status,
    401,
    'Ordinary user aggregation must be denied'
  );
  const allowed = await callAggregation(serviceKey);
  assert.equal(allowed.status, 200, 'Backend aggregation must remain allowed');
  assert.equal(allowed.body.total_users, 0);
  assert.equal(allowed.body.refreshed, 0);
  checks.push('aggregation anonymous/user denial and backend success');
  console.log(JSON.stringify({ passed: checks }));
} finally {
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    assert.equal(removed.error, null, 'Disposable account cleanup must succeed');
    const remaining = await service.from('profiles').select('id').eq('id', userId);
    assert.equal(remaining.error, null);
    assert.equal(remaining.data.length, 0, 'Fixture profile must be removed by cascade');
    console.log('Disposable account and profile removed.');
  }
}
