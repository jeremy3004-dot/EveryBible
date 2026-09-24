import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../design/system';
import { resolveTranslatorCoverageOptions } from '../../services/feedback';
import { useBibleStore } from '../../stores/bibleStore';
import { AppButton } from '../ui';
import { announceLiveRegionText } from '../../utils/a11y';

// Shown when a team passcode does not open the translation on screen (server code
// translation_not_covered). Names the translations the code does open and switches the reader
// to one of them. `coveredTranslationIds` is undefined when that list could not be fetched.
export function TranslationNotCoveredNotice({
  translationId,
  coveredTranslationIds,
  onRetry,
  onSwitched,
  tone = 'app',
}: {
  translationId: string;
  coveredTranslationIds: string[] | undefined;
  onRetry?: () => void;
  onSwitched?: (translationId: string) => void;
  tone?: 'app' | 'reader';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const translations = useBibleStore((state) => state.translations);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const [needsDownload, setNeedsDownload] = useState<string | null>(null);

  const primaryText = tone === 'reader' ? colors.biblePrimaryText : colors.primaryText;
  const secondaryText = tone === 'reader' ? colors.bibleSecondaryText : colors.secondaryText;
  const currentLabel =
    translations.find((translation) => translation.id === translationId)?.name.trim() ||
    translationId;
  const options = coveredTranslationIds
    ? resolveTranslatorCoverageOptions(coveredTranslationIds, translations, translationId)
    : null;

  const switchTo = (id: string, label: string) => {
    // setCurrentTranslation silently refuses a translation this device cannot open yet
    // (text pack not downloaded), so check the outcome rather than assuming it switched.
    setCurrentTranslation(id);
    if (useBibleStore.getState().currentTranslation === id) {
      setNeedsDownload(null);
      onSwitched?.(id);
    } else {
      setNeedsDownload(label);
      // accessibilityLiveRegion below is Android-only; VoiceOver needs the announcement.
      announceLiveRegionText(t('translatorQueue.switchNeedsDownload', { translation: label }));
    }
  };

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={[styles.title, { color: primaryText }]}>
        {t('translatorQueue.notCoveredTitle', { translation: currentLabel })}
      </Text>
      {options === null ? (
        onRetry ? (
          <AppButton
            label={t('common.retry')}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={onRetry}
          />
        ) : null
      ) : options.length === 0 ? (
        <Text style={[styles.body, { color: secondaryText }]}>
          {t('translatorQueue.notCoveredNone')}
        </Text>
      ) : (
        <>
          <Text style={[styles.body, { color: secondaryText }]}>
            {t('translatorQueue.notCoveredBody')}
          </Text>
          {options.map((option) => (
            <AppButton
              key={option.id}
              label={t('translatorQueue.switchTo', { translation: option.label })}
              variant="secondary"
              size="md"
              onPress={() => switchTo(option.id, option.label)}
            />
          ))}
          {needsDownload ? (
            <Text style={[styles.body, { color: colors.error }]}>
              {t('translatorQueue.switchNeedsDownload', { translation: needsDownload })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  title: {
    ...typography.bodyStrong,
  },
  body: {
    ...typography.body,
  },
});
