import type { SleepTimerOption } from '../../types/audio';

/**
 * Which sleep-timer option reads as the active one. `sleepTimerMinutes` is persisted across
 * launches but the countdown is not, so a remembered length only counts while a countdown
 * (running or paused) exists; otherwise "Off" is the active option. End of chapter has no
 * countdown at all: it is active for as long as it is set.
 */
export function isSleepTimerOptionSelected(
  optionValue: SleepTimerOption,
  sleepTimerMinutes: SleepTimerOption,
  sleepTimerRemaining: number | null
): boolean {
  if (sleepTimerMinutes === 'end-of-chapter') {
    return optionValue === 'end-of-chapter';
  }
  if (sleepTimerRemaining == null) {
    return optionValue == null;
  }
  return optionValue === sleepTimerMinutes;
}
