import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { useDisplayFont } from '../../../hooks';

interface BibleBrowserHeaderProps {
  translationName: string | undefined;
  translationAbbreviation: string | undefined;
  /** Present only as the BiblePicker modal. */
  onDismiss?: () => void;
  /** Present only for translator reviewers. */
  onOpenTranslatorQueue?: () => void;
  /** Present only on the tab screen, when more than one translation is offered. */
  onOpenTranslationPicker?: () => void;
  /** The search field, rendered under the title row. */
  children: ReactNode;
}

/** Title, current translation, the modal close, queue and translation controls. */
export function BibleBrowserHeader({
  translationName,
  translationAbbreviation,
  onDismiss,
  onOpenTranslatorQueue,
  onOpenTranslationPicker,
  children,
}: BibleBrowserHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const translationLabel = translationName || t('about.bereanBible');
  const controlChrome = { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider };

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.titleCluster}>
          {onDismiss ? (
            <TouchableOpacity
              style={[styles.dismissButton, controlChrome]}
              onPress={onDismiss}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <Ionicons name="close" size={18} color={colors.biblePrimaryText} />
            </TouchableOpacity>
          ) : null}
          <View>
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
              accessibilityRole="header"
              style={[styles.title, displayFont.bold, { color: colors.biblePrimaryText }]}
            >
              {t('bible.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
              {translationLabel}
            </Text>
          </View>
        </View>

        <View style={styles.actionCluster}>
          {onOpenTranslatorQueue ? (
            <TouchableOpacity
              style={[styles.iconButton, controlChrome]}
              onPress={onOpenTranslatorQueue}
              activeOpacity={0.85}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityLabel={t('translatorQueue.title')}
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.biblePrimaryText} />
            </TouchableOpacity>
          ) : null}

          {onOpenTranslationPicker ? (
            <TouchableOpacity
              style={[styles.translationButton, controlChrome]}
              onPress={onOpenTranslationPicker}
              activeOpacity={0.85}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityLabel={t('bible.selectTranslation')}
              accessibilityValue={{ text: translationLabel }}
            >
              <Ionicons name="book-outline" size={16} color={colors.bibleSecondaryText} />
              <Text style={[styles.translationButtonText, { color: colors.biblePrimaryText }]}>
                {translationAbbreviation || 'BSB'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    ...typography.screenTitle,
    fontSize: 32,
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.micro,
  },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    minHeight: 42,
    minWidth: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translationButton: {
    minHeight: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  translationButtonText: {
    ...typography.label,
  },
  dismissButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
