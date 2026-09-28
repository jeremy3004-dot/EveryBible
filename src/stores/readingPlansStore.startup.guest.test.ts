import test from 'node:test';
import { verifyPlansColdStartup } from './readingPlansStore.startupFixture';

test('cold first-account restore consumes guest tombstones without losing build 448 plans', async () => {
  await verifyPlansColdStartup('guest');
});
