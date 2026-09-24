import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../../components/ui';
import type { AuthScreenMode } from '../../../navigation/types';
import { authModeCopyKeys, otherAuthMode } from './authFormModel';
import { useAuthScreenStyles } from './authScreenStyles';

interface AuthModeFooterProps {
  mode: AuthScreenMode;
  isLoading: boolean;
  onChangeMode: (mode: AuthScreenMode) => void;
}

/** "New here? Create an account" / "Already have an account? Sign in". */
export function AuthModeFooter({ mode, isLoading, onChangeMode }: AuthModeFooterProps) {
  const { t } = useTranslation();
  const styles = useAuthScreenStyles();
  const copy = authModeCopyKeys(mode);

  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{t(copy.switchLead)} </Text>
      <PressableScale
        onPress={() => onChangeMode(otherAuthMode(mode))}
        disabled={isLoading}
        hitSlop={8}
        haptic="light"
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading }}
      >
        <Text style={styles.footerLink}>{t(copy.switchAction)}</Text>
      </PressableScale>
    </View>
  );
}
