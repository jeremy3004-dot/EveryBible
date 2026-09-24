import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { announceLiveRegionText } from '../../../utils/a11y';
import { TranslationPickerHeader } from '../TranslationPickerHeader';

type TranslationPickerListComponent =
  typeof import('../TranslationPickerList').TranslationPickerList;

function loadTranslationPickerList(): Promise<TranslationPickerListComponent> {
  return import('../TranslationPickerList').then((module) => module.TranslationPickerList);
}

/**
 * The crash queue opens MMKV, so it is loaded only when there is something to report, and
 * reporting never throws into the sheet.
 */
function reportPickerLoadFailure(error: unknown): void {
  void import('../../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('browser.pickerLoad', error))
    .catch(() => undefined);
}

/**
 * The browser's translation bottom sheet. The shared picker (catalog and audio
 * helpers) is imported only the first time the sheet opens, keeping it out of
 * the browser's first render. If that import fails, the sheet says so and
 * offers a retry instead of spinning forever.
 */
export function TranslationPickerSheet({
  visible,
  onClose,
  loadPickerList = loadTranslationPickerList,
}: {
  visible: boolean;
  onClose: () => void;
  /** Test seam; defaults to the lazy import of the shared picker. */
  loadPickerList?: () => Promise<TranslationPickerListComponent>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [TranslationPickerComponent, setTranslationPickerComponent] =
    useState<TranslationPickerListComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedMessage = t('common.somethingWentWrong');

  useEffect(() => {
    if (!visible || TranslationPickerComponent || loadFailed) {
      return;
    }

    let isMounted = true;

    loadPickerList().then(
      (component) => {
        if (isMounted) {
          setTranslationPickerComponent(() => component);
        }
      },
      (error: unknown) => {
        reportPickerLoadFailure(error);
        if (isMounted) {
          setLoadFailed(true);
          // The message's live region speaks on Android; VoiceOver needs the announcement.
          announceLiveRegionText(loadFailedMessage);
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [TranslationPickerComponent, loadFailed, loadFailedMessage, loadPickerList, visible]);

  const retryLoad = useCallback(() => setLoadFailed(false), []);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={onClose}
      >
        <View
          style={[
            styles.content,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <TranslationPickerHeader
            onClose={onClose}
            style={styles.header}
            titleStyle={styles.title}
          />
          {TranslationPickerComponent ? (
            <TranslationPickerComponent onRequestClose={onClose} />
          ) : loadFailed ? (
            <View style={styles.loading}>
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.errorText, { color: colors.biblePrimaryText }]}
              >
                {loadFailedMessage}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={retryLoad}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
              >
                <Text style={[styles.retryText, { color: colors.bibleAccent }]}>
                  {t('common.retry')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.bibleAccent} />
              <Text style={[styles.loadingText, { color: colors.bibleSecondaryText }]}>
                {t('common.loading')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingTop: layout.denseCardPadding,
    height: '60%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.cardTitle,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.label,
  },
  errorText: {
    ...typography.bodyStrong,
    textAlign: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  retryButton: {
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...typography.label,
  },
});
