import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ResetHeading } from './ResetHeading';
import { ResetPrimaryButton, ResetSecondaryButton } from './ResetButtons';
import { useResetPasswordStyles } from './resetPasswordStyles';
import type { ResetPasswordFlow } from './useResetPasswordFlow';

type ResetConfirmStepProps = Pick<
  ResetPasswordFlow,
  'signedInUserId' | 'isActivating' | 'confirmAccount' | 'cancel'
>;

/** Asks before the link's code is exchanged, and warns a signed-in reader it signs them out. */
export function ResetConfirmStep({
  signedInUserId,
  isActivating,
  confirmAccount,
  cancel,
}: ResetConfirmStepProps) {
  const { t } = useTranslation();
  const styles = useResetPasswordStyles();

  return (
    <>
      <ResetHeading
        title={t('auth.resetLinkConfirmTitle')}
        subtitle={
          signedInUserId ? t('auth.resetLinkSignsOutCurrent') : t('auth.resetPasswordSubtitle')
        }
      />
      <View style={styles.form}>
        <ResetPrimaryButton
          label={t('common.continue')}
          onPress={() => void confirmAccount()}
          busy={isActivating}
        />
        <ResetSecondaryButton label={t('common.cancel')} onPress={cancel} disabled={isActivating} />
      </View>
    </>
  );
}
