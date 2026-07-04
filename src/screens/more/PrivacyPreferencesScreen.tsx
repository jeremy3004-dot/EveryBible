import { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { usePrivacyStore } from '../../stores/privacyStore';
import { getPrivacySettingsSavePlan } from '../../services/privacy/privacyPreferences';
import type { PrivacyAppIconMode } from '../../types';
import type { MoreStackParamList } from '../../navigation/types';
import { radius, layout, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'PrivacyPreferences'>;

export function PrivacyPreferencesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const pinConfirmationInputRef = useRef<TextInput>(null);
  const currentMode = usePrivacyStore((state) => state.mode);
  const hasExistingPin = usePrivacyStore((state) => state.hasPin);
  const saveConfiguration = usePrivacyStore((state) => state.saveConfiguration);
  const lockPrivacy = usePrivacyStore((state) => state.lock);
  const [selectedMode, setSelectedMode] = useState<PrivacyAppIconMode>(currentMode);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmation, setPinConfirmation] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectMode = (nextMode: PrivacyAppIconMode) => {
    setSelectedMode(nextMode);
    setErrorKey(null);

    if (nextMode === 'standard') {
      setPinInput('');
      setPinConfirmation('');
    }
  };

  const handleSave = async () => {
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
    } finally {
      setIsSaving(false);
    }
  };

  const discreetSelected = selectedMode === 'discreet';

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
        <Text style={styles.headerTitle}>{t('onboarding.privacyTitle')}</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => void handleSave()}
          disabled={isSaving}
          hitSlop={8}
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <Text style={styles.headerAction}>{t('common.done')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 72}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
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
              />

              <Text style={styles.pinLegend}>{t('onboarding.pinLegend')}</Text>

              {errorKey ? <Text style={styles.errorText}>{t(errorKey)}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
    >
      <Image source={iconSource} style={styles.optionIconImage} resizeMode="cover" />
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
      borderColor: colors.cardBorder,
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
