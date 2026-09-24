import test from 'node:test';
import assert from 'node:assert/strict';

import { gatherFoundationRoute } from './learnRoutes';

test('opening a foundation from another tab keeps Gather home underneath it', () => {
  // Without `initial: false`, React Navigation makes FoundationDetail the Learn
  // stack's only route when the tab mounts on that navigation. Back then leaves
  // the tab, and Gather home is unreachable until the app restarts.
  assert.deepEqual(gatherFoundationRoute('foundation-3'), {
    screen: 'FoundationDetail',
    params: { foundationId: 'foundation-3' },
    initial: false,
  });
});
