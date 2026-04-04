import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  evaluateReleaseSigningState,
  normalizeSha1Fingerprint,
  parseAppleDistributionFingerprints,
} from '../src/services/release/releaseSigningGuard';
import {
  evaluateLocalCredentialsPolicy,
  evaluateRemoteBuildVersionState,
  parseBuildNumber,
} from '../src/services/release/testflightReleaseGuardModel';

interface CredentialsJson {
  ios?: {
    distributionCertificate?: {
      password?: string;
    };
  };
}

interface AppConfig {
  expo?: {
    ios?: {
      bundleIdentifier?: string;
    };
  };
}

interface EasConfig {
  cli?: {
    appVersionSource?: string;
  };
  build?: {
    production?: {
      autoIncrement?: boolean;
      credentialsSource?: string;
    };
  };
  submit?: {
    production?: {
      ios?: {
        ascAppId?: string;
      };
    };
  };
}

interface CliOptions {
  credentialsJsonPath: string;
  credentialsDir: string;
}

const usage = (exitCode = 1): never => {
  console.error(
    [
      'Usage: tsx scripts/testflight_release_guard.ts [--credentials-json credentials.json] [--credentials-dir credentials/ios]',
      '',
      'Checks:',
      '  - EAS remote build number matches App Store Connect latest + 1',
      '  - the repo stays on remote Expo-managed iOS credentials by default',
      '  - if manual local credentials are explicitly enabled, the profile/cert/keychain state matches the app bundle id',
      '  - logs whether HEAD matches origin/main for release traceability (warn only)',
    ].join('\n')
  );

  process.exit(exitCode);
};

const readArgValue = (args: string[], index: number): string => {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    usage();
  }

  return value;
};

const parseArgs = (argv: string[]): CliOptions => {
  let credentialsJsonPath = 'credentials.json';
  let credentialsDir = path.join('credentials', 'ios');

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--credentials-json':
        credentialsJsonPath = readArgValue(argv, i);
        i += 1;
        break;
      case '--credentials-dir':
        credentialsDir = readArgValue(argv, i);
        i += 1;
        break;
      case '--help':
      case '-h':
        usage(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }

  return {
    credentialsJsonPath,
    credentialsDir,
  };
};

const requireFile = (filePath: string): void => {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
};

const readJson = <T>(filePath: string): T =>
  JSON.parse(readFileSync(filePath, 'utf8')) as T;

const runCommand = (
  command: string,
  args: string[],
  options?: { cwd?: string; input?: string | Buffer }
): string =>
  execFileSync(command, args, {
    cwd: options?.cwd,
    input: options?.input,
    encoding: 'utf8',
  }).toString();

