import { Text, View } from 'react-native';
import { MailOpen } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { AppButton, AppCard } from '../../../components/ui';
import { useAuthScreenStyles } from './authScreenStyles';

interface VerificationNoticeProps {
  isLoading: boolean;
  onSignIn: () => void;
}

/** Shown after a sign-up that must verify its address before the account can sign in. */
export function VerificationNotice({ isLoading, onSignIn }: VerificationNoticeProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useAuthScreenStyles();

  return (
    <AppCard style={styles.noticeCard}>
      <View style={styles.noticeHeader}>
        <MailOpen size={18} color={colors.accentPrimary} strokeWidth={2} />
        <Text style={styles.noticeTitle}>{t('auth.accountCreated')}</Text>
      </View>
      <Text style={styles.noticeBody}>{t('auth.verifyEmailMessage')}</Text>
      <AppButton
        label={t('auth.signIn')}
        variant="ghost"
        size="md"
        fullWidth={false}
        onPress={onSignIn}
        disabled={isLoading}
        style={styles.noticeButton}
      />
    </AppCard>
  );
}
