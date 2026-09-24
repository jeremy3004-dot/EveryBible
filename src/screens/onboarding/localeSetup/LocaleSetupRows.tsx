// Row components are extracted and memoized (keyed by stable id) so a keystroke
// that only changes one row's selection — or leaves the visible set unchanged —
// doesn't re-render every visible row of the virtualized list. Props are kept
// primitive/stable (precomputed labels + a stable onSelect callback) so
// React.memo's shallow compare actually skips unchanged rows.
//
// `position` is what replaces the old AppCard wrapper around a whole section:
// each row now paints the slice of the grouped card it occupies. Rows that still
// sit inside a real AppCard (the pinned recommendation, the interface-language
// list) pass no position and render bare, exactly as before.
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, type TextStyle, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import type { Language } from '../../../constants/languages';
import type { LocaleLanguage } from '../../../services/onboarding/localeSelection';
import type { BibleTranslation } from '../../../types';
import { ProgressBar } from '../../../components/ui';
import { GroupedRowCard } from '../LocaleSetupList';
import type { LocaleSetupGroupPosition } from '../localeSetupListModel';
import { OptionRow, SelectionMark, StatusChip } from './LocaleSetupOptionRow';

interface CountryRowProps {
  countryCode: string;
  countryName: string;
  countrySubtitle: string;
  isSelected: boolean;
  isLast: boolean;
  position?: LocaleSetupGroupPosition;
  colors: ThemeColors;
  onSelect: (countryCode: string) => void;
}

export const CountryRow = memo(function CountryRow({
  countryCode,
  countryName,
  countrySubtitle,
  isSelected,
  isLast,
  position,
  colors,
  onSelect,
}: CountryRowProps) {
  const row = (
    <OptionRow
      title={countryName}
      subtitle={countrySubtitle}
      isLast={isLast}
      colors={colors}
      isSelected={isSelected}
      trailing={<SelectionMark isSelected={isSelected} colors={colors} />}
      onPress={() => onSelect(countryCode)}
    />
  );

  return position ? <GroupedRowCard position={position}>{row}</GroupedRowCard> : row;
});

interface LanguageRowProps {
  language: LocaleLanguage;
  isRecommended: boolean;
  isSelected: boolean;
  isLast: boolean;
  position?: LocaleSetupGroupPosition;
  recommendedBadgeLabel: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  onSelect: (languageCode: string) => void;
}

export const LanguageRow = memo(function LanguageRow({
  language,
  isRecommended,
  isSelected,
  isLast,
  position,
  recommendedBadgeLabel,
  colors,
  eyebrowFont,
  onSelect,
}: LanguageRowProps) {
  const row = (
    <OptionRow
      title={language.nativeName}
      subtitle={language.name}
      isLast={isLast}
      colors={colors}
      isSelected={isSelected}
      statusLabel={isRecommended ? recommendedBadgeLabel : null}
      statusChip={
        isRecommended ? (
          <StatusChip label={recommendedBadgeLabel} colors={colors} eyebrowFont={eyebrowFont} />
        ) : null
      }
      trailing={<SelectionMark isSelected={isSelected} colors={colors} />}
      onPress={() => onSelect(language.code)}
    />
  );

  return position ? <GroupedRowCard position={position}>{row}</GroupedRowCard> : row;
});

interface OnboardingLanguageRowProps {
  translation: BibleTranslation;
  optionLabel: string;
  translationLabel: string;
  availabilitySummary: string;
  /** null: the row wears no chip (a Bible that ships with the app). */
  statusLabel: string | null;
  recommendedBadgeLabel: string;
  downloadingLabel: string;
  isRecommended: boolean;
  isInstalling: boolean;
  isLast: boolean;
  position?: LocaleSetupGroupPosition;
  progress: number | null;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  onPress: (translation: BibleTranslation) => void;
}

export const OnboardingLanguageRow = memo(function OnboardingLanguageRow({
  translation,
  optionLabel,
  translationLabel,
  availabilitySummary,
  statusLabel,
  recommendedBadgeLabel,
  downloadingLabel,
  isRecommended,
  isInstalling,
  isLast,
  position,
  progress,
  colors,
  eyebrowFont,
  onPress,
}: OnboardingLanguageRowProps) {
  const trailing = isInstalling ? (
    progress != null ? (
      <View style={styles.downloadProgress}>
        <ProgressBar progress={progress / 100} />
      </View>
    ) : (
      <ActivityIndicator color={colors.accentPrimary} />
    )
  ) : (
    <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
  );
  // A queued or downloading row shows progress instead of its chip.
  const chipLabel = isInstalling ? null : isRecommended ? recommendedBadgeLabel : statusLabel;
  const statusChip = chipLabel ? (
    <StatusChip label={chipLabel} colors={colors} eyebrowFont={eyebrowFont} />
  ) : null;

  const row = (
    <OptionRow
      title={optionLabel}
      subtitle={
        isInstalling && progress != null
          ? `${downloadingLabel} ${progress}%`
          : `${translationLabel} · ${availabilitySummary}`
      }
      isLast={isLast}
      disabled={isInstalling}
      colors={colors}
      statusLabel={chipLabel}
      isBusy={isInstalling}
      progress={progress}
      statusChip={statusChip}
      trailing={trailing}
      onPress={() => onPress(translation)}
    />
  );

  return position ? <GroupedRowCard position={position}>{row}</GroupedRowCard> : row;
});

interface InterfaceLanguageRowProps {
  language: Language;
  isSelected: boolean;
  isLast: boolean;
  colors: ThemeColors;
  onSelect: (language: Language) => void;
}

export const InterfaceLanguageRow = memo(function InterfaceLanguageRow({
  language,
  isSelected,
  isLast,
  colors,
  onSelect,
}: InterfaceLanguageRowProps) {
  return (
    <OptionRow
      title={language.nativeName}
      subtitle={language.nativeName !== language.name ? language.name : null}
      isLast={isLast}
      colors={colors}
      // Read by its own name (and English name), as shown; its "App language"
      // phrase named every row the same and left English with no name at all.
      isSelected={isSelected}
      trailing={<SelectionMark isSelected={isSelected} colors={colors} />}
      onPress={() => onSelect(language)}
    />
  );
});

const styles = StyleSheet.create({
  downloadProgress: {
    width: 72,
  },
});
