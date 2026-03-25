# Phase 31: Push Notification Implementation - Research

**Researched:** 2026-03-25
**Domain:** expo-notifications 0.32, APNs/FCM credentials, Expo Push Service, Supabase Edge Functions
**Confidence:** HIGH

## Summary

The EveryBible app already has `expo-notifications ~0.32.16` installed, configured in `app.json` with an icon and brand color, and partially wired in `SettingsScreen.tsx`. The local daily reading reminder flow exists end-to-end: permission request, `scheduleNotificationAsync` with `DAILY` trigger, `cancelAllScheduledNotificationsAsync`, and storage in `UserPreferences.notificationsEnabled` / `reminderTime`. What is missing is: (1) a global foreground notification handler (`setNotificationHandler`), (2) push token registration and upsert into the `user_devices` Supabase table that was created in Phase 16, (3) a `notificationService.ts` in the service layer (all notification logic currently lives inside `SettingsScreen.tsx`), and (4) a Supabase Edge Function for group session alerts that fans out push notifications via the Expo Push API.

Daily reading reminders are purely local scheduled notifications — no server required. Group session alerts require the Expo Push API server-side, because the sender is not the receiving device. The `user_devices` table schema is already deployed with proper RLS. `expo-task-manager` is NOT currently installed and is NOT needed for daily scheduled reminders; it is only required for silent background push (headless) handling, which is out of scope for this phase.

**Primary recommendation:** Extract notification logic from `SettingsScreen` into `src/services/notifications/notificationService.ts`, add `setNotificationHandler` and listener setup in `App.tsx`, add Expo push token registration after sign-in, and build a Supabase Edge Function `send-group-notification` that queries `user_devices` and POSTs to the Expo Push API.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-notifications | ~0.32.16 (already installed) | All notification APIs: permissions, scheduling, push tokens, listeners | Expo managed workflow — only option without ejecting |
| Expo Push Service | hosted | Routes iOS APNs + Android FCM via single API endpoint | Free for managed apps with EAS projectId; no APNs/FCM credentials needed in app code |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-constants | auto-installed by expo | Reads `extra.eas.projectId` for `getExpoPushTokenAsync` | Always needed when obtaining Expo push token |
| expo-application | auto-installed | iOS sandbox/production environment detection for APNs | Automatically used by `getExpoPushTokenAsync`; no explicit import needed |
| Supabase Edge Functions (Deno) | n/a | Server-side push dispatch via Expo Push API | Group session alerts — only server can know all group member tokens |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Expo Push Service | FCM direct + APNs direct | Would require adding APNs .p8 key + FCM server key to backend; eliminates Expo's token routing; not worth it for managed workflow |
| Supabase Edge Function | Supabase Database Webhooks | Webhooks cannot target a specific function with complex fan-out logic; Edge Functions are cleaner |
| Edge Function for group alerts | Client-side send | Client cannot push to other devices; server is required |

**Installation:** No new packages required. All dependencies are already installed.

**Version verification:** `expo-notifications@0.32.16` confirmed in `package.json`. EAS projectId `cfbf2bac-d680-448f-b2aa-33c4c01ad15b` confirmed in `app.json`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── notifications/
│       ├── notificationService.ts   # permissions, token reg, scheduling, handler setup
│       └── index.ts                 # barrel export
supabase/
└── functions/
    └── send-group-notification/
        └── index.ts                 # fan-out push via Expo Push API
```

### Pattern 1: Global Foreground Handler (set at module scope in App.tsx)
**What:** `setNotificationHandler` must be called before the first notification arrives. Calling it inside a component is too late.
**When to use:** Set once at app startup, outside any React component, at the top of `App.tsx` or in `notificationService.ts` imported at startup.

```typescript
// Source: node_modules/expo-notifications/build/NotificationsHandler.d.ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

### Pattern 2: Push Token Registration
**What:** After permissions are granted and user is authenticated, obtain the Expo push token and upsert it into `user_devices`.
**When to use:** Call once after successful sign-in, and again on app foreground if token is stale.

