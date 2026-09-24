import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useLargeText } from '../../../hooks/useLargeText';
import { typography } from '../../../design/system';
import { PRESSED_SCALE } from './annotationActionSheetModel';

interface ActionPillProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** One verse action (Note, Copy, Share, ...) in the sheet's action rail. */
export function ActionPill({ icon, label, onPress, disabled = false }: ActionPillProps) {
  const { colors } = useTheme();
  // Past the shared large-text threshold five pills no longer fit one row with
  // readable labels, so the rail wraps to three per row instead of shrinking.
  const { isLargeText } = useLargeText();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        isLargeText ? styles.actionButtonLargeText : null,
        {
          backgroundColor: colors.bibleElevatedSurface,
          borderColor: colors.bibleDivider,
          opacity: disabled ? 0.44 : 1,
          transform: [{ scale: pressed && !disabled ? PRESSED_SCALE : 1 }],
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Named explicitly: Android otherwise folds the icon-font glyph into the
      // name it derives from the pill's children.
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Ionicons
        name={icon}
        size={16}
        color={disabled ? colors.bibleSecondaryText : colors.biblePrimaryText}
      />
      <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 3,
  },
  actionButtonLargeText: {
    flexBasis: '30%',
  },
  actionLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
});
