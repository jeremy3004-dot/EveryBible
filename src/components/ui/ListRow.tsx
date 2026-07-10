import { type ReactNode } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

const LEADING_SIZE = 32;

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  /** Right-aligned value text (muted). */
  value?: string;
  /** Custom trailing content (e.g. a Switch). Takes precedence over chevron/value. */
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  destructive?: boolean;
  /** Hide the bottom separator on the final row of a group. */
  isLast?: boolean;
  haptic?: HapticFeedback;
  accessibilityLabel?: string;
}

// The one row recipe for More / Settings / pickers: 52pt min height, optional
// tinted leading icon, title/subtitle, and a trailing chevron | value | control,
// with inset hairline separators between rows.
export function ListRow({
  title,
  subtitle,
  leadingIcon,
  value,
  trailing,
  showChevron = false,
  onPress,
  destructive = false,
  isLast = false,
  haptic = 'selection',
  accessibilityLabel,
}: ListRowProps) {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.error : colors.primaryText;

  const content = (
    <View style={styles.row}>
      {leadingIcon ? (
        <View style={[styles.leading, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={leadingIcon} size={18} color={colors.accentPrimary} />
        </View>
      ) : null}
      <View style={styles.textColumn}>
        <Text style={[typography.bodyStrong, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.micro, { color: colors.secondaryText }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {trailing ??
          (value ? (
            <Text style={[typography.body, { color: colors.secondaryText }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null)}
        {showChevron && !trailing ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textTertiary}
            style={value ? styles.chevronAfterValue : undefined}
          />
        ) : null}
      </View>
    </View>
  );

  const separator = !isLast ? (
    <View
      style={[
        styles.separator,
        {
          backgroundColor: colors.cardBorder,
          marginLeft: leadingIcon ? LEADING_SIZE + spacing.md : 0,
        },
      ]}
    />
  ) : null;

  if (onPress) {
    return (
      <View>
        <PressableScale
          onPress={onPress}
          haptic={haptic}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
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
    minHeight: layout.minTouchTarget + spacing.sm,
    paddingVertical: spacing.sm,
  },
  leading: {
    width: LEADING_SIZE,
    height: LEADING_SIZE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
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
    marginLeft: spacing.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