```typescript
// Source: node_modules/expo-notifications/build/getExpoPushTokenAsync.d.ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

async function registerPushToken(userId: string, platform: 'ios' | 'android') {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });

  // Upsert into user_devices table (ON CONFLICT DO UPDATE)
  await supabase.from('user_devices').upsert(
    {
      user_id: userId,
      push_token: tokenResult.data,
      platform,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,push_token' }
  );

  return tokenResult.data;
}
```

### Pattern 3: Daily Reading Reminder (local, already partially implemented)
**What:** Schedule a local recurring notification. No server needed.
**When to use:** User enables notifications in Settings.

```typescript
// Source: src/screens/more/SettingsScreen.tsx (existing pattern — extract to service)
import * as Notifications from 'expo-notifications';

async function scheduleDailyReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily Bible Reading',
      body: 'Your daily reading reminder',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}
```

### Pattern 4: Android Notification Channel (required for Android 8+)
**What:** Create channels before scheduling on Android. Missing channels cause silent failures.
**When to use:** Call at app startup on Android before scheduling any notifications.

```typescript
// Source: node_modules/expo-notifications/build/NotificationChannelManager.types.d.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('daily-reminder', {
    name: 'Daily Reading Reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('group-alerts', {
    name: 'Group Session Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}
```

### Pattern 5: Supabase Edge Function — Group Session Alert Fan-Out
**What:** When a group session is created, notify all group members via Expo Push API.
**When to use:** Triggered by client POST after creating a session (no DB webhook needed).

```typescript
// supabase/functions/send-group-notification/index.ts (Deno)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { group_id, title, body } = await req.json();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get all active device tokens for group members
  const { data: devices } = await supabase
    .from('user_devices')
    .select('push_token')
    .eq('is_active', true)
    .in(
      'user_id',
      supabase.from('group_members').select('user_id').eq('group_id', group_id)
    );

  const messages = devices?.map((d) => ({
    to: d.push_token,
    title,
    body,
    sound: 'default',
  })) ?? [];

  // Expo Push API — no auth required for Expo-managed tokens
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  const result = await response.json();
  return new Response(JSON.stringify(result), { status: 200 });
});
```

### Pattern 6: Notification Response Listener (tap-to-navigate)
**What:** Handle user tapping a notification to deep-link into the app.
**When to use:** App.tsx `useEffect`, cleaned up on unmount.

```typescript
// Source: node_modules/expo-notifications/build/NotificationsEmitter.d.ts
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.screen === 'BibleReader') {
      // navigate to relevant screen
    }
  });
  return () => sub.remove();
}, []);
```

### Anti-Patterns to Avoid
- **Notification logic in SettingsScreen:** Currently `scheduleDailyReminder` lives in the component. Extract to `notificationService.ts`. Components should call service functions, not manage Notifications API directly.
- **No foreground handler:** If `setNotificationHandler` is not called, incoming notifications are silently dropped while app is foregrounded. Must be set at module scope before any notification arrives.
- **Missing Android channels:** Scheduling without a matching channel ID on Android 8+ causes silent failure. Create channels at startup before scheduling.
- **Token registration inside Settings toggle:** Push token registration should be tied to auth sign-in, not to the notifications toggle. The toggle controls local reminders, not the push token.
- **Not handling token refresh:** APNs tokens can change. Add a `addPushTokenListener` subscription to detect rotation and re-upsert.
- **Calling registerTaskAsync without expo-task-manager:** Background notification tasks require `expo-task-manager` installed and the task defined in module scope of `index.ts`. Since this phase does not need silent background push, do NOT install `expo-task-manager` — it adds complexity and is not needed for local scheduled notifications or foreground/tap-based push.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| APNs/FCM token management | Custom APNs/FCM integration | Expo Push Service via `getExpoPushTokenAsync` | Managed workflow; Expo handles the APNs/FCM credential layer automatically via EAS |
| Push delivery receipts | Custom delivery polling | Expo Push Receipts API (`/--/api/v2/push/getReceipts`) | Expo normalizes iOS/Android delivery errors into structured error codes |
| Token storage deduplication | Custom SQL logic | `UPSERT ON CONFLICT (user_id, push_token)` — already in `user_devices` schema | Schema constraint from Phase 16 handles duplicates |
| Notification fan-out batching | Custom batching | Expo Push API accepts arrays up to 100 messages per request | Use array POST directly; no custom batching infrastructure needed |

