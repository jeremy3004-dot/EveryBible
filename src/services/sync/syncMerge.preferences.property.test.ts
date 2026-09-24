import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { defaultAuthPreferences } from '../../stores/persistedStateSanitizers';
import {
  mapRemotePreferences,
  mergePreferences,
  PREFERENCE_COLUMNS,
  readRemoteFieldStamps,
  toRemoteFieldStamps,
  type LocalPreferenceSnapshot,
} from './syncMerge';
import type { PreferenceFieldStamps, UserPreferences } from '../../types';
import type { UserPreferences as RemoteUserPreferences } from '../supabase/types';

// ---------------------------------------------------------------------------
// Randomised two-device runs of preference sync against a TypeScript model of
// the user_preferences row: the stamp trigger stamp_user_preference_edits
// (migration 20260924023259) and Postgres's TIME column for reminder_time.
// The client steps mirror syncPreferencesForIdentityImpl in syncService.ts.
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=5000 node --test --import tsx \
//     src/services/sync/syncMerge.preferences.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 200),
};

type Field = keyof UserPreferences;
type Column = (typeof PREFERENCE_COLUMNS)[Field];
const FIELDS = Object.keys(PREFERENCE_COLUMNS) as Field[];
const BASE_MS = Date.parse('2026-09-24T09:00:00.000Z');

// Values a reader can choose for each preference.
const CHOICES: { [F in Field]: UserPreferences[F][] } = {
  fontSize: ['small', 'medium', 'large'],
  theme: ['dark', 'light'],
  appearancePalette: ['el-blue', 'el-blue-brand'],
  language: ['en', 'es', 'fr'],
  countryCode: [null, 'NP', 'KE'],
  countryName: [null, 'Nepal', 'Kenya'],
  contentLanguageCode: [null, 'npi', 'swh'],
  contentLanguageName: [null, 'Nepali', 'Swahili'],
  contentLanguageNativeName: [null, 'नेपाली', 'Kiswahili'],
  chapterFeedbackName: [null, 'Asha', 'Juma'],
  chapterFeedbackRole: [null, 'council', 'translator'],
  onboardingCompleted: [true],
  chapterFeedbackEnabled: [false, true],
  hidePlayButtonFromReadingTab: [false, true],
  notificationsEnabled: [false, true],
  reminderTime: [null, '07:30', '21:00'],
};

// ---------------------------------------------------------------------------
// Server model
// ---------------------------------------------------------------------------

type ServerRow = RemoteUserPreferences & { field_updated_at: Record<string, string> };

const isoMs = (ms: number) => new Date(ms).toISOString();

/** What Postgres stores for a value written to the column (reminder_time is TIME). */
const storeColumnValue = (column: Column, value: unknown): unknown =>
  column === 'reminder_time' && typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
    ? `${value}:00`
    : value;

/** The signup row: DB defaults, nothing chosen yet. */
const signupRow = (nowMs: number): ServerRow => ({
  id: 'prefs-1',
  user_id: 'user-1',
  font_size: 'medium',
  theme: 'dark',
  appearance_palette: 'el-blue',
  language: 'en',
  country_code: null,
  country_name: null,
  content_language_code: null,
  content_language_name: null,
  content_language_native_name: null,
  chapter_feedback_name: null,
  chapter_feedback_role: null,
  chapter_feedback_id_number: null,
  onboarding_completed: false,
  chapter_feedback_enabled: false,
  hide_play_button_from_reading_tab: false,
  notifications_enabled: false,
  reminder_time: null,
  synced_at: isoMs(nowMs),
  field_updated_at: {},
});

const stampMs = (stamp: unknown): number | null => {
  if (typeof stamp !== 'string') return null;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : null;
};

