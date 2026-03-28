import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('push registration disables Expo auto server registration and uses explicit baseUrl', () => {
  const source = readRelativeSource('./notificationService.ts');

  assert.match(
    source,
    /setAutoServerRegistrationEnabledAsync\(false\)/,
    'registerPushToken should disable Expo auto server registration to avoid background retry loops'
  );

  assert.match(
    source,
    /getExpoPushTokenAsync\(\{\s*projectId,\s*baseUrl:/s,
    'registerPushToken should call getExpoPushTokenAsync with an explicit baseUrl so auto server registration is not re-enabled implicitly'
  );
});

test('push token refresh registration forwards the provided devicePushToken', () => {
  const source = readRelativeSource('./notificationService.ts');

  assert.match(
    source,
    /getExpoPushTokenAsync\(\{[\s\S]*devicePushToken[\s\S]*\}\)/,
    'registerPushToken should forward a listener-provided devicePushToken so Expo does not re-fetch it inside addPushTokenListener'
  );
});

test('push registration deduplicates concurrent register calls', () => {
  const source = readRelativeSource('./notificationService.ts');

  assert.match(
    source,
    /registerPushTokenInFlight/,
    'notificationService should track an in-flight registerPushToken promise'
  );

  assert.match(
    source,
    /if\s*\(\s*registerPushTokenInFlight\s*\)\s*\{\s*return registerPushTokenInFlight;\s*\}/s,
    'registerPushToken should return the active in-flight promise when a second call arrives'
  );
});

test('App push token listener forwards the refreshed device token into registerPushToken', () => {
  const appSource = readRelativeSource('../../../App.tsx');

  assert.match(
    appSource,
    /addPushTokenListener\(\(devicePushToken\)\s*=>[\s\S]*registerPushToken\(currentUser\.uid,\s*devicePushToken\)/s,
    'App.tsx should pass the refreshed devicePushToken into registerPushToken instead of forcing a second device-token lookup'
  );
});
