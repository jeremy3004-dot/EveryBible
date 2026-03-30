import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  evaluateReleaseSigningState,
  normalizeSha1Fingerprint,
  parseAppleDistributionFingerprints,
} from '../src/services/release/releaseSigningGuard';

interface CredentialsJson {
  ios?: {
    distributionCertificate?: {
      password?: string;
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
      '  - current HEAD matches origin/main',
      '  - provisioning profile and distribution cert fingerprints match',
      '  - the matching Apple Distribution identity is visible in the active keychain search list',
      '  - only one Apple Distribution identity is visible in the active keychain search list',
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

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = runCommand('git', ['rev-parse', '--show-toplevel']).trim();
  const credentialsJsonPath = path.resolve(repoRoot, options.credentialsJsonPath);
  const credentialsDir = path.resolve(repoRoot, options.credentialsDir);
  const profilePath = path.join(credentialsDir, 'profile.mobileprovision');
  const certPath = path.join(credentialsDir, 'dist-cert.p12');

  runCommand('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: repoRoot });

  const currentSha = runCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  const originMainSha = runCommand('git', ['rev-parse', 'origin/main'], { cwd: repoRoot }).trim();

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
  const profileName = extractPlistValue(profileXml, 'Name');
  const profileCertificateBase64 = extractFirstDeveloperCertificateBase64(profileXml);
  const profileCertificateFingerprint = fingerprintFromDer(
    Buffer.from(profileCertificateBase64, 'base64')
  );

  const certPem = runCommand(
    'openssl',
    ['pkcs12', '-in', certPath, '-nokeys', '-clcerts', '-passin', `pass:${password}`],
    { cwd: repoRoot }
  );
  const certFingerprint = fingerprintFromPem(certPem);
  const keychainOutput = runCommand('security', ['find-identity', '-v', '-p', 'codesigning'], {
    cwd: repoRoot,
  });
  const appleDistributionFingerprints = parseAppleDistributionFingerprints(keychainOutput);
  const result = evaluateReleaseSigningState({
    currentSha,
    originMainSha,
    profileFingerprint: profileCertificateFingerprint,
    certFingerprint,
    appleDistributionFingerprints,
  });

  console.log(`repo_root=${repoRoot}`);
  console.log(`profile_name=${profileName}`);
  console.log(`current_sha=${currentSha}`);
  console.log(`origin_main_sha=${originMainSha}`);
  console.log(`profile_fingerprint=${profileCertificateFingerprint}`);
  console.log(`cert_fingerprint=${certFingerprint}`);
  console.log(`apple_distribution_identities=${appleDistributionFingerprints.length}`);
  console.log(`head_matches_origin_main=${currentSha === originMainSha ? 'true' : 'false'}`);

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
