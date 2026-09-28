import test from 'node:test';
import { verifyPlansColdStartup } from './readingPlansStore.startupFixture';

test('cold ended-session reset cannot resurrect prior account plans after hydration', async () => {
  await verifyPlansColdStartup('signout');
});
