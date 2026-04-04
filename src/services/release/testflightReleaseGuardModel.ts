export interface RemoteBuildVersionState {
  appVersionSource: string | null;
  autoIncrement: boolean | null;
  latestUploadedBuildNumber: number | null;
  easRemoteBuildNumber: number | null;
}

export interface LocalCredentialsPolicyState {
  expectedBundleId: string;
  credentialsSource: string | null;
  allowLocalCredentials: boolean;
  localCredentialsPresent: boolean;
  localProfileBundleId: string | null;
}

export interface ReleaseGuardCheckResult {
  ok: boolean;
  errors: string[];
}

export const parseBuildNumber = (value: string | number | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number.parseInt(trimmed, 10);
};

export const evaluateRemoteBuildVersionState = (
  state: RemoteBuildVersionState
): ReleaseGuardCheckResult => {
  const errors: string[] = [];

  if (state.appVersionSource !== 'remote') {
    errors.push('eas.json must keep cli.appVersionSource set to "remote" for iOS releases.');
  }

  if (state.autoIncrement !== true) {
    errors.push(
      'eas.json must keep build.production.autoIncrement set to true for iOS releases.'
    );
  }

  if (state.latestUploadedBuildNumber === null) {
    errors.push('Could not determine the latest uploaded iOS build number from App Store Connect.');
  }

  if (state.easRemoteBuildNumber === null) {
    errors.push('Could not determine the current remote iOS build number from EAS.');
  }

  if (state.latestUploadedBuildNumber === null || state.easRemoteBuildNumber === null) {
    return {
      ok: errors.length === 0,
      errors,
    };
  }

  const expectedPrebuildNumber = state.latestUploadedBuildNumber;

  if (state.easRemoteBuildNumber !== expectedPrebuildNumber) {
    errors.push(
      [
        `EAS remote iOS build number drift detected: expected pre-build value ${expectedPrebuildNumber} because App Store Connect's latest uploaded build is ${state.latestUploadedBuildNumber}, but EAS is set to ${state.easRemoteBuildNumber}.`,
        'EAS auto-increments during the build, so the remote pre-build value must match the latest uploaded App Store Connect build.',
        'Reset it before building with:',
        `eas build:version:set --platform ios --profile production`,
      ].join(' ')
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

export const evaluateLocalCredentialsPolicy = (
  state: LocalCredentialsPolicyState
): ReleaseGuardCheckResult => {
  const errors: string[] = [];
  const credentialsSource = state.credentialsSource ?? 'remote';

  if (credentialsSource === 'local' && !state.allowLocalCredentials) {
    errors.push(
      [
        'eas.json build.production.credentialsSource is set to "local", but this repo defaults to remote Expo-managed iOS credentials.',
        'Remove the local override before releasing, or rerun intentionally with TESTFLIGHT_ALLOW_LOCAL_CREDENTIALS=true.',
      ].join(' ')
    );
  }

  if (credentialsSource === 'local' && !state.localCredentialsPresent) {
    errors.push(
      'Local credentials mode is enabled, but credentials.json / credentials/ios assets are missing.'
    );
  }

  if (
    credentialsSource === 'local' &&
    state.localProfileBundleId !== null &&
    state.localProfileBundleId !== state.expectedBundleId
  ) {
    errors.push(
      `Local provisioning profile targets ${state.localProfileBundleId}, expected ${state.expectedBundleId}.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};
