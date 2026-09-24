import type { SleepTimerOption } from '../../types/audio';

/**
 * Which sleep-timer option reads as the active one. `sleepTimerMinutes` is persisted across
 * launches but the countdown is not, so a remembered length only counts while a countdown
 * (running or paused) exists; otherwise "Off" is the active option.
 */
export function isSleepTimerOptionSelected(
  optionValue: SleepTimerOption,
  sleepTimerMinutes: SleepTimerOption,
  sleepTimerRemaining: number | null
): boolean {
  if (sleepTimerRemaining == null) {
    return optionValue == null;
  }
  return optionValue === sleepTimerMinutes;
}
