import { AppState } from 'react-native';
import * as Location from 'expo-location';

import {
  buildAnalyticsLocationEventProperties,
  normalizeAnalyticsLocationSnapshot,
  type AnalyticsLocationSnapshot,
} from './activityLocationModel';

const SNAPSHOT_REFRESH_TTL_MS = 15 * 60 * 1000;
const SNAPSHOT_EVENT_TTL_MS = 2 * 60 * 60 * 1000;

let cachedSnapshot: AnalyticsLocationSnapshot | null = null;
let cachedSnapshotCapturedAt = 0;
let inFlightPrime: Promise<AnalyticsLocationSnapshot | null> | null = null;
let hasRequestedForegroundPermissionThisSession = false;

function isCachedSnapshotFresh(now = Date.now()): boolean {
  return cachedSnapshot !== null && now - cachedSnapshotCapturedAt < SNAPSHOT_REFRESH_TTL_MS;
}

function isCachedSnapshotAvailableForEvent(now = Date.now()): boolean {
  return cachedSnapshot !== null && now - cachedSnapshotCapturedAt < SNAPSHOT_EVENT_TTL_MS;
}

function buildApproximateAreaLabel(parts: Array<string | null | undefined>): string | null {
  const label = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return label.length > 0 ? label : null;
}

async function ensureForegroundLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) {
    return true;
  }

  if (
    AppState.currentState !== 'active' ||
    !current.canAskAgain ||
    hasRequestedForegroundPermissionThisSession
  ) {
    return false;
  }

  hasRequestedForegroundPermissionThisSession = true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

async function captureAnalyticsLocationSnapshot(): Promise<AnalyticsLocationSnapshot | null> {
  const granted = await ensureForegroundLocationPermission();
  if (!granted) {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: false,
  });
  const placemarks = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }).catch(() => []);
  const placemark = placemarks[0];

  return normalizeAnalyticsLocationSnapshot({
    accuracyMeters:
      typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
        ? Math.round(position.coords.accuracy)
        : null,
    countryCode: placemark?.isoCountryCode ?? null,
    countryName: placemark?.country ?? null,
    label: buildApproximateAreaLabel([
      placemark?.city,
      placemark?.subregion,
      placemark?.region,
      placemark?.country,
    ]),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
}

export async function primeAnalyticsLocationForCurrentSession(
  _reason: 'listening' | 'download'
): Promise<AnalyticsLocationSnapshot | null> {
  if (isCachedSnapshotFresh()) {
    return cachedSnapshot;
  }

  if (inFlightPrime) {
    return inFlightPrime;
  }

  inFlightPrime = captureAnalyticsLocationSnapshot()
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      cachedSnapshotCapturedAt = snapshot ? Date.now() : 0;
      return snapshot;
    })
    .finally(() => {
      inFlightPrime = null;
    });

  return inFlightPrime;
}

export function getCachedAnalyticsLocationEventProperties(): Record<string, unknown> {
  if (!isCachedSnapshotAvailableForEvent() || !cachedSnapshot) {
    return {};
  }

  return buildAnalyticsLocationEventProperties(cachedSnapshot);
}
