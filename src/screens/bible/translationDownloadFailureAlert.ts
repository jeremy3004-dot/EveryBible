import { Alert } from 'react-native';

type DownloadFailureCopyKey =
  | 'bible.translationDownloadFailedTitle'
  | 'bible.translationDownloadFailed'
  | 'common.cancel'
  | 'common.retry';

/**
 * Shown when a Bible text pack fails to download, from onboarding and from the translation
 * picker. Both used to show bible.failedToLoad, which talks about a chapter; this names the
 * download and the two usual causes (connection, storage), and offers to try again.
 */
export function showTranslationDownloadFailedAlert(
  t: (key: DownloadFailureCopyKey) => string,
  onRetry: () => void
): void {
  Alert.alert(t('bible.translationDownloadFailedTitle'), t('bible.translationDownloadFailed'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.retry'), onPress: onRetry },
  ]);
}

/**
 * Records a failed text-pack download for crash reporting. The crash queue is loaded on failure
 * only (it opens MMKV, which first-launch setup does not otherwise need), and reporting never
 * throws into the download flow.
 */
export function reportTranslationDownloadFailure(error: unknown): void {
  void import('../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('textPack.install', error))
    .catch(() => undefined);
}
