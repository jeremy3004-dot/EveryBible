import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './src/index';

test('worker returns only coarse IP geography and never exposes the address', async () => {
  const req = new Request('https://geo.example');
  Object.assign(req, { cf: { country: 'NP', latitude: '28.2096', longitude: '83.9856', city: 'Pokhara' } });
  const response = await worker.fetch(req);
  const data = await response.json();
  assert.equal(data.latitude, 28.2);
  assert.equal(data.longitude, 84);
  assert.equal('ip' in data, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('empty and out-of-range coordinates stay missing', async () => {
  const req = new Request('https://geo.example');
  Object.assign(req, { cf: { country: 'NP', latitude: '', longitude: '181' } });
  const data = await (await worker.fetch(req)).json();
  assert.equal(data.latitude, null);
  assert.equal(data.longitude, null);
});
