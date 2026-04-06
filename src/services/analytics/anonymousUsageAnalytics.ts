import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../supabase';

export type AnonymousUsageEventName =
  | 'session_started'
  | 'session_ended'
  | 'chapter_completed'
  | 'audio_playback_progress'
  | 'reading_ended';

export interface AnonymousUsageEvent {
  event_name: AnonymousUsageEventName;
  event_properties: Record<string, unknown>;
  session_id: string | null;
  device_platform: string;
  app_version: string;
  queued_at: string;
}

export interface AnonymousUsageServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

const eventQueue: AnonymousUsageEvent[] = [];
const AUTO_FLUSH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;

let currentAnonymousSessionId: string | null = null;

function generateUUID(): string {
  const webCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getAppVersion(): string {
  try {
    const Constants = require('expo-constants').default;
    return Constants?.expoConfig?.version ?? Constants?.manifest?.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function buildQueuedEvent(
  eventName: AnonymousUsageEventName,
  properties: Record<string, unknown> = {}
): AnonymousUsageEvent {
  return {
    event_name: eventName,
    event_properties: properties,
    session_id: currentAnonymousSessionId,
    device_platform: Platform.OS,
    app_version: getAppVersion(),
    queued_at: new Date().toISOString(),
  };
}

function requeueSnapshot(snapshot: AnonymousUsageEvent[]): void {
  const spaceLeft = Math.max(0, MAX_QUEUE_SIZE - eventQueue.length);
  if (spaceLeft > 0) {
    eventQueue.unshift(...snapshot.slice(0, spaceLeft));
  }
}

function ensureAnonymousSession(): string {
  if (!currentAnonymousSessionId) {
    currentAnonymousSessionId = generateUUID();
    eventQueue.push(
      buildQueuedEvent('session_started', {
        session_kind: 'app',
      })
    );
  }

  return currentAnonymousSessionId;
}

export function trackAnonymousUsageEvent(
  eventName: AnonymousUsageEventName,
  properties: Record<string, unknown> = {}
): void {
  ensureAnonymousSession();
  eventQueue.push(buildQueuedEvent(eventName, properties));

  if (eventQueue.length >= AUTO_FLUSH_SIZE) {
    flushAnonymousUsageEvents().catch(() => {
      // Keep the queue intact on background delivery failure.
    });
  }
}

export async function flushAnonymousUsageEvents(): Promise<AnonymousUsageServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  if (eventQueue.length === 0) {
    return { success: true };
  }

  const snapshot = eventQueue.splice(0, eventQueue.length);

  try {
    const { error } = await supabase.functions.invoke('track-anonymous-usage-events', {
      body: { events: snapshot },
    });

    if (error) {
      requeueSnapshot(snapshot);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    requeueSnapshot(snapshot);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function startAnonymousUsageSession(): string {
  return ensureAnonymousSession();
}

export function endAnonymousUsageSession(): void {
  if (!currentAnonymousSessionId) {
    return;
  }

  eventQueue.push(
    buildQueuedEvent('session_ended', {
      session_kind: 'app',
    })
  );
  currentAnonymousSessionId = null;
}

export function getCurrentAnonymousUsageSessionId(): string | null {
  return currentAnonymousSessionId;
}

export function getPendingAnonymousUsageEventCount(): number {
  return eventQueue.length;
}
