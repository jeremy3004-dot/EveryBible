import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { layout, spacing, typography } from '../../../design/system';
import { BackArrowIcon, IconButton } from '../../../components/ui';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import type { getReadingPlanCoverSource } from '../../../services/plans/readingPlanAssets';

/** The photographic hero. Its lower third fades into the page background. */
export const COVER_HEIGHT = 360;
/** How far the content column rises into the cover's fade. */
export const COVER_CONTENT_OVERLAP = 71;
/** Distance from the cover's lower edge to the baseline block of the hero text. */
export const HERO_TEXT_BOTTOM = 94;
/** Back / more controls float this far down the cover on a standard notch. */
const COVER_CONTROL_TOP = 62;

// The hero sits over a photograph, so these two cannot come from the theme:
// they must read identically in both scopes or they vanish against the image.
const ON_PHOTO_TEXT = '#FDFAF5';
const ON_PHOTO_EYEBROW = 'rgba(253, 250, 245, 0.82)';
// Readability scrim: dark at the very top (so the controls hold), almost clear
// through the photograph's subject, then deepening into the page background.
const COVER_SCRIM_STOPS = [
  'rgba(12, 11, 9, 0.4)',
  'rgba(12, 11, 9, 0.05)',
  'rgba(12, 11, 9, 0.55)',
  'rgba(12, 11, 9, 0.82)',
] as const;
const COVER_SCRIM_LOCATIONS: readonly [number, number, ...number[]] = [0, 0.25, 0.52, 0.78, 1];

interface PlanDetailHeroProps {
  coverSource: ReturnType<typeof getReadingPlanCoverSource>;
  eyebrow: string | null;
  title: string;
  /** Enrolled plans offer their options (leave plan) beside the back control. */
  showOptions: boolean;
  onBack: () => void;
  onOptions: () => void;
}

/** The cover photograph with the plan's eyebrow and title set on it. */
export function PlanDetailHero({
  coverSource,
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
  const scrimColors = useMemo(
    () =>
      [...COVER_SCRIM_STOPS, colors.background] as readonly [
        ColorValue,
        ColorValue,
        ...ColorValue[],
      ],
    [colors.background]
  );

  return (
    <View style={styles.cover}>
      {coverSource ? (
        <Image
          source={coverSource}
          style={styles.coverImage}
          resizeMode="cover"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <View
          style={[
            styles.coverImage,
            styles.coverFallback,
            { backgroundColor: colors.accentSecondary },
          ]}
        >
          <BookOpen size={60} color={colors.secondaryText} strokeWidth={2} />
        </View>
      )}

      {/* The cover is always a photographic hero, so the scrim and the text on
          it are fixed on-photo values in both scopes; only the final stop is
          themed, so the image dissolves into the page. */}
      <LinearGradient
        colors={scrimColors}
        locations={COVER_SCRIM_LOCATIONS}
        style={styles.coverScrim}
      />

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

      <View style={styles.coverTitleWrap}>
        {eyebrow ? (
          <Text
            style={[styles.coverEyebrow, displayFont.regular]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          accessibilityRole="header"
          style={[styles.coverTitle, displayFont.bold]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: COVER_HEIGHT,
  },
  // The asset registry stamps a required image's intrinsic size onto its style,
  // and inset-only positioning does not override it — a 320×180 cover would draw
  // at 320×180 in the corner. The hero states its own frame instead, so the photo
  // fills the full width and bleeds up under the status bar.
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: COVER_HEIGHT,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  coverControls: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverTitleWrap: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: HERO_TEXT_BOTTOM,
    gap: spacing.sm,
  },
  coverEyebrow: {
    ...typography.eyebrow,
    color: ON_PHOTO_EYEBROW,
  },
  coverTitle: {
    ...typography.screenTitle,
    color: ON_PHOTO_TEXT,
  },
});
