import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const standardIconImage = require('../../../assets/icon.png');
const discreetIconImage = require('../../../assets/icon-discreet.png');
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { usePrivacyStore } from '../../stores/privacyStore';
import { getPrivacySettingsSavePlan } from '../../services/privacy/privacyPreferences';
import { supportsDynamicAppIcon } from '../../services/privacy/appIcon';
import type { PrivacyAppIconMode } from '../../types';
import type { MoreStackParamList } from '../../navigation/types';
import { radius, layout, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'PrivacyPreferences'>;

// The crash queue is loaded only when there is a failure to report, and reporting never
// throws into the save flow.
function reportPrivacySaveFailure(error: unknown): void {
  void import('../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('privacy.save', error))
    .catch(() => undefined);
}

/**
 * On Android the icon is a launcher alias, and switching aliases closes the app to the
 * home screen (the component that launched the task is disabled; the process lives on).
 * Unwarned, that looks like a crash, so Android asks first and names the icon to reopen
 * from. Resolves false on Cancel or when the dialog is dismissed. iOS keeps the app open
 * and shows its own icon alert, so it never asks. This dialog belongs to the activity
 * and does not pause it, so it needs no privacy lock grace; the switch itself already
 * runs under one (applyPrivacyAppIcon).
 */
function confirmAndroidIconSwitch(t: TFunction, nextMode: PrivacyAppIconMode): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('privacy.iconSwitchCloseTitle'),
      t(
        nextMode === 'discreet'
          ? 'privacy.iconSwitchCloseToCalculator'
          : 'privacy.iconSwitchCloseToStandard'
      ),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('common.continue'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export function PrivacyPreferencesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // The More tab keeps the floating tab capsule over this screen; the last card has to be
  // able to scroll clear of it (and of an Android three-button navigation bar under it).
  const { contentClearance } = useTabBarHeight();
  const styles = createStyles(colors);
  const pinConfirmationInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Android runs edge to edge, so the window never resizes for the keyboard and a
  // KeyboardAvoidingView's height guess clipped the Confirm field under it. There the
  // scroll area measures how much of it the keyboard covers and the form pads by that.
  // iOS keeps its avoider, which reads an exact keyboard frame.
  const scrollSurfaceRef = useRef<View>(null);
  const measuredKeyboardInset = useKeyboardBottomInset({
    surfaceRef: scrollSurfaceRef,
    safeAreaBottomInset: insets.bottom,
  });
  const androidKeyboardInset = Platform.OS === 'android' ? measuredKeyboardInset : 0;
  const currentMode = usePrivacyStore((state) => state.mode);
  const hasExistingPin = usePrivacyStore((state) => state.hasPin);
  const saveConfiguration = usePrivacyStore((state) => state.saveConfiguration);
  const lockPrivacy = usePrivacyStore((state) => state.lock);
  const [selectedMode, setSelectedMode] = useState<PrivacyAppIconMode>(currentMode);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmation, setPinConfirmation] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Done and the keyboard's submit both save, and on Android the close warning is up
  // before isSaving is: a second press or submit in that time must not save twice.
  const saveInFlightRef = useRef(false);

  const selectMode = (nextMode: PrivacyAppIconMode) => {
    setSelectedMode(nextMode);
    setErrorKey(null);

    if (nextMode === 'standard') {
      setPinInput('');
      setPinConfirmation('');
    }
  };

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      await runSave();
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const runSave = async () => {
    const savePlan = getPrivacySettingsSavePlan({
      currentMode,
      hasExistingPin,
      selectedMode,
      pinInput,
      pinConfirmation,
    });

    if (savePlan.type === 'error') {
      setErrorKey(savePlan.errorKey);
      return;
    }

    if (savePlan.type === 'noop') {
      navigation.goBack();
      return;
    }

    // Only a mode change switches the icon; a new code for discreet mode keeps it.
    const switchesIcon = savePlan.input.mode !== currentMode && supportsDynamicAppIcon();
    if (Platform.OS === 'android' && switchesIcon) {
      if (!(await confirmAndroidIconSwitch(t, savePlan.input.mode))) {
        return;
      }
    }

    setIsSaving(true);
    setErrorKey(null);

    try {
      const result = await saveConfiguration(savePlan.input);

      if (!result.success) {
        setErrorKey(result.errorKey);
        return;
      }

      navigation.goBack();

      if (savePlan.input.mode === 'discreet') {
        InteractionManager.runAfterInteractions(() => {
          lockPrivacy();
        });
      }
    } catch (error) {
      // The keychain write failed, so nothing changed: stay here so the reader can retry.
      setErrorKey('common.unexpectedError');
      reportPrivacySaveFailure(error);
    } finally {
      setIsSaving(false);
    }
  };

  const discreetSelected = selectedMode === 'discreet';

  // The code fields are the last thing in the form and the only inputs on the screen, so
  // when the keyboard comes up over them the end of the form is where the reader is typing.
  useEffect(() => {
    if (androidKeyboardInset > 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [androidKeyboardInset]);

  // Android pads the form itself (above); an avoider there only adds a wrong height guess.
  const form = (
    <View ref={scrollSurfaceRef} collapsable={false} style={styles.keyboardView}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(contentClearance, androidKeyboardInset + spacing.lg),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoCard}>
          <View style={styles.infoIconShell}>
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.accentPrimary} />
          </View>
          <Text style={styles.infoTitle}>{t('onboarding.privacyTitle')}</Text>
          <Text style={styles.infoBody}>{t('onboarding.privacyBody')}</Text>
        </View>

        <View style={styles.optionGroup}>
          <PrivacyModeOption
            body={t('onboarding.standardIconBody')}
            colors={colors}
            iconSource={standardIconImage}
            isSelected={selectedMode === 'standard'}
            onPress={() => selectMode('standard')}
            styles={styles}
            title={t('onboarding.standardIconTitle')}
          />
          <PrivacyModeOption
            body={t('onboarding.discreetIconBody')}
            colors={colors}
            iconSource={discreetIconImage}
            isSelected={selectedMode === 'discreet'}
            onPress={() => selectMode('discreet')}
            styles={styles}
            title={t('onboarding.discreetIconTitle')}
          />
        </View>

        {discreetSelected ? (
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>{t('onboarding.pinTitle')}</Text>
            <Text style={styles.pinBody}>{t('onboarding.pinBody')}</Text>

            <TextInput
              value={pinInput}
              onChangeText={(value) => {
                setPinInput(value);
                setErrorKey(null);
              }}
              placeholder={t('onboarding.pinPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={styles.input}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              returnKeyType="next"
              onSubmitEditing={() => pinConfirmationInputRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel={
                errorKey
                  ? `${t('onboarding.pinPlaceholder')}, ${t(errorKey)}`
                  : t('onboarding.pinPlaceholder')
              }
              autoComplete="off"
              textContentType="oneTimeCode"
            />

            <TextInput
              ref={pinConfirmationInputRef}
              value={pinConfirmation}
              onChangeText={(value) => {
                setPinConfirmation(value);
                setErrorKey(null);
              }}
              placeholder={t('onboarding.pinConfirmPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={styles.input}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
              onFocus={() => {
                // Next from the first field: the keyboard is already up.
                if (androidKeyboardInset > 0) {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }
              }}
              accessibilityLabel={
                errorKey
                  ? `${t('onboarding.pinConfirmPlaceholder')}, ${t(errorKey)}`
                  : t('onboarding.pinConfirmPlaceholder')
              }
              autoComplete="off"
              textContentType="oneTimeCode"
            />

            <Text style={styles.pinLegend}>{t('onboarding.pinLegend')}</Text>

            {errorKey ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {t(errorKey)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Without the code card (standard icon), a failed save still needs a message. */}
        {!discreetSelected && errorKey ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {t(errorKey)}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {t('onboarding.privacyTitle')}
        </Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => void handleSave()}
          disabled={isSaving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          accessibilityState={{ busy: isSaving, disabled: isSaving }}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <Text style={styles.headerAction}>{t('common.done')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={insets.top + 72}
          style={styles.keyboardView}
        >
          {form}
        </KeyboardAvoidingView>
      ) : (
        form
      )}
    </SafeAreaView>
  );
}

interface PrivacyModeOptionProps {
  body: string;
  colors: ThemeColors;
  iconSource: ReturnType<typeof require>;
  isSelected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  title: string;
}

function PrivacyModeOption({
  body,
  colors,
  iconSource,
  isSelected,
  onPress,
  styles,
  title,
}: PrivacyModeOptionProps) {
  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        isSelected && {
          borderColor: colors.accentPrimary,
          backgroundColor: hexWithAlpha(colors.accentPrimary, 0.08),
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityHint={body}
      accessibilityState={{ selected: isSelected }}
    >
      <Image
        source={iconSource}
        style={styles.optionIconImage}
        resizeMode="cover"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionBody}>{body}</Text>
      </View>
      {isSelected ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.accentPrimary} />
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: layout.screenPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    headerButton: {
      width: 40,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      ...typography.cardTitle,
      color: colors.primaryText,
      textAlign: 'center',
    },
    headerAction: {
      ...typography.bodyStrong,
      color: colors.accentPrimary,
    },
    scrollView: {
      flex: 1,
    },
    keyboardView: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      padding: layout.screenPadding,
      paddingBottom: spacing.xxl,
      gap: layout.sectionGap,
    },
    infoCard: {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      gap: spacing.md,
    },
    infoIconShell: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentPrimary + '12',
    },
    infoTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    infoBody: {
      ...typography.label,
      color: colors.secondaryText,
    },
    optionGroup: {
      gap: spacing.md,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: layout.denseCardPadding,
    },
    optionIconImage: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
    },
    optionCopy: {
      flex: 1,
      gap: spacing.xs,
    },
    optionTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    optionBody: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    pinCard: {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      gap: spacing.md,
    },
    pinTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    pinBody: {
      ...typography.label,
      color: colors.secondaryText,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      color: colors.primaryText,
      ...typography.body,
    },
    pinLegend: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    errorText: {
      ...typography.micro,
      color: colors.error,
      fontWeight: '600',
    },
  });
