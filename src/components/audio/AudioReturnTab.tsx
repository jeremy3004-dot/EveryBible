import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { getCompactTranslatedBookName } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, shadows, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';
import { useTabBarHeight } from '../../hooks';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { useAudioStore } from '../../stores/audioStore';
import { useBibleStore } from '../../stores/bibleStore';

interface AudioReturnTabProps {
  currentRouteName: string | null;
}

export function AudioReturnTab({ currentRouteName }: AudioReturnTabProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { height: tabBarHeight } = useTabBarHeight();
  const status = useAudioStore((state) => state.status);
  const currentTranslationId = useAudioStore((state) => state.currentTranslationId);
  const currentBookId = useAudioStore((state) => state.currentBookId);
  const currentChapter = useAudioStore((state) => state.currentChapter);
  const lastPlayedTranslationId = useAudioStore((state) => state.lastPlayedTranslationId);
  const audioReturnTarget = useAudioStore((state) => state.audioReturnTarget);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);

  const hasActiveAudioRoute = status === 'playing';
  const resolvedBookId = currentBookId ?? audioReturnTarget?.bookId ?? null;
  const resolvedChapter = currentChapter ?? audioReturnTarget?.chapter ?? null;
  const resolvedTranslationId =
    currentTranslationId ??
    audioReturnTarget?.translationId ??
    lastPlayedTranslationId ??
    currentTranslation;

  if (!audioReturnTarget || !hasActiveAudioRoute || currentRouteName === 'BibleReader') {
    return null;
  }

  if (!resolvedBookId || resolvedChapter == null) {
    return null;
  }

  const target = audioReturnTarget;
  const referenceLabel = `${getCompactTranslatedBookName(resolvedBookId, t)} ${resolvedChapter}`;

  return (
    <Animated.View
      entering={SlideInRight.springify().damping(20).stiffness(180)}
      exiting={SlideOutRight.duration(180)}
      pointerEvents="box-none"
      style={[
        styles.shell,
        {
          bottom: tabBarHeight + spacing.xxl,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={referenceLabel}
        hitSlop={8}
        onPress={() => {
          if (!rootNavigationRef.isReady()) {
            return;
          }

          if (resolvedTranslationId && resolvedTranslationId !== currentTranslation) {
            setCurrentTranslation(resolvedTranslationId);
          }

          rootNavigationRef.navigate('Bible', {
            screen: 'BibleReader',
            params: {
              bookId: resolvedBookId,
              chapter: resolvedChapter,
              preferredMode: target.preferredMode,
              ...(target.planId ? { planId: target.planId } : {}),
              ...(typeof target.planDayNumber === 'number'
                ? { planDayNumber: target.planDayNumber }
                : {}),
              ...(target.planSessionKey ? { planSessionKey: target.planSessionKey } : {}),
              ...(target.returnToPlanOnComplete ? { returnToPlanOnComplete: true } : {}),
              ...(target.sessionContext ? { sessionContext: target.sessionContext } : {}),
            },
          });
        }}
        style={({ pressed }) => [
          styles.tab,
          {
            backgroundColor: colors.accentPrimary,
            borderColor: hexWithAlpha(colors.onAccent, 0.78),
            transform: [{ rotate: '-90deg' }, { scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.label, { color: colors.onAccent }]}>
          {referenceLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    right: -59,
    zIndex: 40,
  },
  tab: {
    ...shadows.floating,
    width: 148,
    height: 30,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    transform: [{ rotate: '-90deg' }],
  },
  label: {
    ...typography.label,
    letterSpacing: 0.4,
  },
});
