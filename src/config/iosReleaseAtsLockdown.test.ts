// Non-TypeScript artefact check: runs the Xcode build-phase shell script against real plists and reads the Xcode project; there is no TypeScript module to load for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import atsPlugin from '../../plugins/withReleaseAtsLockdown';

interface XcodeBuildPhaseRef {
  value: string;
  comment?: string;
}
interface XcodeShellScriptPhase {
  name?: string;
  shellScript?: string;
  inputPaths?: string[];
  alwaysOutOfDate?: number;
}
interface XcodeProject {
  parseSync: () => XcodeProject;
  writeSync: () => string;
  getFirstTarget: () => { uuid: string };
  hash: {
    project: {
      objects: {
        PBXNativeTarget: Record<string, { buildPhases?: XcodeBuildPhaseRef[] }>;
        PBXShellScriptBuildPhase: Record<string, XcodeShellScriptPhase | string>;
      };
    };
  };
}

const { RELEASE_ATS_PHASE_NAME, RELEASE_ATS_SHELL_SCRIPT, applyReleaseAtsLockdown } =
  atsPlugin as unknown as {
    RELEASE_ATS_PHASE_NAME: string;
    RELEASE_ATS_SHELL_SCRIPT: string;
    applyReleaseAtsLockdown: (project: XcodeProject) => XcodeProject;
  };

const requireFromHere = createRequire(import.meta.url);
const xcode = requireFromHere('xcode') as { project: (file: string) => XcodeProject };

const REPO_ROOT = process.cwd();
const PROJECT_FILE = path.join(REPO_ROOT, 'ios/EveryBible.xcodeproj/project.pbxproj');
const SOURCE_INFO_PLIST = path.join(REPO_ROOT, 'ios/EveryBible/Info.plist');
const PLISTBUDDY = '/usr/libexec/PlistBuddy';
const LOCAL_NETWORKING_KEY = ':NSAppTransportSecurity:NSAllowsLocalNetworking';
const canRunPlistBuddy = process.platform === 'darwin' && fs.existsSync(PLISTBUDDY);

const loadProject = (file = PROJECT_FILE): XcodeProject => xcode.project(file).parseSync();

const appTargetPhaseNames = (project: XcodeProject): string[] => {
  const target = project.hash.project.objects.PBXNativeTarget[project.getFirstTarget().uuid];
  return (target.buildPhases ?? []).map((phase) => phase.comment ?? phase.value);
};

const findPhase = (project: XcodeProject): XcodeShellScriptPhase | undefined =>
  Object.entries(project.hash.project.objects.PBXShellScriptBuildPhase)
    .filter(([key]) => !key.endsWith('_comment'))
    .map(([, phase]) => phase)
    .find(
      (phase): phase is XcodeShellScriptPhase =>
        typeof phase === 'object' && phase.name?.replace(/^"|"$/g, '') === RELEASE_ATS_PHASE_NAME
    );

const readLocalNetworking = (plist: string): string | null => {
  const result = spawnSync(PLISTBUDDY, ['-c', `Print ${LOCAL_NETWORKING_KEY}`, plist], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
};

const runPhaseScript = (configuration: string, buildDir: string) =>
  spawnSync('/bin/sh', ['-c', RELEASE_ATS_SHELL_SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CONFIGURATION: configuration,
      TARGET_BUILD_DIR: buildDir,
      INFOPLIST_PATH: 'EveryBible.app/Info.plist',
    },
  });

// Mirrors what Xcode hands the phase: the processed (binary) plist inside the built product.
const stageBuiltInfoPlist = (): { buildDir: string; plist: string } => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everybible-ats-'));
  const plist = path.join(buildDir, 'EveryBible.app/Info.plist');
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.copyFileSync(SOURCE_INFO_PLIST, plist);
  execFileSync('/usr/bin/plutil', ['-convert', 'binary1', plist]);
  return { buildDir, plist };
};

test('the source Info.plist keeps the local-networking exception that Debug builds need for Metro', () => {
  const infoPlist = fs.readFileSync(SOURCE_INFO_PLIST, 'utf8');
  assert.match(infoPlist, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
  assert.match(infoPlist, /<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/);
});

test('the committed Xcode project strips the exception as the app target’s last build phase', () => {
  const project = loadProject();
  const phase = findPhase(project);

  assert.ok(phase, `Expected a "${RELEASE_ATS_PHASE_NAME}" shell script phase`);
  assert.equal(appTargetPhaseNames(project).at(-1), RELEASE_ATS_PHASE_NAME);
  assert.deepEqual(phase.inputPaths, ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"']);
  assert.equal(phase.alwaysOutOfDate, 1);
  assert.equal(
    JSON.parse(phase.shellScript ?? '""'),
    RELEASE_ATS_SHELL_SCRIPT,
    'The committed phase script must match the config plugin (run the plugin, do not hand-edit)'
  );
});

test('the config plugin adds the phase to a project without it, once', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everybible-pbx-'));
  const withoutPhase = path.join(tempDir, 'project.pbxproj');
  const committed = loadProject();
  const target = committed.hash.project.objects.PBXNativeTarget[committed.getFirstTarget().uuid];
  target.buildPhases = (target.buildPhases ?? []).filter(
    (phase) => phase.comment !== RELEASE_ATS_PHASE_NAME
  );
  fs.writeFileSync(withoutPhase, committed.writeSync());

  const project = applyReleaseAtsLockdown(applyReleaseAtsLockdown(loadProject(withoutPhase)));
  const names = appTargetPhaseNames(project);

  assert.equal(names.filter((name) => name === RELEASE_ATS_PHASE_NAME).length, 1);
  assert.equal(names.at(-1), RELEASE_ATS_PHASE_NAME);
});

test('app.json registers the release ATS lockdown plugin so prebuild reproduces the phase', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')) as {
    expo: { plugins?: unknown[] };
  };
  assert.ok(appJson.expo.plugins?.includes('./plugins/withReleaseAtsLockdown'));
});

test(
  'a Release build’s Info.plist loses NSAllowsLocalNetworking and keeps the rest of ATS',
  { skip: !canRunPlistBuddy && 'needs macOS PlistBuddy' },
  () => {
    const { buildDir, plist } = stageBuiltInfoPlist();
    assert.equal(readLocalNetworking(plist), 'true');

    const result = runPhaseScript('Release', buildDir);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readLocalNetworking(plist), null);
    const arbitraryLoads = execFileSync(
      PLISTBUDDY,
      ['-c', 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads', plist],
      { encoding: 'utf8' }
    ).trim();
    assert.equal(arbitraryLoads, 'false');
    // Running again (incremental build) is a no-op, not a failure.
    assert.equal(runPhaseScript('Release', buildDir).status, 0);
  }
);

test(
  'a Debug build keeps the exception so the dev client can reach Metro',
  { skip: !canRunPlistBuddy && 'needs macOS PlistBuddy' },
  () => {
    const { buildDir, plist } = stageBuiltInfoPlist();

    const result = runPhaseScript('Debug', buildDir);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readLocalNetworking(plist), 'true');
  }
);

test(
  'a Release build fails loudly when the built Info.plist is missing',
  { skip: !canRunPlistBuddy && 'needs macOS PlistBuddy' },
  () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everybible-ats-missing-'));

    const result = runPhaseScript('Release', buildDir);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /built Info\.plist not found/);
  }
);
