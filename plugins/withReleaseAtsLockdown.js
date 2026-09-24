/* global require, module */

// Info.plist carries NSAllowsLocalNetworking=true because a Debug (dev-client) build loads
// its JS from Metro over plain http on localhost or the LAN. Release builds embed the
// bundle and fetch only https media, so the exception is pure attack surface there: it
// lets plain-http loads through to local-network hosts. Info.plist is shared by every
// configuration, so a build phase strips the key from the built product's Info.plist in
// any non-Debug configuration (Release archives for TestFlight, preview builds). It runs
// before code signing, so the signed app never carries the exception.

const { withXcodeProject } = require('expo/config-plugins');

const RELEASE_ATS_PHASE_NAME = '[EveryBible] Strip local-networking ATS exception (Release)';
const BUILT_INFO_PLIST_INPUT = '$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)';

// Fails the build rather than silently shipping the exception if the plist cannot be read
// or the key survives deletion.
const RELEASE_ATS_SHELL_SCRIPT = [
  'case "$CONFIGURATION" in',
  '  *Debug*) exit 0 ;;',
  'esac',
  'PLIST="${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"',
  'PLISTBUDDY=/usr/libexec/PlistBuddy',
  'KEY=":NSAppTransportSecurity:NSAllowsLocalNetworking"',
  'if [ ! -f "$PLIST" ]; then',
  '  echo "error: built Info.plist not found at $PLIST"',
  '  exit 1',
  'fi',
  'if "$PLISTBUDDY" -c "Print $KEY" "$PLIST" >/dev/null 2>&1; then',
  '  "$PLISTBUDDY" -c "Delete $KEY" "$PLIST"',
  'fi',
  'if "$PLISTBUDDY" -c "Print $KEY" "$PLIST" >/dev/null 2>&1; then',
  '  echo "error: NSAllowsLocalNetworking is still set in $PLIST"',
  '  exit 1',
  'fi',
  '',
].join('\n');

const quote = (value) => JSON.stringify(value);

const targetHasReleaseAtsPhase = (project, targetUuid) => {
  const target = project.hash.project.objects.PBXNativeTarget[targetUuid];
  return (target?.buildPhases ?? []).some((phase) => phase.comment === RELEASE_ATS_PHASE_NAME);
};

// Adds the phase as the app target's last build phase; idempotent, so a non-clean prebuild
// over the committed project leaves it alone.
const applyReleaseAtsLockdown = (project) => {
  const target = project.getFirstTarget();
  if (targetHasReleaseAtsPhase(project, target.uuid)) {
    return project;
  }

  const { buildPhase } = project.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    RELEASE_ATS_PHASE_NAME,
    target.uuid,
    {
      shellPath: '/bin/sh',
      // The xcode package quotes the script and escapes `"` but not newlines; pbxproj
      // strings carry them as `\n`, the form Xcode itself writes.
      shellScript: RELEASE_ATS_SHELL_SCRIPT.replace(/\n/g, '\\n'),
      inputPaths: [quote(BUILT_INFO_PLIST_INPUT)],
      outputPaths: [],
    }
  );
  buildPhase.alwaysOutOfDate = 1;
  return project;
};

const withReleaseAtsLockdown = (config) =>
  withXcodeProject(config, (nextConfig) => {
    applyReleaseAtsLockdown(nextConfig.modResults);
    return nextConfig;
  });

module.exports = withReleaseAtsLockdown;
module.exports.RELEASE_ATS_PHASE_NAME = RELEASE_ATS_PHASE_NAME;
module.exports.RELEASE_ATS_SHELL_SCRIPT = RELEASE_ATS_SHELL_SCRIPT;
module.exports.applyReleaseAtsLockdown = applyReleaseAtsLockdown;