/** The trigger's INSERT branch: each tracked stamp clamped to now, nothing else kept. */
const normalizeOnInsert = (raw: Record<string, string>, nowMs: number): Record<string, string> => {
  const stamps: Record<string, string> = {};
  for (const column of Object.values(PREFERENCE_COLUMNS)) {
    const at = stampMs(raw[column]);
    if (at !== null) stamps[column] = isoMs(Math.min(at, nowMs));
  }
  return stamps;
};

/**
 * An upsert of `write` over `stored`, through stamp_user_preference_edits.
 * `write.field_updated_at === undefined` is an installed build that does not
 * send the column (on conflict it is left out of the UPDATE).
 */
function upsertThroughTrigger(
  stored: ServerRow,
  write: Partial<RemoteUserPreferences>,
  nowMs: number
): ServerRow {
  const next = { ...stored } as Record<string, unknown>;
  for (const column of Object.values(PREFERENCE_COLUMNS)) {
    if (column in write) {
      next[column] = storeColumnValue(column, (write as Record<string, unknown>)[column]);
    }
  }
  next.synced_at = write.synced_at ?? stored.synced_at;
  // INSERT ... ON CONFLICT runs the BEFORE INSERT trigger on the proposed row
  // first, so EXCLUDED.field_updated_at arrives already rebuilt from the tracked
  // columns (clamped, unknown keys dropped). A write that leaves the column out
  // of the SET list keeps the stored value.
  const incoming =
    write.field_updated_at === undefined
      ? stored.field_updated_at
      : normalizeOnInsert(write.field_updated_at ?? {}, nowMs);
  // IS NOT DISTINCT FROM on jsonb: equal as JSON values.
  const sameStamps =
    JSON.stringify(Object.entries(incoming).sort()) ===
    JSON.stringify(Object.entries(stored.field_updated_at).sort());
  const legacyWriter = sameStamps;

  const stamps: Record<string, string> = {};
  for (const column of Object.values(PREFERENCE_COLUMNS)) {
    const incomingRaw = stampMs(incoming[column]);
    const incomingAt = incomingRaw === null ? null : Math.min(incomingRaw, nowMs);
    const storedAt = stampMs(stored.field_updated_at[column]);
    const changed =
      JSON.stringify(next[column]) !== JSON.stringify((stored as Record<string, unknown>)[column]);

    let keptAt: number | null;
    if (legacyWriter) {
      keptAt = changed ? nowMs : storedAt;
    } else if (changed && storedAt !== null && (incomingAt === null || incomingAt <= storedAt)) {
      next[column] = (stored as Record<string, unknown>)[column];
      keptAt = storedAt;
    } else {
      keptAt =
        incomingAt === null
          ? storedAt
          : storedAt === null
            ? incomingAt
            : Math.max(incomingAt, storedAt);
    }
    if (keptAt !== null) stamps[column] = isoMs(keptAt);
  }
  next.field_updated_at = stamps;
  return next as ServerRow;
}

// ---------------------------------------------------------------------------
// Device model (the parts of authStore that preference sync touches)
// ---------------------------------------------------------------------------

interface Device {
  preferences: UserPreferences;
  updatedAt: string | null;
  base: UserPreferences | null;
  fieldStamps: PreferenceFieldStamps;
  skewMs: number;
  /** Set once this device has shown onboarding as finished. */
  sawOnboardingDone: boolean;
}

const newDevice = (skewMs: number): Device => ({
  preferences: { ...defaultAuthPreferences },
  updatedAt: null,
  base: null,
  fieldStamps: {},
  skewMs,
  sawOnboardingDone: false,
});

/** authStore.setPreferences: stamps only what changed. */
const edit = <F extends Field>(
  device: Device,
  field: F,
  value: UserPreferences[F],
  nowMs: number
): Device => {
  if (device.preferences[field] === value) return device;
  const stamp = isoMs(nowMs + device.skewMs);
  return {
    ...device,
    preferences: { ...device.preferences, [field]: value },
    updatedAt: stamp,
    fieldStamps: { ...device.fieldStamps, [field]: stamp },
  };
};

