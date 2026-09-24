import { Alert } from 'react-native';

type FinishFailureCopyKey =
  | 'common.somethingWentWrong'
  | 'common.unexpectedError'
  | 'common.cancel'
  | 'common.retry';

/**
 * Shown when the Bible is ready (downloaded or already on the device) but finishing setup
 * threw, for example while switching the interface language. Onboarding stays open, so
 * Retry finishes it with the same Bible without downloading it again.
 */
export function showOnboardingFinishFailedAlert(
  t: (key: FinishFailureCopyKey) => string,
  onRetry: () => void
): void {
  Alert.alert(t('common.somethingWentWrong'), t('common.unexpectedError'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.retry'), onPress: onRetry },
  ]);
}
