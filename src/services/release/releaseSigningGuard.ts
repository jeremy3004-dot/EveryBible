export interface ReleaseSigningState {
  currentSha: string;
  originMainSha: string;
  profileFingerprint: string;
  certFingerprint: string;
  appleDistributionFingerprints: string[];
}

export interface ReleaseSigningResult {
  ok: boolean;
  errors: string[];
}

export const normalizeSha1Fingerprint = (value: string): string =>
  value
    .trim()
    .replace(/^SHA1 Fingerprint=\s*/i, '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();

export const parseAppleDistributionFingerprints = (securityOutput: string): string[] => {
  const fingerprints = new Set<string>();

  for (const line of securityOutput.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\)\s+([0-9a-f]{40})\s+"Apple Distribution:/i);

    if (match) {
      fingerprints.add(normalizeSha1Fingerprint(match[1]));
    }
  }

  return [...fingerprints];
};

export const evaluateReleaseSigningState = (state: ReleaseSigningState): ReleaseSigningResult => {
  const errors: string[] = [];
  const currentSha = normalizeSha1Fingerprint(state.currentSha);
  const originMainSha = normalizeSha1Fingerprint(state.originMainSha);
  const profileFingerprint = normalizeSha1Fingerprint(state.profileFingerprint);
  const certFingerprint = normalizeSha1Fingerprint(state.certFingerprint);
  const appleDistributionFingerprints = state.appleDistributionFingerprints.map(
    normalizeSha1Fingerprint
  );

  if (currentSha !== originMainSha) {
    errors.push('HEAD does not match origin/main. Sync origin/main, rebuild, and rerun the guard.');
  }

  if (profileFingerprint !== certFingerprint) {
    errors.push(
      'Provisioning profile and distribution certificate fingerprints do not match.'
    );
  }

  if (appleDistributionFingerprints.length === 0) {
    errors.push('No Apple Distribution identities are visible in the current keychain search list.');
  } else {
    if (appleDistributionFingerprints.length > 1) {
      errors.push(
        'Multiple Apple Distribution identities are visible in the current keychain search list; use a temporary release keychain or remove stale identities.'
      );
    }

    if (!appleDistributionFingerprints.includes(certFingerprint)) {
      errors.push(
        'The matching Apple Distribution certificate is not visible in the current keychain search list.'
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};
