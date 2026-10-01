import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { syncPreferences } from '../../../services/sync';
import {
  getReminderEnablePlan,
  getReminderPickerState,
} from '../../../services/preferences/reminderPreferences';
import {
  cancelDailyReminder,
  requestNotificationPermissionOutcome,
  reconcileDailyReminder,
  scheduleDailyReminder,
} from '../../../services/notifications';
import { withPrivacyLockGrace } from '../../../services/privacy/privacyLockGrace';
import { lightHaptic } from '../../../utils';
import { REMINDER_MINUTES, buildReminderTimeString } from './settingsScreenModel';

// The native reminder is shared by every Settings mount. Reopening Settings must
// not let a previous screen's pending save overwrite the new screen's choice.
let reminderGeneration = 0;
let reminderQueue: Promise<void> = Promise.resolve();

// Keep native work in tap order: OFF must cancel after an earlier schedule finishes.
// Generations separately prevent an older completion from overwriting the preference.
const runReminderAction = (action: () => Promise<void>) => {
  const operation = reminderQueue.then(action);
  reminderQueue = operation.catch(() => {});
  return operation;
};

// The crash queue is loaded only when there is a failure to report, and reporting never
// throws into the reminder flow.
function reportReminderScheduleFailure(error: unknown): void {
  void import('../../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('settings.reminderSchedule', error))
    .catch(() => undefined);
}

type ReminderAuthOwner = { uid: string | null; generation: number };
const captureReminderAuthOwner = (): ReminderAuthOwner => {
  const state = useAuthStore.getState();
  return { uid: state.user?.uid ?? null, generation: state.authGeneration };
};
const isReminderAuthOwnerCurrent = (owner: ReminderAuthOwner) => {
  const current = captureReminderAuthOwner();
  return current.uid === owner.uid && current.generation === owner.generation;
};

// Run directly inside the existing native queue slot. If another auth boundary
// or preference change arrives during restoration, its follow-up waits for this write too.
const restoreCurrentReminder = async (): Promise<void> => {
  const owner = captureReminderAuthOwner();
  const { notificationsEnabled, reminderTime } = useAuthStore.getState().preferences;
  try {
    await reconcileDailyReminder({ notificationsEnabled, reminderTime });
  } catch (error) {
    reportReminderScheduleFailure(error);
  } finally {
    const current = useAuthStore.getState().preferences;
    if (
      !isReminderAuthOwnerCurrent(owner) ||
      current.notificationsEnabled !== notificationsEnabled ||
      current.reminderTime !== reminderTime
    ) {
      void runReminderAction(restoreCurrentReminder).catch(reportReminderScheduleFailure);
    }
  }
};

/**
 * The daily reminder: the switch, the permission request behind it, and the time
 * picker it opens when no time has been chosen yet.
 */
export function useReminderSettings() {
  const { t } = useTranslation();
  const notificationsEnabled = useAuthStore((state) => state.preferences.notificationsEnabled);
  const reminderTime = useAuthStore((state) => state.preferences.reminderTime);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState('00');
  const openTimePicker = () => {
    const pickerState = getReminderPickerState(reminderTime, REMINDER_MINUTES);
    setSelectedHour(pickerState.hour);
    setSelectedMinute(pickerState.minute);
    setShowTimePicker(true);
  };

  const closeTimePicker = () => setShowTimePicker(false);

  /**
   * Schedules the reminder, or explains and reports why it could not be. On failure the
   * picker closes and the caller leaves the preference alone, so the switch never shows
   * a reminder that was not scheduled.
   */
  const scheduleReminder = async (
    hour: number,
    minute: number,
    generation: number,
    owner: ReminderAuthOwner
  ): Promise<boolean> => {
    try {
      let scheduled = false;
      await runReminderAction(async () => {
        if (generation !== reminderGeneration || !isReminderAuthOwnerCurrent(owner)) {
          return;
        }
        try {
          await scheduleDailyReminder(hour, minute);
          scheduled = true;
        } finally {
          if (!isReminderAuthOwnerCurrent(owner)) await restoreCurrentReminder();
        }
      });
      return scheduled && generation === reminderGeneration && isReminderAuthOwnerCurrent(owner);
    } catch (error) {
      if (generation === reminderGeneration && isReminderAuthOwnerCurrent(owner)) {
        setShowTimePicker(false);
        Alert.alert(t('common.error'), t('common.unexpectedError'));
      }
      reportReminderScheduleFailure(error);
      return false;
    }
  };

  /**
   * Asks for notification permission, then schedules the reminder at its saved time or
   * opens the picker for one. Used by the switch, and by the notice shown when the
   * reminder is already on (synced from another device) but this device never allowed
   * notifications; the preference and sync are only touched when they change.
   */
  const enableReminder = async (generation: number, owner: ReminderAuthOwner) => {
    if (!isReminderAuthOwnerCurrent(owner)) return;
    // iOS turns the app inactive under the permission prompt; discreet mode must not
    // take that for the reader leaving and lock them out of Settings.
    const outcome = await withPrivacyLockGrace(requestNotificationPermissionOutcome);
    if (generation !== reminderGeneration || !isReminderAuthOwnerCurrent(owner)) {
      return;
    }

    if (outcome !== 'granted') {
      // Once Android stops showing the prompt, the only way back is system settings.
      Alert.alert(
        t('settings.permissionRequired'),
        t('settings.enableNotificationsMessage'),
        outcome === 'blocked'
          ? [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.settings'), onPress: () => void Linking.openSettings() },
            ]
          : [{ text: t('common.ok') }]
      );
      return;
    }

    const enablePlan = getReminderEnablePlan(reminderTime);

    if (enablePlan.type === 'schedule-existing') {
      const scheduled = await scheduleReminder(
        enablePlan.schedule.hour,
        enablePlan.schedule.minute,
        generation,
        owner
      );
      if (
        scheduled &&
        !notificationsEnabled &&
        generation === reminderGeneration &&
        isReminderAuthOwnerCurrent(owner)
      ) {
        setPreferences({ notificationsEnabled: true });
        syncPreferences(owner.uid ?? undefined, owner.generation).catch(() => {});
      }
      return;
    }

    openTimePicker();
  };

  const handleNotificationToggle = async () => {
    const owner = captureReminderAuthOwner();
    const generation = ++reminderGeneration;
    lightHaptic();
    if (!notificationsEnabled) {
      await enableReminder(generation, owner);
      return;
    }

    try {
      await runReminderAction(async () => {
        if (!isReminderAuthOwnerCurrent(owner) || generation !== reminderGeneration) return;
        try {
          await cancelDailyReminder();
        } finally {
          if (!isReminderAuthOwnerCurrent(owner)) await restoreCurrentReminder();
        }
      });
      if (generation === reminderGeneration && isReminderAuthOwnerCurrent(owner)) {
        setPreferences({ notificationsEnabled: false });
      }
    } catch (error) {
      // The reminder is still scheduled, so the switch stays on. Say so rather than
      // leave a tap that did nothing, and report the failure instead of dropping it.
      if (generation === reminderGeneration && isReminderAuthOwnerCurrent(owner)) {
        Alert.alert(t('common.error'), t('common.unexpectedError'));
      }
      reportReminderScheduleFailure(error);
    } finally {
      if (generation === reminderGeneration && isReminderAuthOwnerCurrent(owner)) {
        syncPreferences(owner.uid ?? undefined, owner.generation).catch(() => {});
      }
    }
  };

  const handleAllowNotifications = async () => {
    const owner = captureReminderAuthOwner();
    const generation = ++reminderGeneration;
    lightHaptic();
    await enableReminder(generation, owner);
  };

  const handleTimeSelect = async () => {
    const owner = captureReminderAuthOwner();
    const generation = ++reminderGeneration;
    const parsedMinute = parseInt(selectedMinute, 10);
    const timeString = buildReminderTimeString(selectedHour, selectedMinute);
    if (
      !(await scheduleReminder(selectedHour, parsedMinute, generation, owner)) ||
      generation !== reminderGeneration ||
      !isReminderAuthOwnerCurrent(owner)
    ) {
      return;
    }

    setPreferences({ notificationsEnabled: true, reminderTime: timeString });
    setShowTimePicker(false);
    syncPreferences(owner.uid ?? undefined, owner.generation).catch(() => {});
  };

  return {
    notificationsEnabled,
    reminderTime,
    showTimePicker,
    selectedHour,
    selectedMinute,
    setSelectedHour,
    setSelectedMinute,
    openTimePicker,
    closeTimePicker,
    handleNotificationToggle,
    handleAllowNotifications,
    handleTimeSelect,
  };
}
