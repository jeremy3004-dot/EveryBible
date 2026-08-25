import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIVACY_INSTALLATION_MARKER_KEY,
  createSingleFlightAsyncTask,
  reconcilePrivacyInstallation,
  resetPrivacyIfInstallationIsFresh,
  resolvePrivacyInstallationEvidence,
  resolveLegacyAuthState,
  type PrivacyInstallationReconciliationDependencies,
} from './privacyInstallation';
import { createPrivacyInstallationBootstrap } from './privacyInstallationAdapter';

const createDependencies = (
  overrides: Partial<PrivacyInstallationReconciliationDependencies> = {}
): PrivacyInstallationReconciliationDependencies => ({
  getInstallationMarker: () => undefined,
  getLegacyAuthState: () => undefined,
  resetPrivacy: async () => {},
  seedInstallationMarker: () => {},
  ...overrides,
});

test('preserves privacy settings when the installation marker is present', async () => {
  const calls: string[] = [];

  const result = await reconcilePrivacyInstallation(
    createDependencies({
      getInstallationMarker: () => '1',
      resetPrivacy: async () => {
        calls.push('reset');
      },
      seedInstallationMarker: () => calls.push('seed'),
    })
  );

  assert.deepEqual(result, { status: 'preserved', reason: 'marker' });
  assert.deepEqual(calls, []);
});

test('preserves legacy app state and seeds the marker on an in-place update', async () => {
  const calls: string[] = [];

  const result = await reconcilePrivacyInstallation(
    createDependencies({
      getLegacyAuthState: () => '{"state":{}}',
      resetPrivacy: async () => {
        calls.push('reset');
      },
      seedInstallationMarker: () => calls.push('seed'),
    })
  );

  assert.deepEqual(result, { status: 'preserved', reason: 'legacy' });
  assert.deepEqual(calls, ['seed']);
});

test('resets privacy and seeds the marker for a fresh installation', async () => {
  const calls: string[] = [];

  const result = await reconcilePrivacyInstallation(
    createDependencies({
      resetPrivacy: async () => {
        calls.push('reset');
      },
      seedInstallationMarker: () => calls.push('seed'),
    })
  );

  assert.deepEqual(result, { status: 'reset' });
  assert.deepEqual(calls, ['reset', 'seed']);
});

test('does not seed the marker when the fresh-install reset fails', async () => {
  const calls: string[] = [];

  await assert.rejects(
    reconcilePrivacyInstallation(
      createDependencies({
        resetPrivacy: async () => {
          calls.push('reset');
          throw new Error('secure store unavailable');
        },
        seedInstallationMarker: () => calls.push('seed'),
      })
    ),
    /secure store unavailable/
  );

  assert.deepEqual(calls, ['reset']);
});

test('exports the app-container marker key used to classify reinstallations', () => {
  assert.equal(PRIVACY_INSTALLATION_MARKER_KEY, 'everybible.privacy.installation.v1');
});

test('uses retained MMKV auth state without reading legacy AsyncStorage', async () => {
  let asyncReads = 0;

  const result = await resolveLegacyAuthState(
    () => '{"state":{"preferences":{"onboardingCompleted":true}}}',
    async () => {
      asyncReads += 1;
      return '{"legacy":true}';
    }
  );

  assert.equal(result, '{"state":{"preferences":{"onboardingCompleted":true}}}');
  assert.equal(asyncReads, 0);
});

test('falls back to legacy AsyncStorage when MMKV auth state is absent', async () => {
  let asyncReads = 0;

  const result = await resolveLegacyAuthState(
    () => undefined,
    async () => {
      asyncReads += 1;
      return '{"state":{"preferences":{"onboardingCompleted":true}}}';
    }
  );

  assert.equal(result, '{"state":{"preferences":{"onboardingCompleted":true}}}');
  assert.equal(asyncReads, 1);
});

test('treats a null legacy AsyncStorage value as absent', async () => {
  const result = await resolveLegacyAuthState(
    () => undefined,
    async () => null
  );

  assert.equal(result, undefined);
});

