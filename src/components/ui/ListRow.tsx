import { type ReactNode } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { spacing, typography } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

const LEADING_ICON_SIZE = 18;
const LEADING_GAP = spacing.md;
const CHEVRON_SIZE = 16;
const ICON_STROKE = 2;
const ROW_MIN_HEIGHT = 52;
const ROW_HIT_SLOP = 8;

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** A plain Lucide glyph in `secondaryText` — no tinted well behind it. */
  leadingIcon?: LucideIcon;
  /** Right-aligned value text, set in the mono/tabular metadata style. */
  value?: string;
  /** Custom trailing content (e.g. a Switch). Takes precedence over chevron/value. */
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  destructive?: boolean;
  /** Row titles are medium by default; pass '600' where a row is a heading. */
  titleWeight?: '500' | '600';
  /** Hide the bottom separator on the final row of a group. */
  isLast?: boolean;
  haptic?: HapticFeedback;
  /**
   * Dim and un-press the row. Always sets the RN `disabled` prop and
   * `accessibilityState.disabled` together — setting either alone leaves the
   * row either silently untappable or announced wrong.
   */
  disabled?: boolean;
  accessibilityLabel?: string;
  /**
   * Escape hatch for rows whose `trailing` control has to stay its own focus
   * stop (a Switch a screen reader must be able to toggle directly). Forwarded
   * verbatim to the pressable; leave it unset for the default grouped row.
   */
  accessible?: boolean;
}

// The one row recipe for More / Settings / pickers: 52pt min height, a plain
// leading glyph, title/subtitle, and a trailing chevron | value | control, with
// separators inset past the glyph so the text column reads as one edge.
export function ListRow({
  title,
  subtitle,
  leadingIcon: LeadingIcon,
  value,
  trailing,
  showChevron = false,
  onPress,
  destructive = false,
  titleWeight = '500',
  isLast = false,
  haptic = 'selection',
  disabled = false,
  accessibilityLabel,
  accessible,
}: ListRowProps) {
  const { colors } = useTheme();
  // `value` is translated metadata ("6-day streak", a language's native name), and
  // the mono token is the Latin-only display face, so it needs the fallback merge.
  const displayFont = useDisplayFont();
  const titleColor = destructive ? colors.error : colors.primaryText;

  // A row announces everything it shows. Reading only the title dropped the
  // value ("6-day streak") and the subtitle, which is often the entire state
  // the row exists to report.
  const composedLabel = accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(', ');

  const content = (
    <View style={styles.row}>
      {LeadingIcon ? (
        <LeadingIcon
          size={LEADING_ICON_SIZE}
          color={destructive ? colors.error : colors.secondaryText}
          strokeWidth={ICON_STROKE}
          style={styles.leading}
        />
      ) : null}
      <View style={styles.textColumn}>
        <Text
          style={[typography.rowTitle, { color: titleColor, fontWeight: titleWeight }]}
          // The row is `minHeight`, not a fixed height, so a wrapped title grows
          // the row instead of being cut off at large Dynamic Type.
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.secondaryText }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {trailing ??
          (value ? (
            <Text
              style={[typography.mono, displayFont.regular, { color: colors.secondaryText }]}
              numberOfLines={1}
            >
              {value}
            </Text>
          ) : null)}
        {showChevron && !trailing ? (
          <View style={value ? styles.chevronAfterValue : undefined}>
            <ChevronRight
              size={CHEVRON_SIZE}
              color={colors.textTertiary}
              strokeWidth={ICON_STROKE}
            />
          </View>
        ) : null}
      </View>
    </View>
  );

  const separator = !isLast ? (
    <View
      style={[
        styles.separator,
        {
          backgroundColor: colors.borderStrong,
          marginLeft: LeadingIcon ? LEADING_ICON_SIZE + LEADING_GAP : 0,
        },
      ]}
    />
  ) : null;

  if (onPress) {
    return (
      <View>
        <PressableScale
          onPress={onPress}
          disabled={disabled}
          pressEffect="translate"
          haptic={haptic}
          accessible={accessible}
          accessibilityRole="button"
          accessibilityLabel={composedLabel}
          // `disabled` and accessibilityState.disabled always travel together.
          accessibilityState={{ disabled }}
          // The row's own 52pt box already clears the touch floor, but the
          // separator gap between rows was dead space; 8pt closes it.
          hitSlop={ROW_HIT_SLOP}
        >
          {content}
        </PressableScale>
        {separator}
      </View>
    );
  }

  return (
    <View>
      {content}
      {separator}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: spacing.sm,
  },
  leading: {
    marginRight: LEADING_GAP,
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  chevronAfterValue: {
    marginLeft: spacing.sm,
  },
  separator: {
    height: 1,
  },
});
