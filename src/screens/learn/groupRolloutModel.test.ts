import test from 'node:test';
import assert from 'node:assert/strict';
import { getGroupRolloutModel } from './groupRolloutModel';

test('keeps the study-group entry visible while signed-out rollout messaging stays accurate', () => {
  assert.deepEqual(
    getGroupRolloutModel({
      isSignedIn: false,
      localGroupCount: 0,
      syncFeatureEnabled: true,
      backendConfigured: true,
    }),
    {
      showGroupEntry: true,
      hasLocalGroups: false,
      syncStatusKey: 'harvest.groupSyncSignin',
    }
  );
});

test('uses pending rollout messaging when synced groups are disabled for the build', () => {
  assert.deepEqual(
    getGroupRolloutModel({
      isSignedIn: true,
      localGroupCount: 1,
      syncFeatureEnabled: false,
      backendConfigured: true,
    }),
    {
      showGroupEntry: true,
      hasLocalGroups: true,
      syncStatusKey: 'harvest.groupSyncPending',
    }
  );
});

test('preserves access to local groups even when rollout has existing local data', () => {
  assert.deepEqual(
    getGroupRolloutModel({
      isSignedIn: true,
      localGroupCount: 2,
      syncFeatureEnabled: true,
      backendConfigured: true,
    }),
    {
      showGroupEntry: true,
      hasLocalGroups: true,
      syncStatusKey: 'harvest.groupSyncReady',
    }
  );
});