**Key insight:** For a managed Expo workflow with EAS, the Expo Push Service eliminates the need for app-side APNs/FCM credentials entirely. The `projectId` in `getExpoPushTokenAsync` is the only credential needed — it links the token to the EAS project which already has APNs/FCM configured via EAS credentials.

## Common Pitfalls

### Pitfall 1: Simulator Push Token Unavailable
**What goes wrong:** `getExpoPushTokenAsync` throws or returns a warning when called in the iOS Simulator or Android Emulator. Physical push delivery is not available in simulators.
**Why it happens:** APNs/FCM tokens require a real device registration. Simulators cannot communicate with push gateways.
**How to avoid:** Wrap `getExpoPushTokenAsync` in try/catch; log the error and skip token storage if it fails. Never hard-error on token registration failure — it should be best-effort.
**Warning signs:** Error message containing "getExpoPushTokenAsync" + "physical device".

### Pitfall 2: Missing Android Notification Channel
**What goes wrong:** On Android 8.0+, notifications scheduled without a valid channel ID are silently dropped. The device shows no notification and no error.
**Why it happens:** Android requires channels to be declared before use; `scheduleNotificationAsync` does not create channels automatically.
**How to avoid:** Call `setNotificationChannelAsync` at app startup (before any schedule call) with the same `channelId` used in the trigger.
**Warning signs:** iOS shows notifications but Android does not; no error in JS console.

### Pitfall 3: setNotificationHandler Not Called at Module Scope
**What goes wrong:** Notifications received while the app is in the foreground are silently discarded.
**Why it happens:** The default behavior (no handler set) is to not show the notification. The handler must be registered before the first notification arrives.
**How to avoid:** Call `setNotificationHandler` at the top level of `App.tsx` or in the `notificationService.ts` module — not inside any component or `useEffect`.
**Warning signs:** Push notifications work when app is backgrounded but disappear when app is active.

### Pitfall 4: `cancelAllScheduledNotificationsAsync` Is Destructive
**What goes wrong:** Enabling notifications cancels ALL scheduled notifications, including group alerts or other future notifications.
**Why it happens:** Current `scheduleDailyReminder` calls `cancelAllScheduledNotificationsAsync()` before scheduling.
**How to avoid:** Cancel only the specific reminder by identifier, not all notifications. Use `cancelScheduledNotificationAsync(id)` with a stable identifier like `'daily-reading-reminder'`.
**Warning signs:** Group session alerts disappear after user changes their reminder time.

### Pitfall 5: Token Registration for Unauthenticated Users
**What goes wrong:** Trying to upsert a push token into `user_devices` before the user is authenticated will fail the RLS policy (`user_id = auth.uid()`).
**Why it happens:** The `user_devices` table requires `authenticated` role.
**How to avoid:** Gate push token registration on `isAuthenticated` from `authStore`. Register the token in the sign-in completion handler, not at app startup.
**Warning signs:** Supabase 401 or RLS policy violation in logs when token upsert is attempted.

### Pitfall 6: Expo Go Push Token Is for Testing Only
**What goes wrong:** Push tokens obtained in Expo Go (`ExponentPushToken[...]`) route through Expo's development infra and are not production tokens.
**Why it happens:** Expo Go uses its own APNs certificate, not the app's.
**How to avoid:** Always test push notifications with a development build (`eas build --profile development`). Tokens obtained in Expo Go will fail to deliver in production.
**Warning signs:** `DeviceNotRegistered` error from Expo Push Receipts API on production builds.

## Code Examples

