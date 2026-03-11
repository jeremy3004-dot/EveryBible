export interface GroupRolloutModelInput {
  isSignedIn: boolean;
  localGroupCount: number;
  syncFeatureEnabled: boolean;
  backendConfigured: boolean;
}

export interface GroupRolloutModel {
  showGroupEntry: boolean;
  hasLocalGroups: boolean;
  syncStatusKey:
    | 'harvest.groupSyncPending'
    | 'harvest.groupSyncReady'
    | 'harvest.groupSyncSignin';
}

export function getGroupRolloutModel({
  isSignedIn,
  localGroupCount,
  syncFeatureEnabled,
  backendConfigured,
}: GroupRolloutModelInput): GroupRolloutModel {
  const syncStatusKey =
    !syncFeatureEnabled || !backendConfigured
      ? 'harvest.groupSyncPending'
      : isSignedIn
        ? 'harvest.groupSyncReady'
        : 'harvest.groupSyncSignin';

  return {
    showGroupEntry: true,
    hasLocalGroups: localGroupCount > 0,
    syncStatusKey,
  };
}