/** authStore.applySyncedPreferences with explicit stamps (the server has the column). */
const applySynced = (
  device: Device,
  preferences: UserPreferences,
  updatedAt: string | null,
  base: UserPreferences,
  stamps: PreferenceFieldStamps
): Device => ({ ...device, preferences, updatedAt, base, fieldStamps: stamps });

/** One syncPreferences pass, as syncPreferencesForIdentityImpl runs it. */
function syncDevice(
  device: Device,
  server: ServerRow,
  nowMs: number
): { device: Device; server: ServerRow } {
  const local: LocalPreferenceSnapshot = {
    preferences: device.preferences,
    updatedAt: device.updatedAt,
    base: device.base,
    fieldStamps: device.fieldStamps,
  };
  const merge = mergePreferences(local, server);
  let next = device;
  if (merge.source === 'remote') {
    next = applySynced(
      device,
      merge.preferences,
      merge.updatedAt,
      merge.preferences,
      merge.fieldStamps ?? {}
    );
    return { device: next, server };
  }
  if (merge.source === 'merged' && merge.remotePreferences) {
    next = applySynced(
      device,
      merge.preferences,
      local.updatedAt,
      merge.remotePreferences,
      merge.fieldStamps ?? {}
    );
  }

  const syncedAt = isoMs(nowMs + device.skewMs);
  const write: Partial<RemoteUserPreferences> = { synced_at: syncedAt };
  for (const field of FIELDS) {
    (write as Record<string, unknown>)[PREFERENCE_COLUMNS[field]] = merge.preferences[field];
  }
  write.field_updated_at = toRemoteFieldStamps(merge.fieldStamps ?? {});
  const stored = upsertThroughTrigger(server, write, nowMs);

  const storedPreferences = mapRemotePreferences(stored);
  const storedStamps = readRemoteFieldStamps(stored) ?? {};
  next = applySynced(next, storedPreferences, syncedAt, storedPreferences, storedStamps);
  return { device: next, server: stored };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

type PrefOp =
  | { kind: 'edit'; device: 0 | 1; field: Field; choice: number; advanceMs: number }
  | { kind: 'sync'; device: 0 | 1; advanceMs: number }
  | { kind: 'legacyEdit'; field: Field; choice: number; advanceMs: number };

const fieldArb = fc.constantFrom(...FIELDS);
const advanceArb = fc.constantFrom(0, 1, 500, 60_000);
const prefOpArb: fc.Arbitrary<PrefOp> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('edit' as const),
      device: fc.constantFrom(0 as const, 1 as const),
      field: fieldArb,
      choice: fc.nat(2),
      advanceMs: advanceArb,
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('sync' as const),
      device: fc.constantFrom(0 as const, 1 as const),
      advanceMs: advanceArb,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('legacyEdit' as const),
      field: fieldArb.filter((f) => f !== 'onboardingCompleted'),
      choice: fc.nat(2),
      advanceMs: advanceArb,
    }),
  }
);

const choose = <F extends Field>(field: F, choice: number): UserPreferences[F] =>
  CHOICES[field][choice % CHOICES[field].length];

interface Outcome {
  devices: [Device, Device];
  server: ServerRow;
  /** Per field, the value of the most recent edit anywhere (by real time), if any. */
  latestEdit: Partial<Record<Field, { value: unknown; atMs: number }>>;
  onboardingRegressed: boolean;
}

