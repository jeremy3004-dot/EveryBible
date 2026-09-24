export interface ReminderSchedule {
  hour: number;
  minute: number;
}

export interface ReminderPickerState {
  hour: number;
  minute: string;
}

export type ReminderEnablePlan =
  | {
      type: 'schedule-existing';
      schedule: ReminderSchedule;
    }
  | {
      type: 'open-picker';
    };

const reminderTimePattern = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/;

export const DEFAULT_REMINDER_PICKER_STATE: ReminderPickerState = {
  hour: 9,
  minute: '00',
};

export const parseReminderTime = (
  reminderTime: string | null | undefined
): ReminderSchedule | null => {
  if (!reminderTime) {
    return null;
  }

  const match = reminderTime.match(reminderTimePattern);
  if (!match?.groups) {
    return null;
  }

  return {
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
  };
};

export const getReminderPickerState = (
  reminderTime: string | null | undefined,
  supportedMinutes: readonly string[] = ['00', '15', '30', '45']
): ReminderPickerState => {
  const parsed = parseReminderTime(reminderTime);
  if (!parsed) {
    return DEFAULT_REMINDER_PICKER_STATE;
  }

  const minute = parsed.minute.toString().padStart(2, '0');

  return {
    hour: parsed.hour,
    minute: supportedMinutes.includes(minute) ? minute : DEFAULT_REMINDER_PICKER_STATE.minute,
  };
};

export const getReminderEnablePlan = (
  reminderTime: string | null | undefined
): ReminderEnablePlan => {
  const schedule = parseReminderTime(reminderTime);

  if (!schedule) {
    return {
      type: 'open-picker',
    };
  }

  return {
    type: 'schedule-existing',
    schedule,
  };
};
