import test from 'node:test';
import { verifyPlansColdStartup } from './readingPlansStore.startupFixture';

test('default storage cold hydration preserves build 448 plans without an auth transition', async () => {
  await verifyPlansColdStartup('no-auth');
});
