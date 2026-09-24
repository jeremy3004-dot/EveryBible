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
  scheduleDailyReminder,
} from '../../../services/notifications';
import { lightHaptic } from '../../../utils';
import { REMINDER_MINUTES, buildReminderTimeString } from './settingsScreenModel';

// The crash queue is loaded only when there is a failure to report, and reporting never
// throws into the reminder flow.
function reportReminderScheduleFailure(error: unknown): void {
  void import('../../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('settings.reminderSchedule', error))
    .catch(() => undefined);
}

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
  const scheduleReminder = async (hour: number, minute: number): Promise<boolean> => {
    try {
      await scheduleDailyReminder(hour, minute);
      return true;
    } catch (error) {
      setShowTimePicker(false);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
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
  const enableReminder = async () => {
    const outcome = await requestNotificationPermissionOutcome();

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
        enablePlan.schedule.minute
      );
      if (scheduled && !notificationsEnabled) {
        setPreferences({ notificationsEnabled: true });
        syncPreferences().catch(() => {});
      }
      return;
    }

    openTimePicker();
  };

  const handleNotificationToggle = async () => {
    lightHaptic();
    if (!notificationsEnabled) {
      await enableReminder();
      return;
    }

    try {
      await cancelDailyReminder();
      setPreferences({ notificationsEnabled: false });
    } finally {
      syncPreferences().catch(() => {});
    }
  };

  const handleAllowNotifications = async () => {
    lightHaptic();
    await enableReminder();
  };

  const handleTimeSelect = async () => {
    const parsedMinute = parseInt(selectedMinute, 10);
    const timeString = buildReminderTimeString(selectedHour, selectedMinute);
    if (!(await scheduleReminder(selectedHour, parsedMinute))) {
      return;
    }

    setPreferences({ notificationsEnabled: true, reminderTime: timeString });
    setShowTimePicker(false);
    syncPreferences().catch(() => {});
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
