import { memo, useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';

interface AudioPlaybackErrorNoticeProps {
  message: string;
}

/**
 * Why the chapter is not playing, under or above its Play button (which tries again).
 * Screen readers hear it when it appears: the button only changes from a spinner back
 * to Play, which says nothing about a failure.
 */
export const AudioPlaybackErrorNotice = memo(function AudioPlaybackErrorNotice({
  message,
}: AudioPlaybackErrorNoticeProps) {
  const { colors } = useTheme();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.error },
      ]}
    >
      <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
      <Text style={[styles.text, { color: colors.biblePrimaryText }]}>{message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  text: {
    flexShrink: 1,
    ...typography.micro,
    fontWeight: '600',
  },
});