const extractPlistValue = (plistXml: string, key: string): string => {
  const match = plistXml.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`, 'm')
  );

  if (!match) {
    throw new Error(`Missing ${key} in provisioning profile`);
  }

  return match[1].trim();
};

const extractBundleIdFromApplicationIdentifier = (applicationIdentifier: string): string => {
  const parts = applicationIdentifier.trim().split('.');

  if (parts.length < 2) {
    throw new Error(`Unexpected application-identifier value: ${applicationIdentifier}`);
  }

  return parts.slice(1).join('.');
};

const extractFirstDeveloperCertificateBase64 = (plistXml: string): string => {
  const match = plistXml.match(
    /<key>DeveloperCertificates<\/key>\s*<array>\s*<data>([\s\S]*?)<\/data>/m
  );

  if (!match) {
    throw new Error('Missing DeveloperCertificates entry in provisioning profile');
  }

  return match[1].replace(/\s+/g, '');
};

const fingerprintFromDer = (derBytes: Buffer): string => {
  const output = runCommand('openssl', ['x509', '-inform', 'der', '-noout', '-fingerprint', '-sha1'], {
    input: derBytes,
  });
  return normalizeSha1Fingerprint(output);
};

const fingerprintFromPem = (pem: string): string => {
  const output = runCommand('openssl', ['x509', '-inform', 'pem', '-noout', '-fingerprint', '-sha1'], {
    input: pem,
  });
  return normalizeSha1Fingerprint(output);
};

const readLatestUploadedBuildNumber = (repoRoot: string, appId: string): number => {
  const output = runCommand(
    'asc',
    ['builds', 'list', '--app', appId, '--sort', '-uploadedDate', '--limit', '1', '--output', 'json'],
    { cwd: repoRoot }
  );
  const payload = JSON.parse(output) as {
    data?: Array<{ attributes?: { version?: string | number } }>;
  };
  const latestVersion = payload.data?.[0]?.attributes?.version;
  const parsed = parseBuildNumber(latestVersion ?? null);

  if (parsed === null) {
    throw new Error('Could not parse the latest uploaded iOS build number from App Store Connect.');
  }

  return parsed;
};

const readRemoteEasBuildNumber = (repoRoot: string): number => {
  const output = runCommand(
    'eas',
    ['build:version:get', '--platform', 'ios', '--profile', 'production', '--json', '--non-interactive'],
    { cwd: repoRoot }
  );
  const jsonMatch = output.match(/\{[\s\S]*\}\s*$/);

  if (!jsonMatch) {
    throw new Error('Could not parse EAS remote build number output.');
  }

  const payload = JSON.parse(jsonMatch[0]) as { buildNumber?: string | number };
  const parsed = parseBuildNumber(payload.buildNumber ?? null);

  if (parsed === null) {
    throw new Error('Could not determine the EAS remote iOS build number.');
  }

  return parsed;
};

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = runCommand('git', ['rev-parse', '--show-toplevel']).trim();
  const credentialsJsonPath = path.resolve(repoRoot, options.credentialsJsonPath);
  const credentialsDir = path.resolve(repoRoot, options.credentialsDir);
  const profilePath = path.join(credentialsDir, 'profile.mobileprovision');
  const certPath = path.join(credentialsDir, 'dist-cert.p12');
  const appConfig = readJson<AppConfig>(path.join(repoRoot, 'app.json'));
  const easConfig = readJson<EasConfig>(path.join(repoRoot, 'eas.json'));
  const expectedBundleId = appConfig.expo?.ios?.bundleIdentifier?.trim();
  const appStoreConnectAppId = easConfig.submit?.production?.ios?.ascAppId?.trim();
  const credentialsSource = easConfig.build?.production?.credentialsSource?.trim() ?? 'remote';
  const allowLocalCredentials = process.env.TESTFLIGHT_ALLOW_LOCAL_CREDENTIALS === 'true';

  runCommand('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: repoRoot });

  const currentSha = runCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  const originMainSha = runCommand('git', ['rev-parse', 'origin/main'], { cwd: repoRoot }).trim();

  if (!expectedBundleId) {
    throw new Error('Missing expo.ios.bundleIdentifier in app.json');
  }

  if (!appStoreConnectAppId) {
    throw new Error('Missing submit.production.ios.ascAppId in eas.json');
  }

  const latestUploadedBuildNumber = readLatestUploadedBuildNumber(repoRoot, appStoreConnectAppId);
  const easRemoteBuildNumber = readRemoteEasBuildNumber(repoRoot);
  const remoteBuildVersionResult = evaluateRemoteBuildVersionState({
    appVersionSource: easConfig.cli?.appVersionSource ?? null,
    autoIncrement: easConfig.build?.production?.autoIncrement ?? null,
    latestUploadedBuildNumber,
    easRemoteBuildNumber,
  });

  let profileName = 'not_checked';
  let profileBundleId = 'not_checked';
  let certFingerprint = 'not_checked';
  let profileCertificateFingerprint = 'not_checked';
  let appleDistributionFingerprints: string[] = [];

  if (credentialsSource === 'local') {
    requireFile(credentialsJsonPath);
    requireFile(profilePath);
    requireFile(certPath);

    const credentials = readJson<CredentialsJson>(credentialsJsonPath);
    const password = credentials.ios?.distributionCertificate?.password?.trim();

    if (!password) {
      throw new Error(
        `Missing ios.distributionCertificate.password in ${credentialsJsonPath}`
      );
    }

    const profileXml = runCommand('security', ['cms', '-D', '-i', profilePath], { cwd: repoRoot });
    profileName = extractPlistValue(profileXml, 'Name');
    profileBundleId = extractBundleIdFromApplicationIdentifier(
      extractPlistValue(profileXml, 'application-identifier')
    );
    profileCertificateFingerprint = fingerprintFromDer(
      Buffer.from(extractFirstDeveloperCertificateBase64(profileXml), 'base64')
    );

    const certPem = runCommand(
      'openssl',
      ['pkcs12', '-in', certPath, '-nokeys', '-clcerts', '-passin', `pass:${password}`],
      { cwd: repoRoot }
    );
    certFingerprint = fingerprintFromPem(certPem);

    const keychainOutput = runCommand('security', ['find-identity', '-v', '-p', 'codesigning'], {
      cwd: repoRoot,
    });
    appleDistributionFingerprints = parseAppleDistributionFingerprints(keychainOutput);
  }

  const localCredentialsPolicyResult = evaluateLocalCredentialsPolicy({
    expectedBundleId,
    credentialsSource,
    allowLocalCredentials,
    localCredentialsPresent:
      existsSync(credentialsJsonPath) && existsSync(profilePath) && existsSync(certPath),
    localProfileBundleId: profileBundleId === 'not_checked' ? null : profileBundleId,
  });

  const signingResult =
    credentialsSource === 'local'
      ? evaluateReleaseSigningState({
          profileFingerprint: profileCertificateFingerprint,
          certFingerprint,
          appleDistributionFingerprints,
        })
      : { ok: true, errors: [] };

  const result = {
    ok:
      remoteBuildVersionResult.ok &&
      localCredentialsPolicyResult.ok &&
      signingResult.ok,
    errors: [
      ...remoteBuildVersionResult.errors,
      ...localCredentialsPolicyResult.errors,
      ...signingResult.errors,
    ],
  };

  console.log(`repo_root=${repoRoot}`);
  console.log(`expected_bundle_id=${expectedBundleId}`);
  console.log(`credentials_source=${credentialsSource}`);
  console.log(`latest_uploaded_build_number=${latestUploadedBuildNumber}`);
  console.log(`eas_remote_build_number=${easRemoteBuildNumber}`);
  console.log(`profile_name=${profileName}`);
  console.log(`profile_bundle_id=${profileBundleId}`);
  console.log(`current_sha=${currentSha}`);
  console.log(`origin_main_sha=${originMainSha}`);
  console.log(`profile_fingerprint=${profileCertificateFingerprint}`);
  console.log(`cert_fingerprint=${certFingerprint}`);
  console.log(`apple_distribution_identities=${appleDistributionFingerprints.length}`);
  console.log(`head_matches_origin_main=${currentSha === originMainSha ? 'true' : 'false'}`);
  console.log(`release_signing_checks_enabled=${credentialsSource === 'local' ? 'true' : 'false'}`);
  console.log(`local_signing_guard_ok=${signingResult.ok ? 'true' : 'false'}`);

  if (currentSha !== originMainSha) {
    console.warn(
      'HEAD does not match origin/main. Side-branch TestFlight builds are allowed, but `ship` still defaults to landing on main before release.'
    );
  }

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }

    process.exit(1);
  }

  console.log('release_signing_guard=pass');
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