function runPreferenceScenario(
  ops: PrefOp[],
  skews: [number, number],
  useLegacy: boolean
): Outcome {
  let nowMs = BASE_MS;
  let server = signupRow(nowMs);
  let devices: [Device, Device] = [newDevice(skews[0]), newDevice(skews[1])];
  const latestEdit: Outcome['latestEdit'] = {};
  let onboardingRegressed = false;

  const setDevice = (index: 0 | 1, device: Device) => {
    const before = devices[index];
    const sawDone = before.sawOnboardingDone || device.preferences.onboardingCompleted;
    if (before.sawOnboardingDone && !device.preferences.onboardingCompleted) {
      onboardingRegressed = true;
    }
    devices =
      index === 0
        ? [{ ...device, sawOnboardingDone: sawDone }, devices[1]]
        : [devices[0], { ...device, sawOnboardingDone: sawDone }];
  };
  const sync = (index: 0 | 1) => {
    const result = syncDevice(devices[index], server, nowMs);
    server = result.server;
    setDevice(index, result.device);
  };

  for (const op of ops) {
    nowMs += op.advanceMs;
    if (op.kind === 'edit') {
      const value = choose(op.field, op.choice);
      const before = devices[op.device];
      const after = edit(before, op.field, value, nowMs);
      if (after !== before) latestEdit[op.field] = { value, atMs: nowMs };
      setDevice(op.device, after);
    } else if (op.kind === 'sync') {
      sync(op.device);
    } else if (useLegacy) {
      // An installed 1.0.9 build on a third phone: it reads the row, changes one
      // value and upserts every column without field_updated_at.
      const value = choose(op.field, op.choice);
      const current = mapRemotePreferences(server);
      if (current[op.field] !== value) latestEdit[op.field] = { value, atMs: nowMs };
      const write: Partial<RemoteUserPreferences> = { synced_at: isoMs(nowMs) };
      for (const field of FIELDS) {
        (write as Record<string, unknown>)[PREFERENCE_COLUMNS[field]] =
          field === op.field
            ? value
            : (server as Record<string, unknown>)[PREFERENCE_COLUMNS[field]];
      }
      server = upsertThroughTrigger(server, write, nowMs);
    }
  }
  for (const index of [0, 1, 0, 1] as const) {
    nowMs += 1000;
    sync(index);
  }
  return { devices, server, latestEdit, onboardingRegressed };
}

const skewArb = fc.tuple(
  fc.constantFrom(0, -120_000, 90_000, 3_600_000),
  fc.constantFrom(0, -30_000, 120_000)
) as fc.Arbitrary<[number, number]>;

test('two devices and the server converge on every preference and its stamp', () => {
  fc.assert(
    fc.property(
      fc.array(prefOpArb, { minLength: 4, maxLength: 24 }),
      skewArb,
      fc.boolean(),
      (ops, skews, legacy) => {
        const { devices, server } = runPreferenceScenario(ops, skews, legacy);
        const serverPreferences = mapRemotePreferences(server);
        const serverStamps = readRemoteFieldStamps(server) ?? {};
        assert.deepEqual(devices[0].preferences, devices[1].preferences);
        assert.deepEqual(devices[0].fieldStamps, devices[1].fieldStamps);
        assert.deepEqual(devices[0].fieldStamps, serverStamps);
        // A value nobody chose (no stamp) may stay the app default on the devices
        // while the row keeps its DB default; every chosen value matches.
        for (const field of FIELDS) {
          if (serverStamps[field] !== undefined) {
            assert.equal(devices[0].preferences[field], serverPreferences[field], field);
          }
        }
      }
    ),
    FC_PARAMS
  );
});

test('with honest clocks, each preference ends on the value chosen last', () => {
  fc.assert(
    fc.property(
      fc.array(prefOpArb, { minLength: 4, maxLength: 24 }),
      fc.boolean(),
      (ops, legacy) => {
        // Distinct edit times, so "last" is well defined.
        const spaced = ops.map((op) => ({ ...op, advanceMs: op.advanceMs + 1 }));
        const { devices, latestEdit } = runPreferenceScenario(spaced, [0, 0], legacy);
        for (const [field, edit] of Object.entries(latestEdit) as [Field, { value: unknown }][]) {
          assert.equal(devices[0].preferences[field], edit.value, field);
        }
      }
    ),
    FC_PARAMS
  );
});

