import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { PressableScale } from '../../../components/ui';
// Imported from its own module, not the hooks barrel: the barrel re-exports
// useSync, which transitively evaluates the Supabase client on first run.
import { useLargeText } from '../../../hooks/useLargeText';
import { getLocaleOptionRowAccessibility } from '../localeOptionRowAccessibility';

const ROW_MIN_HEIGHT = 54;
const RADIO_SIZE = 22;
export const SUGGESTED_MARK_SIZE = 24;

// The 22pt selection mark used by every option row: a hairline ring when empty,
// an accent disc with a check when chosen. Never a tinted row background — the
// EL system reserves fills for chips and the accent rule.
interface SelectionMarkProps {
  isSelected: boolean;
  colors: ThemeColors;
  size?: number;
}

export function SelectionMark({ isSelected, colors, size = RADIO_SIZE }: SelectionMarkProps) {
  if (isSelected) {
    return (
      <View
        style={[
          optionRowStyles.selectionMark,
          { width: size, height: size, borderRadius: size / 2 },
          { backgroundColor: colors.accentPrimary },
        ]}
      >
        <Check size={14} color={colors.onAccent} strokeWidth={2} />
      </View>
    );
  }

  return (
    <View
      style={[
        optionRowStyles.selectionMark,
        optionRowStyles.selectionMarkEmpty,
        { width: size, height: size, borderRadius: size / 2 },
        { borderColor: colors.controlBorder },
      ]}
    />
  );
}

// One row recipe for every list on this flow: title over subtitle on the left,
// a caller-supplied trailing slot on the right, hairline dividers between rows,
// and the 1pt EL press translate.
interface OptionRowProps {
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  /**
   * A status chip ("RECOMMENDED", "DOWNLOAD"): beside `trailing` at normal sizes,
   * under the subtitle at large text, where beside it the copy column kept a word
   * per line.
   */
  statusChip?: ReactNode;
  isLast?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  accessibilityLabel?: string;
  /** The status chip in `trailing`, restated for screen readers. */
  statusLabel?: string | null;
  /** Rows with a radio mark in `trailing`. */
  isSelected?: boolean;
  isBusy?: boolean;
  progress?: number | null;
  testID?: string;
  onPress: () => void;
}

export function OptionRow({
  title,
  subtitle,
  trailing,
  statusChip,
  isLast = false,
  disabled = false,
  colors,
  accessibilityLabel,
  statusLabel,
  isSelected,
  isBusy,
  progress,
  testID,
  onPress,
}: OptionRowProps) {
  const { isLargeText } = useLargeText();
  const a11y = getLocaleOptionRowAccessibility({
    title,
    subtitle,
    accessibilityLabel,
    statusLabel,
    isSelected,
    isBusy,
    progress,
  });
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressEffect="translate"
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={a11y.label}
      accessibilityState={a11y.state}
      accessibilityValue={a11y.value}
      testID={testID}
      style={[
        optionRowStyles.optionRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
      ]}
    >
      <View style={optionRowStyles.optionRowCopy}>
        {/* Two lines, not one: long country and language names otherwise lose
            their ending under large Dynamic Type. */}
        <Text
          style={[optionRowStyles.optionRowTitle, { color: colors.primaryText }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {/* The subtitle wraps too: a trailing status chip ("RECOMMENDED") narrows
            the copy column enough to cut a translation name mid-word. */}
        {subtitle ? (
          <Text
            style={[optionRowStyles.optionRowSubtitle, { color: colors.secondaryText }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
        {statusChip && isLargeText ? (
          <View style={optionRowStyles.chipBelowCopy}>{statusChip}</View>
        ) : null}
      </View>
      {statusChip && !isLargeText ? (
        <View style={optionRowStyles.optionRowTrailing}>
          {statusChip}
          {trailing}
        </View>
      ) : (
        trailing
      )}
    </PressableScale>
  );
}

// Soft status chip — "SUGGESTED", "RECOMMENDED", "DOWNLOAD". Accent surface fill
// with its own foreground token so it stays legible in both scopes.
interface StatusChipProps {
  label: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
}

export function StatusChip({ label, colors, eyebrowFont }: StatusChipProps) {
  return (
    <View style={[optionRowStyles.chip, { backgroundColor: colors.accentSurface }]}>
      <Text style={[typography.monoSmall, eyebrowFont, { color: colors.onAccentSurface }]}>
        {label}
      </Text>
    </View>
  );
}

interface SectionEyebrowProps {
  label: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
}

export function SectionEyebrow({ label, colors, eyebrowFont }: SectionEyebrowProps) {
  return (
    <Text
      style={[
        typography.eyebrow,
        eyebrowFont,
        optionRowStyles.sectionEyebrow,
        { color: colors.secondaryText },
      ]}
    >
      {label}
    </Text>
  );
}

export const optionRowStyles = StyleSheet.create({
  sectionEyebrow: {
    marginBottom: 10,
  },
  optionRow: {
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionRowCopy: {
    flex: 1,
    gap: 2,
  },
  optionRowTitle: {
    ...typography.bodyStrong,
    fontSize: 15.5,
  },
  optionRowSubtitle: {
    ...typography.caption,
  },
  optionRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectionMark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionMarkEmpty: {
    borderWidth: 1.5,
  },
  chip: {
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  chipBelowCopy: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
});
