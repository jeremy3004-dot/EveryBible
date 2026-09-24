import { StyleSheet, Text, type TextStyle, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import {
  SUPPORTED_LANGUAGES,
  type Language,
  type LanguageCode,
} from '../../../constants/languages';
import { layout, spacing, typography } from '../../../design/system';
import { AppButton, AppCard } from '../../../components/ui';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import { useLargeText } from '../../../hooks/useLargeText';
import { getLocaleOptionRowAccessibility } from '../localeOptionRowAccessibility';
import {
  SUGGESTED_MARK_SIZE,
  SelectionMark,
  StatusChip,
  optionRowStyles,
} from './LocaleSetupOptionRow';
import { InterfaceLanguageRow } from './LocaleSetupRows';

interface InterfaceLanguageListProps {
  selectedCode: LanguageCode;
  colors: ThemeColors;
  onSelect: (language: Language) => void;
  testID?: string;
}

/**
 * The interface-language list is the one list on this flow that stays a plain
 * mapped AppCard: it is a fixed 21 rows, so virtualizing it would cost more
 * than it saves. It renders as a single list item / header block instead.
 */
export function InterfaceLanguageList({
  selectedCode,
  colors,
  onSelect,
  testID,
}: InterfaceLanguageListProps) {
  return (
    <View testID={testID}>
      <AppCard padding={0}>
        {SUPPORTED_LANGUAGES.map((language, index) => (
          <InterfaceLanguageRow
            key={language.code}
            language={language}
            isSelected={selectedCode === language.code}
            isLast={index === SUPPORTED_LANGUAGES.length - 1}
            colors={colors}
            onSelect={onSelect}
          />
        ))}
      </AppCard>
    </View>
  );
}

interface LocaleSetupEmptyCardProps {
  title: string;
  body: string;
  colors: ThemeColors;
  retry?: () => void;
}

/** "No nations found", or the catalog-unreachable card with its Retry. */
export function LocaleSetupEmptyCard({ title, body, colors, retry }: LocaleSetupEmptyCardProps) {
  const { t } = useTranslation();
  return (
    <AppCard padding={layout.cardPaddingWide} style={styles.emptyCard}>
      <Text style={[typography.cardTitle, { color: colors.primaryText }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>{body}</Text>
      {retry ? (
        <View style={styles.emptyCta} testID="onboarding-runtime-catalog-retry">
          <AppButton
            label={t('common.retry')}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={retry}
          />
        </View>
      ) : null}
    </AppCard>
  );
}

/**
 * Same card and row height as the pinned Bible, so nothing below it moves when
 * the recommendation lands. Hidden from screen readers: it says nothing.
 */
export function PrimaryOptionPlaceholder() {
  return (
    <View
      testID="onboarding-primary-recommendation-placeholder"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppCard accentRule padding={0}>
        <View style={optionRowStyles.optionRow}>
          <View style={styles.placeholderCopy}>
            <Skeleton width="45%" height={16} />
            <Skeleton width="70%" height={12} />
          </View>
        </View>
      </AppCard>
    </View>
  );
}

interface SuggestedCountryCardProps {
  countryCode: string;
  countryName: string;
  countrySubtitle: string;
  isSelected: boolean;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  onSelect: (countryCode: string) => void;
}

/** The device's nation, pinned above the list in an accent-rule card. */
export function SuggestedCountryCard({
  countryCode,
  countryName,
  countrySubtitle,
  isSelected,
  colors,
  eyebrowFont,
  onSelect,
}: SuggestedCountryCardProps) {
  const { t } = useTranslation();
  const { isLargeText } = useLargeText();
  const countryA11y = getLocaleOptionRowAccessibility({
    title: countryName,
    subtitle: countrySubtitle,
    statusLabel: t('onboarding.suggestedBadge'),
    isSelected,
  });
  const suggestedChip = (
    <StatusChip label={t('onboarding.suggestedBadge')} colors={colors} eyebrowFont={eyebrowFont} />
  );

  return (
    <AppCard
      accentRule
      pressable
      padding={layout.cardPadding}
      accessibilityLabel={countryA11y.label}
      accessibilityState={countryA11y.state}
      onPress={() => onSelect(countryCode)}
    >
      <View style={styles.suggestedRow}>
        <View style={optionRowStyles.optionRowCopy}>
          <Text style={[styles.suggestedTitle, { color: colors.primaryText }]} numberOfLines={2}>
            {countryName}
          </Text>
          <Text
            style={[styles.suggestedSubtitle, { color: colors.secondaryText }]}
            numberOfLines={2}
          >
            {countrySubtitle}
          </Text>
          {isLargeText ? <View style={optionRowStyles.chipBelowCopy}>{suggestedChip}</View> : null}
        </View>
        {isLargeText ? null : suggestedChip}
        <SelectionMark isSelected={isSelected} colors={colors} size={SUGGESTED_MARK_SIZE} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  placeholderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestedTitle: {
    ...typography.cardTitle,
  },
  suggestedSubtitle: {
    ...typography.captionStrong,
    fontWeight: '400',
  },
  emptyCard: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    lineHeight: 22,
  },
  emptyCta: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
});
