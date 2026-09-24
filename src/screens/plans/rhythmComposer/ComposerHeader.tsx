import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { layout, radius, spacing, typography } from '../../../design/system';
import { RHYTHM_PRESET_LIBRARY } from '../../../services/plans/rhythmPresets';
import { MetaPill, metaPillRowStyle } from './MetaPill';

/** Back and the screen title, then the "Historic rhythms" hero card. */
export function ComposerHeader({ isEditing, onBack }: { isEditing: boolean; onBack: () => void }) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[
            styles.backButton,
            { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
          ]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={[styles.screenTitle, displayFont.bold, { color: colors.primaryText }]}
          >
            {isEditing ? t('readingPlans.editRhythm') : t('readingPlans.createRhythm')}
          </Text>
          <Text style={[styles.screenSubtitle, { color: colors.secondaryText }]}>
            {t('plans.rhythmComposer.subtitle')}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.heroCard,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <Text style={[styles.heroEyebrow, { color: colors.accentPrimary }]}>
          {t('plans.rhythmComposer.heroEyebrow')}
        </Text>
        <Text accessibilityRole="header" style={[styles.heroTitle, { color: colors.primaryText }]}>
          {t('plans.rhythmComposer.heroTitle')}
        </Text>
        <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
          {t('plans.rhythmComposer.heroBody')}
        </Text>
        <View style={metaPillRowStyle}>
          <MetaPill
            label={t('plans.rhythmComposer.presetCount', { count: RHYTHM_PRESET_LIBRARY.length })}
            colors={colors}
            accent
          />
          <MetaPill label={t('plans.rhythmComposer.prayerAndScripture')} colors={colors} />
          <MetaPill label={t('plans.rhythmComposer.tapToAdd')} colors={colors} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  backButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  screenTitle: {
    ...typography.screenTitle,
  },
  screenSubtitle: {
    ...typography.body,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  heroEyebrow: {
    ...typography.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typography.sectionTitle,
  },
  heroBody: {
    ...typography.body,
  },
});
