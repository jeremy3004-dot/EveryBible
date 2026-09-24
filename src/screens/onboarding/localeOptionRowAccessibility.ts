interface LocaleOptionRowAccessibilityInput {
  title: string;
  subtitle?: string | null;
  /** Replaces the title only (e.g. a language named in the language itself). */
  accessibilityLabel?: string;
  /** A visible status chip ("RECOMMENDED", "DOWNLOAD", "SUGGESTED"). */
  statusLabel?: string | null;
  /** Rows with a radio mark: whether this option is the chosen one. */
  isSelected?: boolean;
  /** A translation downloading in this row. */
  isBusy?: boolean;
  /** Download progress, 0-100, while it is known. */
  progress?: number | null;
}

export interface LocaleOptionRowAccessibility {
  label: string;
  state: { selected?: boolean; busy?: boolean };
  value: { min: number; max: number; now: number } | undefined;
}

/**
 * One onboarding row as a screen reader hears it. The row sets its own label,
 * which replaces the text inside it, so the subtitle (the language's English
 * name, a translation's availability) and the status chip have to be restated.
 * The radio mark is drawn only, so selection travels as state.
 */
export function getLocaleOptionRowAccessibility({
  title,
  subtitle,
  accessibilityLabel,
  statusLabel,
  isSelected,
  isBusy = false,
  progress = null,
}: LocaleOptionRowAccessibilityInput): LocaleOptionRowAccessibility {
  const label = [accessibilityLabel ?? title, subtitle, statusLabel]
    .map((part) => part?.trim())
    .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
    .join(', ');

  const state: LocaleOptionRowAccessibility['state'] = {};
  if (isSelected !== undefined) state.selected = isSelected;
  if (isBusy) state.busy = true;

  const value =
    isBusy && progress != null
      ? { min: 0, max: 100, now: Math.max(0, Math.min(100, Math.round(progress))) }
      : undefined;

  return { label, state, value };
}
