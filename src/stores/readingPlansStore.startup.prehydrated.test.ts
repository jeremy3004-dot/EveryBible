import test from 'node:test';
import { verifyPlansColdStartup } from './readingPlansStore.startupFixture';

test('a first-account restore preserves plans already hydrated before the auth boundary', async () => {
  await verifyPlansColdStartup('prehydrated');
});
