import { StyleSheet, Switch, Text, View } from 'react-native';
import {
  Globe,
  KeyRound,
  Layers,
  MapPin,
  MessageSquare,
  Moon,
  Sun,
  Type,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks';
import { AppCard, ListRow, TabSwitch } from '../../../components/ui';
import { spacing, typography } from '../../../design/system';
import type { FeedbackParticipationMode } from '../../../stores/translatorReviewStore';
import { FontSizeStepper } from './FontSizeStepper';
import {
  ICON_STROKE,
  ROW_ICON_SIZE,
  ROW_SEPARATOR_INSET,
  sectionStyles,
  useSettingSwitchColors,
} from './settingsStyles';

// The EL system ships two scopes, so the selector is a two-up segment carrying a
// sun and a moon rather than five labelled swatch chips.
const THEME_SEGMENTS: ReadonlyArray<{
  mode: ThemeMode;
  icon: LucideIcon;
  labelKey: string;
}> = [
  { mode: 'light', icon: Sun, labelKey: 'settings.themeLight' },
  { mode: 'dark', icon: Moon, labelKey: 'settings.themeDark' },
];

interface ReadingSettingsSectionProps {
  onThemeChange: (mode: ThemeMode) => void;
  languageLabel: string;
  onOpenLanguagePicker: () => void;
  localeSummary: string;
  onOpenLocalePreferences: () => void;
  participationMode: FeedbackParticipationMode;
  chapterFeedbackEnabled: boolean;
  chapterFeedbackSummary: string;
  onChapterFeedbackToggle: (enabled: boolean) => void;
  onSelectCommunity: () => void;
  onSelectCouncil: () => void;
  translatorReviewEnabled: boolean;
  onTranslatorReviewToggle: (enabled: boolean) => void;
  identitySummary: string;
  hasIdentity: boolean;
  onEditIdentity: () => void;
  onOpenMyFeedback: () => void;
}

/** Text size, appearance, languages and how this reader takes part in chapter feedback. */
export function ReadingSettingsSection({
  onThemeChange,
  languageLabel,
  onOpenLanguagePicker,
  localeSummary,
  onOpenLocalePreferences,
  participationMode,
  chapterFeedbackEnabled,
  chapterFeedbackSummary,
  onChapterFeedbackToggle,
  onSelectCommunity,
  onSelectCouncil,
  translatorReviewEnabled,
  onTranslatorReviewToggle,
  identitySummary,
  hasIdentity,
  onEditIdentity,
  onOpenMyFeedback,
}: ReadingSettingsSectionProps) {
  const { colors, themeMode } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const switchColors = useSettingSwitchColors();

  // TabSwitch hands back the segment key as a plain string; resolve it against
  // the segment table rather than casting, so an unknown key is simply ignored.
  const handleThemeSegmentChange = (key: string) => {
    const segment = THEME_SEGMENTS.find((candidate) => candidate.mode === key);
    if (!segment) {
      return;
    }
    onThemeChange(segment.mode);
  };

  return (
    <View style={sectionStyles.group}>
      <Text
        accessibilityRole="header"
        style={[sectionStyles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}
      >
        {t('settings.reading')}
      </Text>
      <AppCard padding={0} style={sectionStyles.groupCard}>
        <ListRow
          title={t('settings.fontSize')}
          leadingIcon={Type}
          trailing={<FontSizeStepper />}
          stackTrailingAtLargeText
        />

        {/* Appearance is a block, not a row: the segment needs the full width
            of the card, so the label sits above it rather than beside it. */}
        <View style={styles.themeBlock}>
          <View style={styles.blockHeader}>
            <Moon
              size={ROW_ICON_SIZE}
              color={colors.secondaryText}
              strokeWidth={ICON_STROKE}
              style={styles.blockIcon}
            />
            <Text style={[typography.rowTitle, { color: colors.primaryText }]}>
              {t('settings.themeMode')}
            </Text>
          </View>
          <TabSwitch
            segments={THEME_SEGMENTS.map(({ mode, icon, labelKey }) => ({
              key: mode,
              label: t(labelKey),
              icon,
            }))}
            value={themeMode}
            onChange={handleThemeSegmentChange}
            fullWidth
            accessibilityLabel={t('settings.themeMode')}
          />
        </View>
        <View style={[styles.blockSeparator, { backgroundColor: colors.borderStrong }]} />

        <ListRow
          title={t('settings.language')}
          leadingIcon={Globe}
          value={languageLabel}
          showChevron
          onPress={onOpenLanguagePicker}
        />

        <ListRow
          title={t('settings.nationAndLanguage')}
          leadingIcon={MapPin}
          value={localeSummary}
          showChevron
          onPress={onOpenLocalePreferences}
        />

        <ListRow
          title={t('settings.chapterFeedback')}
          subtitle={chapterFeedbackSummary}
          leadingIcon={MessageSquare}
          trailing={
            <Switch
              value={chapterFeedbackEnabled}
              onValueChange={onChapterFeedbackToggle}
              {...switchColors}
              accessibilityLabel={t('settings.chapterFeedback')}
            />
          }
        />

        {/* Tapping anywhere on this row toggles review mode, exactly as it
            did before the redesign — the switch is the visible state. */}
        {chapterFeedbackEnabled ? (
          <>
            <ListRow
              title={t('feedback.community')}
              leadingIcon={User}
              value={participationMode === 'community' ? '✓' : undefined}
              accessibilityLabel={t('feedback.community')}
              onPress={onSelectCommunity}
            />
            <ListRow
              title={t('feedback.council')}
              leadingIcon={KeyRound}
              subtitle={t('feedback.councilCodeRequired')}
              value={participationMode === 'scripture_council' ? '✓' : undefined}
              accessibilityLabel={t('feedback.council')}
              onPress={onSelectCouncil}
            />
          </>
        ) : null}

        <ListRow
          title={t('settings.translatorAccess')}
          subtitle={
            translatorReviewEnabled
              ? t('settings.translatorAccessSummaryOn')
              : t('settings.translatorAccessSummaryOff')
          }
          leadingIcon={KeyRound}
          onPress={() => onTranslatorReviewToggle(!translatorReviewEnabled)}
          accessibilityLabel={t('settings.translatorAccess')}
          trailing={
            <Switch
              value={translatorReviewEnabled}
              onValueChange={onTranslatorReviewToggle}
              {...switchColors}
              accessibilityLabel={t('settings.translatorAccess')}
            />
          }
        />

        <ListRow
          title={t('settings.chapterFeedbackIdentity')}
          subtitle={identitySummary}
          leadingIcon={User}
          value={hasIdentity ? t('common.edit') : t('common.notSet')}
          showChevron
          onPress={onEditIdentity}
          isLast={!chapterFeedbackEnabled}
        />

        {chapterFeedbackEnabled ? (
          <ListRow
            title={t('myFeedback.settingsRow')}
            subtitle={t('myFeedback.settingsRowSummary')}
            leadingIcon={Layers}
            showChevron
            onPress={onOpenMyFeedback}
            isLast
          />
        ) : null}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  themeBlock: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockIcon: {
    marginRight: spacing.md,
  },
  blockSeparator: {
    height: 1,
    marginLeft: ROW_SEPARATOR_INSET,
  },
});
