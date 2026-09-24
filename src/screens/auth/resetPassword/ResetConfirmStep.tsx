import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ResetPrimaryButton, ResetSecondaryButton } from './ResetButtons';
import { useResetPasswordStyles } from './resetPasswordStyles';
import type { ResetPasswordFlow } from './useResetPasswordFlow';

type ResetConfirmStepProps = Pick<ResetPasswordFlow, 'isActivating' | 'confirmAccount' | 'cancel'>;

/** Continue exchanges the link's code for a recovery session; Cancel leaves it unused. */
export function ResetConfirmStep({ isActivating, confirmAccount, cancel }: ResetConfirmStepProps) {
  const { t } = useTranslation();
  const styles = useResetPasswordStyles();

  return (
    <View style={styles.form}>
      <ResetPrimaryButton
        label={t('common.continue')}
        onPress={() => void confirmAccount()}
        busy={isActivating}
      />
      <ResetSecondaryButton label={t('common.cancel')} onPress={cancel} disabled={isActivating} />
    </View>
  );
}
