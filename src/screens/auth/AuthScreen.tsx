import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import { IconButton } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';
import {
  AuthEmailForm,
  AuthModeFooter,
  AuthProviderButtons,
  authModeCopyKeys,
  useAuthFlow,
  useAuthScreenStyles,
  VerificationNotice,
} from './authScreenParts';

type ScreenRouteProp = RouteProp<AuthStackParamList, 'AuthScreen'>;

// The app mark, shown at 52pt above the title. Same asset the About screen uses.
const APP_ICON = require('../../../assets/icon.png');

export function AuthScreen() {
  const route = useRoute<ScreenRouteProp>();
  const { t } = useTranslation();
  const styles = useAuthScreenStyles();
  const displayFont = useDisplayFont();
  const flow = useAuthFlow(route.params?.initialMode ?? 'signIn');
  const copy = authModeCopyKeys(flow.mode);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <IconButton icon={X} onPress={flow.dismiss} accessibilityLabel={t('interface.close')} />
            <Text style={[styles.headerEyebrow, displayFont.regular]}>
              {t('auth.accountEyebrow')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.content}>
            <Image
              source={APP_ICON}
              style={styles.appIcon}
              accessibilityIgnoresInvertColors
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            />

            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
              accessibilityRole="header"
              style={[styles.title, displayFont.bold]}
            >
              {t(copy.title)}
            </Text>
            <Text style={styles.subtitle}>{t(copy.subtitle)}</Text>

            {flow.verificationNotice ? (
              <VerificationNotice
                isLoading={flow.isLoading}
                onSignIn={() => flow.changeMode('signIn')}
              />
            ) : null}

            <AuthProviderButtons
              mode={flow.mode}
              isLoading={flow.isLoading}
              onApple={flow.continueWithApple}
              onGoogle={flow.continueWithGoogle}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={[styles.dividerText, displayFont.regular]}>{t('auth.orWithEmail')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <AuthEmailForm
              mode={flow.mode}
              email={flow.email}
              password={flow.password}
              showPassword={flow.showPassword}
              isLoading={flow.isLoading}
              errors={flow.errors}
              changeEmail={flow.changeEmail}
              changePassword={flow.changePassword}
              toggleShowPassword={flow.toggleShowPassword}
              submitEmail={flow.submitEmail}
              sendPasswordReset={flow.sendPasswordReset}
            />

            <AuthModeFooter
              mode={flow.mode}
              isLoading={flow.isLoading}
              onChangeMode={flow.changeMode}
            />

            <Text style={[styles.tagline, displayFont.regular]}>{t('auth.tagline')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
