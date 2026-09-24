import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../../components/ui';
import { useTheme } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';

interface SwipeablePlanRowProps {
  onDelete: () => void;
  children: ReactNode;
}

/** A plan row that swipes left to reveal Delete. */
export function SwipeablePlanRow({ onDelete, children }: SwipeablePlanRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Swipeable
      enableTrackpadTwoFingerGesture
      overshootRight={false}
      rightThreshold={48}
      renderRightActions={(_, __, swipeableMethods) => (
        <View style={styles.actions}>
          <PressableScale
            pressEffect="translate"
            onPress={() => {
              swipeableMethods.close();
              onDelete();
            }}
            style={[styles.deleteButton, { backgroundColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Trash2 size={18} color={colors.onError} strokeWidth={2} />
            <Text style={[styles.deleteText, { color: colors.onError }]}>{t('common.delete')}</Text>
          </PressableScale>
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    width: 92,
    marginVertical: spacing.xs / 2,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  deleteText: {
    ...typography.micro,
  },
});