test('single-flight reconciliation joins concurrent attempts and retries after failure', async () => {
  let release!: () => void;
  let resetCount = 0;
  let shouldFail = true;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reconcile = createSingleFlightAsyncTask(async () => {
    await reconcilePrivacyInstallation(
      createDependencies({
        resetPrivacy: async () => {
          resetCount += 1;
          await gate;
          if (shouldFail) {
            throw new Error('reset failed');
          }
        },
      })
    );
  });

  const first = reconcile();
  const second = reconcile();

  assert.strictEqual(first, second);
  assert.equal(resetCount, 1);
  release();
  await assert.rejects(Promise.all([first, second]), /reset failed/);

  shouldFail = false;
  await reconcile();
  assert.equal(resetCount, 2);
});

test('installation bootstrap keeps reconciliation and reset behind unresolved migration', async () => {
  const calls: string[] = [];
  let releaseMigration!: () => void;
  let migrationStarted!: () => void;
  const migrationStartedPromise = new Promise<void>((resolve) => {
    migrationStarted = resolve;
  });
  const migrationGate = new Promise<void>((resolve) => {
    releaseMigration = resolve;
  });
  let resetCount = 0;

  const bootstrap = createPrivacyInstallationBootstrap({
    migrateStorage: async () => {
      calls.push('migration:start');
      migrationStarted();
      await migrationGate;
      calls.push('migration:end');
    },
    reconcileInstallation: async () => {
      calls.push('reconciliation');
      await reconcilePrivacyInstallation(
        createDependencies({
          resetPrivacy: async () => {
            resetCount += 1;
          },
        })
      );
    },
  });

  const firstAttempt = bootstrap();
  await migrationStartedPromise;
  const retryAttempt = bootstrap();

  assert.strictEqual(retryAttempt, firstAttempt);
  assert.deepEqual(calls, ['migration:start']);
  assert.equal(resetCount, 0);

  releaseMigration();
  await Promise.all([firstAttempt, retryAttempt]);

  assert.deepEqual(calls, ['migration:start', 'migration:end', 'reconciliation']);
  assert.equal(resetCount, 1);
});

test('late legacy evidence re-reads the marker before allowing a reset', async () => {
  let marker: string | undefined;
  let releaseLegacyRead!: () => void;
  let legacyReadStarted!: () => void;
  const legacyReadStartedPromise = new Promise<void>((resolve) => {
    legacyReadStarted = resolve;
  });
  const legacyRead = new Promise<string | null>((resolve) => {
    releaseLegacyRead = () => resolve(null);
  });

  const evidencePromise = resolvePrivacyInstallationEvidence({
    getInstallationMarker: () => marker,
    getMmkvAuthState: () => undefined,
    getAsyncStorageAuthState: async () => {
      legacyReadStarted();
      return legacyRead;
    },
  });

  await legacyReadStartedPromise;
  marker = '1';
  releaseLegacyRead();

  const evidence = await evidencePromise;
  let resetCount = 0;
  let seedCount = 0;
  const result = await reconcilePrivacyInstallation({
    getInstallationMarker: () => evidence.installationMarker,
    getLegacyAuthState: () => evidence.legacyAuthState,
    resetPrivacy: async () => {
      resetCount += 1;
    },
    seedInstallationMarker: () => {
      seedCount += 1;
    },
  });

  assert.deepEqual(evidence, { installationMarker: '1', legacyAuthState: undefined });
  assert.deepEqual(result, { status: 'preserved', reason: 'marker' });
  assert.equal(resetCount, 0);
  assert.equal(seedCount, 0);
});

test('late auth-storage evidence suppresses reset after native reset loading', async () => {
  let authStorage: string | undefined;
  let resetCount = 0;
  let releaseResetLoader!: () => void;
  let resetLoaderStarted!: () => void;
  const resetLoaderStartedPromise = new Promise<void>((resolve) => {
    resetLoaderStarted = resolve;
  });
  const resetLoader = new Promise<void>((resolve) => {
    releaseResetLoader = resolve;
  });

  const reset = resetPrivacyIfInstallationIsFresh({
    getInstallationMarker: () => undefined,
    getLegacyAuthState: () => authStorage,
    loadResetPrivacy: async () => {
      resetLoaderStarted();
      await resetLoader;
      authStorage = '{"state":{}}';
      return async () => {
        resetCount += 1;
      };
    },
  });

  await resetLoaderStartedPromise;
  releaseResetLoader();

  assert.equal(await reset, false);
  assert.equal(resetCount, 0);
});
