import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { layout, motion, spacing, typography } from '../../../design/system';
import { BackArrowIcon, IconButton } from '../../../components/ui';

interface PlanDetailCompactHeaderProps {
  height: number;
  title: string;
  showOptions: boolean;
  onBack: () => void;
  onOptions: () => void;
}

/**
 * Once the hero has scrolled away, this keeps the status bar backed and the
 * page's title and back control in reach at any scroll offset.
 */
export function PlanDetailCompactHeader({
  height,
  title,
  showOptions,
  onBack,
  onOptions,
}: PlanDetailCompactHeaderProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.fast)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.fast)}
      style={[
        styles.compactHeader,
        {
          height,
          paddingTop: insets.top + spacing.sm,
          backgroundColor: colors.background,
          borderBottomColor: colors.borderStrong,
        },
      ]}
    >
      <IconButton
        icon={BackArrowIcon}
        variant="paper"
        onPress={onBack}
        accessibilityLabel={t('common.back')}
      />
      <Text
        accessibilityRole="header"
        style={[styles.compactHeaderTitle, displayFont.bold, { color: colors.primaryText }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {showOptions ? (
        <IconButton
          icon={Ellipsis}
          variant="paper"
          onPress={onOptions}
          accessibilityLabel={t('readingPlans.planOptions')}
        />
      ) : (
        <View style={styles.compactHeaderSpacer} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  compactHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactHeaderTitle: {
    ...typography.rowTitle,
    flex: 1,
    textAlign: 'center',
  },
  compactHeaderSpacer: {
    width: layout.iconButton,
  },
});