### notificationService.ts — Permissions + Token Registration
```typescript
// src/services/notifications/notificationService.ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('daily-reminder', {
    name: 'Daily Reading Reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('group-alerts', {
    name: 'Group Session Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function registerPushToken(userId: string): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string;
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await supabase.from('user_devices').upsert(
      {
        user_id: userId,
        push_token: tokenResult.data,
        platform,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' }
    );
  } catch {
    // Non-fatal: simulator or offline; log only
  }
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-reading-reminder',
    content: { title: 'Daily Bible Reading', body: 'Continue your reading today', sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: 'daily-reminder', // Android only; ignored on iOS
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});
}
```

### App.tsx — Global handler setup (module scope, before component definitions)
```typescript
// App.tsx — add near top, before any component definition
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getLastNotificationResponseAsync()` | `getLastNotificationResponse()` (sync) | expo-notifications 0.29+ | Sync API eliminates async race on cold start |
| Manual APNs/FCM setup | Expo Push Service via EAS projectId | EAS era (2021+) | No app-side credentials needed |
| `cancelAllScheduledNotificationsAsync` | `cancelScheduledNotificationAsync(id)` | Always available | Per-notification cancel is safer |
| `shouldShowAlert` in handler | `shouldShowBanner` + `shouldShowList` | expo-notifications 0.28+ | Finer control over notification display |

**Deprecated/outdated:**
- `shouldShowAlert`: replaced by `shouldShowBanner` and `shouldShowList` in newer expo-notifications versions. The installed 0.32.16 uses the new API.
- `getLastNotificationResponseAsync()`: deprecated; use synchronous `getLastNotificationResponse()` instead.

## Open Questions

1. **Group session alert trigger point**
   - What we know: `group_sessions` records sessions after they are completed (`completed_at` timestamp). There is no scheduled future session concept.
   - What's unclear: Should the alert fire when a session is *completed* (retrospective) or should the leader schedule a future session to trigger a reminder? The schema has no `scheduled_at` field.
   - Recommendation: For this phase, trigger the group alert when a session is *recorded* (a "session completed" notification to all members). A "scheduled reminder" for future sessions requires schema work outside this phase scope.

2. **Token refresh handling**
   - What we know: APNs tokens can rotate. `addPushTokenListener` exists in expo-notifications.
   - What's unclear: How frequently this happens in practice for this app's user base.
   - Recommendation: Add `Notifications.addPushTokenListener` in `App.tsx` to re-upsert on rotation; this is a small addition with low risk.

3. **`notification-icon.png` asset format**
   - What we know: `assets/notification-icon.png` exists and is already referenced in `app.json`.
   - What's unclear: Whether it is 96x96 px monochrome as required for Android.
   - Recommendation: Verify the icon is a white-on-transparent monochrome PNG at 96x96 before building; Android silently shows a generic icon otherwise.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| expo-notifications | All notification features | Yes | 0.32.16 | — |
| EAS projectId | getExpoPushTokenAsync | Yes (in app.json) | cfbf2bac-... | — |
| user_devices table | Push token storage | Yes (Phase 16 migration applied) | — | — |
| Physical iOS/Android device | Push token generation + delivery testing | Not available in CI | — | Use simulator for local scheduling tests; device required for push token QA |
| Supabase Edge Functions runtime | Group notification fan-out | Yes (Deno, same as aggregate-engagement function) | — | — |
| expo-task-manager | Headless background push | Not installed | — | Not needed for this phase scope |

**Missing dependencies with no fallback:**
- Physical device required for push token QA; plan must include device QA checklist item.

**Missing dependencies with fallback:**
- `expo-task-manager` not installed — no fallback needed since silent background push is out of scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none (run directly) |
| Quick run command | `node --test --import tsx src/services/notifications/notificationService.test.ts` |
| Full suite command | `npm run test:release` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | `scheduleDailyReminder` produces correct identifier and trigger shape | unit | `node --test --import tsx src/services/notifications/notificationService.test.ts` | No — Wave 0 |
| NOTIF-02 | `cancelDailyReminder` cancels only the specific identifier | unit | same | No — Wave 0 |
| NOTIF-03 | `registerPushToken` skips gracefully when token fetch throws | unit | same | No — Wave 0 |
| NOTIF-04 | `parseReminderTime` already tested | unit | existing | Yes |
| NOTIF-05 | Push token upsert reaches `user_devices` (manual — requires device + Supabase) | manual | n/a | manual-only |
| NOTIF-06 | Group alert Edge Function posts correct payload to Expo Push API | manual/integration | n/a | manual-only |

