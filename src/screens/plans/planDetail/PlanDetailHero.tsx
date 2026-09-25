import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { layout, spacing, typography } from '../../../design/system';
import { BackArrowIcon, IconButton } from '../../../components/ui';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import type { getReadingPlanCoverSource } from '../../../services/plans/readingPlanAssets';

/** Space between the cover plate's lower edge and the title block. */
export const HERO_TITLE_GAP = spacing.lg;
/** Back / more controls float this far down the cover on a standard notch. */
const COVER_CONTROL_TOP = 62;

interface PlanDetailHeroProps {
  coverSource: ReturnType<typeof getReadingPlanCoverSource>;
  /** From getPlanCoverHeight: the whole 4:3 plate on a phone, capped when wide. */
  coverHeight: number;
  eyebrow: string | null;
  title: string;
  /** Enrolled plans offer their options (leave plan) beside the back control. */
  showOptions: boolean;
  onBack: () => void;
  onOptions: () => void;
}

/**
 * The plan's cover plate, shown whole and unscrimmed, with the eyebrow and title
 * set beneath it in page ink. The covers are flat marks on paper and dark
 * grounds, so text laid over them would need a scrim that muddies the art.
 */
export function PlanDetailHero({
  coverSource,
  coverHeight,
  eyebrow,
  title,
  showOptions,
  onBack,
  onOptions,
}: PlanDetailHeroProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const controlTop = Math.max(insets.top + spacing.sm, COVER_CONTROL_TOP);

  return (
    <View>
      <View style={{ height: coverHeight }}>
        {coverSource ? (
          <Image
            source={coverSource}
            style={[styles.coverImage, { height: coverHeight }]}
            resizeMode="cover"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <View
            style={[
              styles.coverImage,
              styles.coverFallback,
              { height: coverHeight, backgroundColor: colors.accentSecondary },
            ]}
          >
            <BookOpen size={60} color={colors.secondaryText} strokeWidth={2} />
          </View>
        )}

        <View style={[styles.coverControls, { top: controlTop }]} pointerEvents="box-none">
          <IconButton
            icon={BackArrowIcon}
            variant="paper"
            onPress={onBack}
            accessibilityLabel={t('common.back')}
          />
          {showOptions ? (
            <IconButton
              icon={Ellipsis}
              variant="paper"
              onPress={onOptions}
              accessibilityLabel={t('readingPlans.planOptions')}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.titleBlock}>
        {eyebrow ? (
          <Text
            style={[styles.eyebrow, displayFont.regular, { color: colors.secondaryText }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          accessibilityRole="header"
          style={[styles.title, displayFont.bold, { color: colors.primaryText }]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The asset registry stamps a required image's intrinsic size onto its style,
  // and inset-only positioning does not override it — a 1440×1080 cover would
  // draw at its pixel size in the corner. The hero states its own frame instead,
  // so the plate fills the full width and bleeds up under the status bar.
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverControls: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: {
    marginTop: HERO_TITLE_GAP,
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.eyebrow,
  },
  title: {
    ...typography.screenTitle,
  },
});
