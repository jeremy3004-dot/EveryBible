import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout } from '../../../design/system';
import type { AuthScreenMode } from '../../../navigation/types';
import { GoogleButton } from './GoogleButton';
import { useAuthScreenStyles } from './authScreenStyles';

interface AuthProviderButtonsProps {
  mode: AuthScreenMode;
  isLoading: boolean;
  onApple: () => void;
  onGoogle: () => void;
}

/** Sign in with Apple (iOS only) above the Google strip. */
export function AuthProviderButtons({
  mode,
  isLoading,
  onApple,
  onGoogle,
}: AuthProviderButtonsProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const styles = useAuthScreenStyles();

  return (
    <View style={styles.providerSection}>
      {Platform.OS === 'ios' ? (
        // Apple requires its own button for Sign in with Apple, so the
        // spec's plain ink pill is rendered by the native control: same
        // 50pt height and 25pt radius, and the only place in this screen
        // allowed to branch on `isDark` — the control takes a style enum,
        // not a theme colour, and BLACK/WHITE are the two that match the
        // ink pill in each scope.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'signUp'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={layout.pillHeight / 2}
          style={styles.appleButton}
          onPress={onApple}
        />
      ) : null}

      <GoogleButton label={t('auth.continueWithGoogle')} onPress={onGoogle} disabled={isLoading} />
    </View>
  );
}