test('a device that has shown onboarding as finished never shows it unfinished again', () => {
  fc.assert(
    fc.property(
      fc.array(prefOpArb, { minLength: 4, maxLength: 24 }),
      skewArb,
      fc.boolean(),
      (ops, skews, legacy) => {
        assert.equal(runPreferenceScenario(ops, skews, legacy).onboardingRegressed, false);
      }
    ),
    FC_PARAMS
  );
});

test('a settled device merges the server row as a no-op', () => {
  fc.assert(
    fc.property(
      fc.array(prefOpArb, { minLength: 4, maxLength: 24 }),
      skewArb,
      fc.boolean(),
      (ops, skews, legacy) => {
        const { devices, server } = runPreferenceScenario(ops, skews, legacy);
        for (const device of devices) {
          const merge = mergePreferences(
            {
              preferences: device.preferences,
              updatedAt: device.updatedAt,
              base: device.base,
              fieldStamps: device.fieldStamps,
            },
            server
          );
          assert.equal(merge.source, 'remote');
          assert.equal(merge.changed, false);
        }
      }
    ),
    FC_PARAMS
  );
});

test('merging the same server row twice changes nothing the second time', () => {
  const stampArb = fc.option(
    fc.integer({ min: 0, max: 5 }).map((n) => isoMs(BASE_MS + n * 1000)),
    { nil: undefined }
  );
  const prefsArb = fc.record(
    Object.fromEntries(
      FIELDS.map((field) => [
        field,
        fc.constantFrom(...CHOICES[field], defaultAuthPreferences[field]),
      ])
    )
  ) as unknown as fc.Arbitrary<UserPreferences>;
  const stampsArb = fc.record(Object.fromEntries(FIELDS.map((field) => [field, stampArb])), {
    requiredKeys: [],
  }) as unknown as fc.Arbitrary<PreferenceFieldStamps>;

  fc.assert(
    fc.property(
      prefsArb,
      stampsArb,
      prefsArb,
      stampsArb,
      (localPrefs, localStamps, remotePrefs, remoteStamps) => {
        const clean = (stamps: PreferenceFieldStamps) =>
          Object.fromEntries(
            Object.entries(stamps).filter(([, stamp]) => stamp !== undefined)
          ) as PreferenceFieldStamps;
        const row = signupRow(BASE_MS) as ServerRow;
        for (const field of FIELDS) {
          (row as Record<string, unknown>)[PREFERENCE_COLUMNS[field]] = remotePrefs[field];
        }
        row.field_updated_at = toRemoteFieldStamps(clean(remoteStamps));

        const first = mergePreferences(
          { preferences: localPrefs, updatedAt: null, fieldStamps: clean(localStamps) },
          row
        );
        const second = mergePreferences(
          {
            preferences: first.preferences,
            updatedAt: first.updatedAt,
            fieldStamps: first.fieldStamps ?? {},
          },
          row
        );
        assert.deepEqual(second.preferences, first.preferences);
        assert.deepEqual(second.fieldStamps, first.fieldStamps);
        assert.equal(second.changed, false);
      }
    ),
    FC_PARAMS
  );
});

test('an installed build writing onboarding_completed false does not reopen onboarding here', () => {
  let nowMs = BASE_MS;
  let server = signupRow(nowMs);
  let device = edit(newDevice(0), 'onboardingCompleted', true, (nowMs += 1000));
  ({ device, server } = syncDevice(device, server, (nowMs += 1000)));
  assert.equal(server.onboarding_completed, true);

  // A 1.0.9 phone that never finished onboarding upserts its whole row.
  const legacyWrite: Partial<RemoteUserPreferences> = { synced_at: isoMs((nowMs += 1000)) };
  for (const field of FIELDS) {
    (legacyWrite as Record<string, unknown>)[PREFERENCE_COLUMNS[field]] =
      field === 'onboardingCompleted' ? false : device.preferences[field];
  }
  server = upsertThroughTrigger(server, legacyWrite, nowMs);

  ({ device, server } = syncDevice(device, server, (nowMs += 1000)));
  assert.equal(device.preferences.onboardingCompleted, true);
});