### Sampling Rate
- **Per task commit:** `node --test --import tsx src/services/notifications/notificationService.test.ts`
- **Per wave merge:** `npm run test:release`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/services/notifications/notificationService.test.ts` — covers NOTIF-01, NOTIF-02, NOTIF-03 (mock `expo-notifications` module)
- [ ] `src/services/notifications/index.ts` — barrel export

## Sources

### Primary (HIGH confidence)
- `node_modules/expo-notifications/build/getExpoPushTokenAsync.d.ts` — `getExpoPushTokenAsync` signature and `projectId` param
- `node_modules/expo-notifications/build/Tokens.types.d.ts` — `ExpoPushToken`, `DevicePushToken`, `ExpoPushTokenOptions` types
- `node_modules/expo-notifications/build/NotificationsHandler.d.ts` — `setNotificationHandler` API, `shouldShowBanner`/`shouldShowList`
- `node_modules/expo-notifications/build/NotificationsEmitter.d.ts` — `addNotificationReceivedListener`, `addNotificationResponseReceivedListener`
- `node_modules/expo-notifications/build/NotificationScheduler.types.d.ts` — `NativeDailyTriggerInput`, `SchedulableTriggerInputTypes`
- `node_modules/expo-notifications/build/NotificationChannelManager.types.d.ts` — `AndroidImportance`, `setNotificationChannelAsync`
- `node_modules/expo-notifications/build/registerTaskAsync.d.ts` — background task requirements, `expo-task-manager` dependency
- `supabase/migrations/20260322140200_create_user_devices_table.sql` — `user_devices` table schema, UNIQUE constraint, RLS policies
- `src/screens/more/SettingsScreen.tsx` — existing notification logic (permissions, scheduling, cancelAll)
- `src/services/preferences/reminderPreferences.ts` — `parseReminderTime`, `getReminderEnablePlan`
- `app.json` — expo-notifications plugin config, EAS projectId, existing background modes, notification-icon.png
- `package.json` — confirmed `expo-notifications ~0.32.16` installed; no `expo-task-manager`
- `src/types/user.ts` — `UserPreferences.notificationsEnabled`, `reminderTime` field types

### Secondary (MEDIUM confidence)
- `src/services/startup/startupService.ts` — startup coordinator pattern for adding notification init to deferred warmup
- `supabase/functions/aggregate-engagement/index.ts` — existing Edge Function pattern (Deno, service role, CORS headers)
- `supabase/migrations/20260306000000_group_sync_foundation.sql` — `group_sessions`, `group_members` schema for fan-out query

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed, APIs verified from type declarations
- Architecture: HIGH — existing patterns confirmed from source files
- Pitfalls: HIGH — derived from type declarations + existing code gaps
- Supabase fan-out pattern: MEDIUM — based on existing Edge Function structure; Expo Push API URL is widely documented

**Research date:** 2026-03-25
**Valid until:** 2026-06-01 (expo-notifications 0.x; stable API)

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode is enabled — all new types must be explicit; no `any`
- Never commit `.env` — Supabase keys stay in environment variables
- Always use barrel exports (`index.ts`) — `src/services/notifications/index.ts` required
- Theme context for all colors — notification UI in Settings already uses `useTheme()`
- Translation keys for ALL user-facing text — notification titles/bodies must use `t()` keys
- Use Zustand stores for global state — push token state (if needed) goes in `authStore` or a new dedicated store
- Offline-first architecture — notification permission + local scheduling must work offline; token registration is best-effort online-only
- Test on both iOS and Android — Android requires channel setup; iOS has sandbox/production token distinction
- Use Expo's native modules — `expo-notifications` only; no custom native notification code
- No direct Supabase calls in components — token upsert must go through `notificationService.ts`
- No inline styles, no hardcoded colors, no hardcoded strings
