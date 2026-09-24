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

  const handleNotificationToggle = async () => {
    lightHaptic();
    if (!notificationsEnabled) {
      // Request permission when enabling
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
        await scheduleDailyReminder(enablePlan.schedule.hour, enablePlan.schedule.minute);
        setPreferences({ notificationsEnabled: true });
        syncPreferences().catch(() => {});
        return;
      }

      openTimePicker();
      return;
    }

    try {
      await cancelDailyReminder();
      setPreferences({ notificationsEnabled: false });
    } finally {
      syncPreferences().catch(() => {});
    }
  };

  const handleTimeSelect = async () => {
    const parsedMinute = parseInt(selectedMinute, 10);
    const timeString = buildReminderTimeString(selectedHour, selectedMinute);
    await scheduleDailyReminder(selectedHour, parsedMinute);

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
    handleTimeSelect,
  };
}
