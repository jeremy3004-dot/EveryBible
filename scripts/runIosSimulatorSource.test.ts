import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const source = readFileSync(path.join(process.cwd(), 'scripts/run_ios_simulator.sh'), 'utf8');

test('ios simulator launcher defaults to iPhone 17 Pro and forwards the chosen Metro port into xcodebuild', () => {
  assert.equal(packageJson.scripts?.ios, 'bash scripts/run_ios_simulator.sh');
  assert.equal(packageJson.scripts?.['mobile:ios'], 'bash scripts/run_ios_simulator.sh');

  assert.match(
    source,
    /SIMULATOR_NAME="\$\{IOS_SIMULATOR_NAME:-iPhone 17 Pro\}"/,
    'Expected the simulator launcher to target iPhone 17 Pro by default'
  );

  assert.match(
    source,
    /METRO_PORT="\$\{RCT_METRO_PORT:-\$\{EXPO_DEV_CLIENT_METRO_PORT:-8081\}\}"/,
    'Expected the simulator launcher to respect an explicit Metro port override before falling back to 8081'
  );

  assert.match(
    source,
    /"RCT_METRO_PORT=\$\{METRO_PORT\}"/,
    'Expected the simulator launcher to pass the chosen Metro port into xcodebuild'
  );
});

test('ios simulator launcher installs and launches the built app on the resolved simulator device', () => {
  assert.match(
    source,
    /xcrun simctl install "\$DEVICE_ID" "\$APP_PATH"/,
    'Expected the simulator launcher to install the built app on the resolved simulator'
  );

  assert.match(
    source,
    /INITIAL_URL="http:\/\/127\.0\.0\.1:\$\{METRO_PORT\}"/,
    'Expected the simulator launcher to build an explicit dev-client initial URL from the chosen Metro port'
  );

  assert.match(
    source,
    /xcrun simctl launch "\$DEVICE_ID" "\$BUNDLE_IDENTIFIER" --initialUrl "\$INITIAL_URL"/,
    'Expected the simulator launcher to launch the installed app with an explicit initial URL so Expo dev client does not fall back to a stale 8081 bundle'
  );
});
