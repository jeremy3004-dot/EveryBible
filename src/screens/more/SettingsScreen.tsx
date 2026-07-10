import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { radius } from '../../design/system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appearancePaletteOptions,
  useTheme,
  darkColors,
  lightColors,
  lowLightColors,
  parchmentColors,
  midnightColors,
  type ThemeMode,
} from '../../contexts/ThemeContext';
import { AppButton } from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import { mmkvInstance } from '../../stores';
import { useFontSize, useI18n } from '../../hooks';
import { syncPreferences } from '../../services/sync';
import { validateTranslatorReviewPasscode } from '../../services/feedback';
import { normalizeChapterFeedbackIdentity } from '../../services/feedback/chapterFeedbackIdentity';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../constants/languages';
import { deleteCurrentAccount } from '../../services/account';
import { localeSearchEngine } from '../../services/onboarding/localeSelection';
import {
  getReminderEnablePlan,
  getReminderPickerState,
} from '../../services/preferences/reminderPreferences';
import { getChapterFeedbackPreferenceSummary } from './settingsPreferenceModel';
import {
  scheduleDailyReminder,
  cancelDailyReminder,
  requestNotificationPermissions,
} from '../../services/notifications';
import type { MoreStackParamList } from '../../navigation/types';
import { hexWithAlpha, lightHaptic, selectionHaptic } from '../../utils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];
type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;

// Per-mode background + text swatch colors for the theme-selector preview chips,
// pulled straight from each mode's base palette so the mini mock is accurate.
const THEME_PREVIEW_BG: Record<ThemeMode, string> = {
  dark: darkColors.background,
  light: lightColors.background,
  'low-light': lowLightColors.background,
  parchment: parchmentColors.background,
  midnight: midnightColors.background,
};
const THEME_PREVIEW_TEXT: Record<ThemeMode, string> = {
  dark: darkColors.primaryText,
  light: lightColors.primaryText,
  'low-light': lowLightColors.primaryText,
  parchment: parchmentColors.primaryText,
  midnight: midnightColors.primaryText,
};

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, themeMode, appearancePalette, setTheme, setAppearancePalette } = useTheme();
  const settingSwitchOffColor = colors.secondaryText + '55';
  const settingSwitchTrackColor = {
    false: settingSwitchOffColor,
    true: colors.accentGreen,
  };
  const { t, currentLanguage, setLanguage, availableLanguages } = useI18n();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const { label: fontSizeLabel, increase, decrease, canIncrease, canDecrease } = useFontSize();
  const chapterFeedbackEnabled = preferences.chapterFeedbackEnabled;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChapterFeedbackIdentityModal, setShowChapterFeedbackIdentityModal] = useState(false);
  const [showTranslatorAccessModal, setShowTranslatorAccessModal] = useState(false);
  const [translatorAccessPasscode, setTranslatorAccessPasscode] = useState('');
  const [translatorAccessError, setTranslatorAccessError] = useState<string | null>(null);
  const [isCheckingTranslatorAccess, setIsCheckingTranslatorAccess] = useState(false);
  const [pendingChapterFeedbackEnabled, setPendingChapterFeedbackEnabled] = useState(false);
  const [chapterFeedbackIdentityName, setChapterFeedbackIdentityName] = useState('');
  const [chapterFeedbackIdentityRole, setChapterFeedbackIdentityRole] = useState('');
  const [chapterFeedbackIdentityError, setChapterFeedbackIdentityError] = useState<string | null>(
    null
  );
  const [isSavingChapterFeedbackIdentity, setIsSavingChapterFeedbackIdentity] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState('00');
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const translatorReviewEnabled = useTranslatorReviewStore((state) => state.enabled);
  const enableTranslatorReviewMode = useTranslatorReviewStore((state) => state.enableWithPasscode);
  const disableTranslatorReviewMode = useTranslatorReviewStore((state) => state.disable);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);

  useEffect(() => {
    if (
      preferences.contentLanguageCode !== 'cpe' ||
      !(
        preferences.contentLanguageName?.startsWith('Creoles and pidgins') ||
        preferences.contentLanguageNativeName?.startsWith('Creoles and pidgins')
      )
    ) {
      return;
    }

    setPreferences({
      contentLanguageCode: 'en',
      contentLanguageName: 'English',
      contentLanguageNativeName: 'English',
    });
    syncPreferences().catch(() => {});
  }, [
    preferences.contentLanguageCode,
    preferences.contentLanguageName,
    preferences.contentLanguageNativeName,
    setPreferences,
  ]);

  const openTimePicker = () => {
    const pickerState = getReminderPickerState(preferences.reminderTime, MINUTES);
    setSelectedHour(pickerState.hour);
    setSelectedMinute(pickerState.minute);
    setShowTimePicker(true);
  };

  const handleThemeChange = (mode: ThemeMode) => {
    selectionHaptic();
    setTheme(mode);
    syncPreferences().catch(() => {});
  };

  const handleAppearancePaletteChange = (
    palette: (typeof appearancePaletteOptions)[number]['id']
  ) => {
    selectionHaptic();
    setAppearancePalette(palette);
    syncPreferences().catch(() => {});
  };

  const handleNotificationToggle = async () => {
    lightHaptic();
    if (!preferences.notificationsEnabled) {
      // Request permission when enabling
      const granted = await requestNotificationPermissions();

      if (!granted) {
        Alert.alert(t('settings.permissionRequired'), t('settings.enableNotificationsMessage'), [
          { text: t('common.ok') },
        ]);
        return;
      }

      const enablePlan = getReminderEnablePlan(preferences.reminderTime);

      if (enablePlan.type === 'schedule-existing') {
        await scheduleDailyReminder(enablePlan.schedule.hour, enablePlan.schedule.minute);
        setPreferences({ notificationsEnabled: true });
        syncPreferences().catch(() => {});
        return;
      }

      openTimePicker();
      return;
    }

    try {
      await cancelDailyReminder();
      setPreferences({ notificationsEnabled: false });
    } finally {
      syncPreferences().catch(() => {});
    }
  };

  const handleLanguageSelect = async (languageCode: LanguageCode) => {
    await setLanguage(languageCode);
    setShowLanguagePicker(false);
  };

  const savedChapterFeedbackIdentity = normalizeChapterFeedbackIdentity({
    name: preferences.chapterFeedbackName ?? '',
    role: preferences.chapterFeedbackRole ?? '',
  });

  const openChapterFeedbackIdentityModal = (enableAfterSave: boolean) => {
    setPendingChapterFeedbackEnabled(enableAfterSave);
    setChapterFeedbackIdentityName(preferences.chapterFeedbackName ?? user?.displayName ?? '');
    setChapterFeedbackIdentityRole(preferences.chapterFeedbackRole ?? '');
    setChapterFeedbackIdentityError(null);
    setShowChapterFeedbackIdentityModal(true);
  };

  const closeChapterFeedbackIdentityModal = () => {
    if (isSavingChapterFeedbackIdentity) {
      return;
    }

    setShowChapterFeedbackIdentityModal(false);
    setPendingChapterFeedbackEnabled(false);
    setChapterFeedbackIdentityError(null);
  };

  const handleSaveChapterFeedbackIdentity = async () => {
    const identity = normalizeChapterFeedbackIdentity({
      name: chapterFeedbackIdentityName,
      role: chapterFeedbackIdentityRole,
    });

    if (!identity) {
      setChapterFeedbackIdentityError(t('settings.chapterFeedbackIdentityRequired'));
      return;
    }

    setIsSavingChapterFeedbackIdentity(true);
    setChapterFeedbackIdentityError(null);

    try {
      setPreferences({
        chapterFeedbackName: identity.name,
        chapterFeedbackRole: identity.role,
        chapterFeedbackEnabled: pendingChapterFeedbackEnabled ? true : chapterFeedbackEnabled,
      });

      const result = await syncPreferences();
      if (!result.success) {
        setChapterFeedbackIdentityError(result.error ?? t('common.unexpectedError'));
        return;
      }

      setShowChapterFeedbackIdentityModal(false);
      setPendingChapterFeedbackEnabled(false);
    } finally {
      setIsSavingChapterFeedbackIdentity(false);
    }
  };

  const handleChapterFeedbackToggle = (enabled: boolean) => {
    if (!enabled) {
      setPreferences({ chapterFeedbackEnabled: false });
      syncPreferences().catch(() => {});
      return;
    }

    if (savedChapterFeedbackIdentity) {
      setPreferences({ chapterFeedbackEnabled: true });
      syncPreferences().catch(() => {});
      return;
    }

    openChapterFeedbackIdentityModal(true);
  };

  const handleOpenChapterFeedbackIdentityEditor = () => {
    openChapterFeedbackIdentityModal(false);
  };

  const openTranslatorAccessModal = () => {
    setTranslatorAccessPasscode('');
    setTranslatorAccessError(null);
    setShowTranslatorAccessModal(true);
  };

  const handleTranslatorReviewToggle = (enabled: boolean) => {
    if (enabled) {
      openTranslatorAccessModal();
      return;
    }

    disableTranslatorReviewMode();
    setShowTranslatorAccessModal(false);
    setTranslatorAccessPasscode('');
    setTranslatorAccessError(null);
  };

  const handleTranslatorAccessDigit = (digit: string) => {
    setTranslatorAccessPasscode((current) => `${current}${digit}`.slice(0, 6));
    if (translatorAccessError) {
      setTranslatorAccessError(null);
    }
  };

  const handleTranslatorAccessSubmit = async () => {
    if (isCheckingTranslatorAccess) {
      return;
    }

    setIsCheckingTranslatorAccess(true);
    setTranslatorAccessError(null);

    try {
      const result = await validateTranslatorReviewPasscode(
        translatorAccessPasscode,
        currentTranslation
      );

      if (!result.success) {
        setTranslatorAccessError(
          result.error === 'Translator access denied'
            ? t('settings.translatorAccessIncorrect')
            : (result.error ?? t('settings.translatorAccessIncorrect'))
        );
        return;
      }

      enableTranslatorReviewMode(translatorAccessPasscode);
      setShowTranslatorAccessModal(false);
      setTranslatorAccessPasscode('');
      Alert.alert(t('settings.translatorAccessEnabled'), t('settings.translatorAccessEnabledBody'));
    } finally {
      setIsCheckingTranslatorAccess(false);
    }
  };

  const localeSummary = (() => {
    const localizedCountryName = preferences.countryCode
      ? localeSearchEngine.getCountryDisplayName(preferences.countryCode, currentLanguage)
      : preferences.countryName;

    if (localizedCountryName && preferences.contentLanguageNativeName) {
      return `${localizedCountryName} • ${preferences.contentLanguageNativeName}`;
    }

    return localizedCountryName || preferences.contentLanguageNativeName || t('common.notSet');
  })();

  const handleTimeSelect = async () => {
    const parsedMinute = parseInt(selectedMinute, 10);
    const timeString = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute}`;
    await scheduleDailyReminder(selectedHour, parsedMinute);

    setPreferences({ notificationsEnabled: true, reminderTime: timeString });
    setShowTimePicker(false);
    syncPreferences().catch(() => {});
  };

  const formatTime = (time: string | null): string => {
    if (!time) return t('common.notSet');
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    return new Date(0, 0, 0, hour, minute).toLocaleTimeString(currentLanguage, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleClearCache = () => {
    Alert.alert(t('settings.clearCache'), t('settings.clearCacheConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clear'),
        style: 'destructive',
        onPress: async () => {
          try {
            // Clear AsyncStorage (handles any legacy keys from before MMKV migration)
            const allKeys = await AsyncStorage.getAllKeys();
            // Preserve auth state and progress on both storage backends
            const keysToPreserve = ['auth-storage', 'progress-storage', 'user-preferences'];
            const keysToRemove = allKeys.filter(
              (key) => !keysToPreserve.some((preserve) => key.includes(preserve))
            );
            if (keysToRemove.length > 0) {
              await AsyncStorage.multiRemove(keysToRemove);
            }
            // Clear MMKV — delete all keys that are not in the preserve list
            const mmkvKeys = mmkvInstance.getAllKeys();
            for (const key of mmkvKeys) {
              if (!keysToPreserve.some((preserve) => key.includes(preserve))) {
                mmkvInstance.delete(key);
              }
            }
            Alert.alert(t('common.done'), t('settings.cacheClearedSuccess'));
          } catch {
            Alert.alert(t('common.error'), t('settings.cacheClearError'));
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      Alert.alert(t('common.error'), t('settings.notSignedIn'));
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteCurrentAccount();

      if (!result.success) {
        Alert.alert(t('common.error'), result.error || t('settings.deleteAccountError'));
        return;
      }

      await AsyncStorage.clear();
      mmkvInstance.clearAll();
      await signOut();

      setShowDeleteConfirm(false);
      Alert.alert(t('settings.accountDeleted'), t('settings.accountDeletedMessage'));
    } catch (error) {
      console.error('Error deleting account:', error);
      Alert.alert(t('common.error'), t('settings.deleteAccountError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const chapterFeedbackSummary = getChapterFeedbackPreferenceSummary(chapterFeedbackEnabled, {
    enabledLabel: t('settings.chapterFeedbackSummaryOn'),
    disabledLabel: t('settings.chapterFeedbackSummaryOff'),
  });
  const chapterFeedbackIdentitySummary = savedChapterFeedbackIdentity
    ? `${savedChapterFeedbackIdentity.name} • ${savedChapterFeedbackIdentity.role}`
    : t('settings.chapterFeedbackIdentitySummaryOff');

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('settings.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Reading Settings */}
        <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
          {t('settings.reading')}
        </Text>
        <View
          style={[
            styles.settingsGroup,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="text-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.fontSize')}
              </Text>
            </View>
            <View style={styles.fontSizeControls}>
              <TouchableOpacity
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: colors.cardBorder },
                  !canDecrease && [
                    styles.fontSizeButtonDisabled,
                    { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                  ],
                ]}
                onPress={decrease}
                disabled={!canDecrease}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.fontSizeText,
                    { color: colors.primaryText },
                    !canDecrease && { color: hexWithAlpha(colors.secondaryText, 0.4) },
                  ]}
                >
                  A-
                </Text>
              </TouchableOpacity>
              <Text style={[styles.fontSizeValue, { color: colors.secondaryText }]}>
                {fontSizeLabel}
              </Text>
              <TouchableOpacity
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: colors.cardBorder },
                  !canIncrease && [
                    styles.fontSizeButtonDisabled,
                    { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                  ],
                ]}
                onPress={increase}
                disabled={!canIncrease}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.fontSizeText,
                    { color: colors.primaryText },
                    !canIncrease && { color: hexWithAlpha(colors.secondaryText, 0.4) },
                  ]}
                >
                  A+
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.themeMode')}
              </Text>
            </View>
            <View style={styles.themeSelectorRow}>
              {(['dark', 'light', 'low-light', 'parchment', 'midnight'] as const).map((mode) => {
                const isActive = themeMode === mode;
                const label =
                  mode === 'dark'
                    ? t('settings.themeDark')
                    : mode === 'light'
                      ? t('settings.themeLight')
                      : mode === 'low-light'
                        ? t('settings.themeLowLight')
                        : mode === 'parchment'
                          ? t('settings.themeParchment')
                          : t('settings.themeMidnight');
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.themeSelectorButton,
                      {
                        backgroundColor: isActive ? colors.accentSoft : colors.cardBackground,
                        borderColor: isActive ? colors.accentPrimary : colors.cardBorder,
                      },
                    ]}
                    onPress={() => handleThemeChange(mode)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={label}
                  >
                    <View
                      style={[
                        styles.themeSelectorSwatch,
                        { backgroundColor: THEME_PREVIEW_BG[mode] },
                      ]}
                    >
                      <View
                        style={[
                          styles.themeSelectorSwatchLine,
                          { backgroundColor: THEME_PREVIEW_TEXT[mode] },
                        ]}
                      />
                      <View
                        style={[
                          styles.themeSelectorSwatchDot,
                          { backgroundColor: colors.accentPrimary },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.themeSelectorLabel,
                        {
                          color: isActive ? colors.accentPrimary : colors.secondaryText,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}
            onPress={() => setShowLanguagePicker(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="globe-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.language')}
              </Text>
            </View>
            <View style={styles.settingRight}>
              <Text
                style={[styles.settingValue, { color: colors.secondaryText }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {availableLanguages[currentLanguage].nativeName}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}
            onPress={() => navigation.navigate('LocalePreferences')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="location-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.nationAndLanguage')}
              </Text>
            </View>
            <View style={styles.settingRight}>
              <Text
                style={[styles.settingValue, { color: colors.secondaryText }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {localeSummary}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <View style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="chatbox-ellipses-outline" size={24} color={colors.secondaryText} />
              <View style={styles.settingCopy}>
                <Text
                  style={[
                    styles.settingLabel,
                    styles.settingLabelNoMargin,
                    { color: colors.primaryText },
                  ]}
                >
                  {t('settings.chapterFeedback')}
                </Text>
                <Text style={[styles.settingSubLabel, { color: colors.secondaryText }]}>
                  {chapterFeedbackSummary}
                </Text>
              </View>
            </View>
            <Switch
              value={chapterFeedbackEnabled}
              onValueChange={handleChapterFeedbackToggle}
              trackColor={settingSwitchTrackColor}
              ios_backgroundColor={settingSwitchOffColor}
              thumbColor={colors.cardBackground}
              accessibilityLabel={t('settings.chapterFeedback')}
            />
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}
            onPress={() => handleTranslatorReviewToggle(!translatorReviewEnabled)}
            accessible={false}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="keypad-outline" size={24} color={colors.secondaryText} />
              <View style={styles.settingCopy}>
                <Text
                  style={[
                    styles.settingLabel,
                    styles.settingLabelNoMargin,
                    { color: colors.primaryText },
                  ]}
                >
                  {t('settings.translatorAccess')}
                </Text>
                <Text style={[styles.settingSubLabel, { color: colors.secondaryText }]}>
                  {translatorReviewEnabled
                    ? t('settings.translatorAccessSummaryOn')
                    : t('settings.translatorAccessSummaryOff')}
                </Text>
              </View>
            </View>
            <Switch
              value={translatorReviewEnabled}
              onValueChange={handleTranslatorReviewToggle}
              trackColor={settingSwitchTrackColor}
              ios_backgroundColor={settingSwitchOffColor}
              thumbColor={colors.cardBackground}
              accessibilityLabel={t('settings.translatorAccess')}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, styles.lastItem, styles.feedbackIdentityRow]}
            onPress={handleOpenChapterFeedbackIdentityEditor}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="person-outline" size={24} color={colors.secondaryText} />
              <View style={styles.settingCopy}>
                <Text
                  style={[
                    styles.settingLabel,
                    styles.settingLabelNoMargin,
                    { color: colors.primaryText },
                  ]}
                >
                  {t('settings.chapterFeedbackIdentity')}
                </Text>
                <Text style={[styles.settingSubLabel, { color: colors.secondaryText }]}>
                  {chapterFeedbackIdentitySummary}
                </Text>
              </View>
            </View>
            <View style={styles.settingRight}>
              <Text style={[styles.settingValue, { color: colors.secondaryText }]}>
                {savedChapterFeedbackIdentity ? t('common.edit') : t('common.notSet')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.settingsGroup,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.settingItem, styles.lastItem]}
            onPress={() => navigation.navigate('PrivacyPreferences')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="calculator-outline" size={24} color={colors.secondaryText} />
              <View style={styles.settingCopy}>
                <Text
                  style={[
                    styles.settingLabel,
                    styles.settingLabelNoMargin,
                    { color: colors.primaryText },
                  ]}
                >
                  {t('onboarding.privacyTitle')}
                </Text>
              </View>
            </View>
            <View style={styles.settingRight}>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
          {t('settings.appearance')}
        </Text>
        <Text style={[styles.sectionDescription, { color: colors.secondaryText }]}>
          {t('settings.appearanceBody')}
        </Text>
        <View
          style={[
            styles.settingsGroup,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          {appearancePaletteOptions.map((option, index) => {
            const isActive = appearancePalette === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.appearanceOption,
                  { borderBottomColor: colors.cardBorder },
                  index === appearancePaletteOptions.length - 1 && styles.lastItem,
                  isActive && { backgroundColor: colors.accentPrimary + '10' },
                ]}
                onPress={() => handleAppearancePaletteChange(option.id)}
              >
                <View style={styles.appearancePreviewRow}>
                  {option.previewColors.map((swatchColor) => (
                    <View
                      key={swatchColor}
                      style={[styles.appearanceSwatch, { backgroundColor: swatchColor }]}
                    />
                  ))}
                </View>
                <View style={styles.appearanceCopy}>
                  <Text style={[styles.appearanceTitle, { color: colors.primaryText }]}>
                    {t(option.labelKey)}
                  </Text>
                  <Text style={[styles.appearanceDescription, { color: colors.secondaryText }]}>
                    {t(option.descriptionKey)}
                  </Text>
                </View>
                <Ionicons
                  name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isActive ? colors.accentPrimary : colors.secondaryText}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Modal
          visible={showChapterFeedbackIdentityModal}
          transparent
          animationType="fade"
          onRequestClose={closeChapterFeedbackIdentityModal}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={closeChapterFeedbackIdentityModal}
            />
            <View
              style={[
                styles.modalContent,
                styles.chapterFeedbackIdentityModalContent,
                { backgroundColor: colors.cardBackground },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
                {t('settings.chapterFeedbackIdentityTitle')}
              </Text>
              <Text style={[styles.chapterFeedbackIdentityBody, { color: colors.secondaryText }]}>
                {t('settings.chapterFeedbackIdentityBody')}
              </Text>

              <View style={styles.feedbackIdentityFields}>
                <View style={styles.feedbackIdentityField}>
                  <Text style={[styles.feedbackIdentityLabel, { color: colors.primaryText }]}>
                    {t('auth.name')}
                  </Text>
                  <TextInput
                    value={chapterFeedbackIdentityName}
                    onChangeText={(value) => {
                      setChapterFeedbackIdentityName(value);
                      if (chapterFeedbackIdentityError) {
                        setChapterFeedbackIdentityError(null);
                      }
                    }}
                    editable={!isSavingChapterFeedbackIdentity}
                    placeholder={t('auth.namePlaceholder')}
                    placeholderTextColor={colors.secondaryText}
                    style={[
                      styles.feedbackIdentityInput,
                      {
                        color: colors.primaryText,
                        borderColor: colors.cardBorder,
                        backgroundColor: colors.background,
                      },
                    ]}
                  />
                </View>

                <View style={styles.feedbackIdentityField}>
                  <Text style={[styles.feedbackIdentityLabel, { color: colors.primaryText }]}>
                    {t('settings.chapterFeedbackIdentityRole')}
                  </Text>
                  <TextInput
                    value={chapterFeedbackIdentityRole}
                    onChangeText={(value) => {
                      setChapterFeedbackIdentityRole(value);
                      if (chapterFeedbackIdentityError) {
                        setChapterFeedbackIdentityError(null);
                      }
                    }}
                    editable={!isSavingChapterFeedbackIdentity}
                    placeholder={t('settings.chapterFeedbackIdentityRolePlaceholder')}
                    placeholderTextColor={colors.secondaryText}
                    style={[
                      styles.feedbackIdentityInput,
                      {
                        color: colors.primaryText,
                        borderColor: colors.cardBorder,
                        backgroundColor: colors.background,
                      },
                    ]}
                  />
                </View>
              </View>

              {chapterFeedbackIdentityError ? (
                <Text style={[styles.feedbackIdentityError, { color: colors.error }]}>
                  {chapterFeedbackIdentityError}
                </Text>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    {
                      backgroundColor: colors.cardBorder,
                    },
                  ]}
                  onPress={closeChapterFeedbackIdentityModal}
                  disabled={isSavingChapterFeedbackIdentity}
                >
                  <Text style={[styles.modalButtonTextCancel, { color: colors.primaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    {
                      backgroundColor: colors.accentPrimary,
                    },
                  ]}
                  onPress={() => {
                    void handleSaveChapterFeedbackIdentity();
                  }}
                  disabled={isSavingChapterFeedbackIdentity}
                >
                  {isSavingChapterFeedbackIdentity ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Text style={[styles.modalButtonText, { color: colors.onAccent }]}>
                      {t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showTranslatorAccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTranslatorAccessModal(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowTranslatorAccessModal(false)}
            />
            <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
                {t('settings.translatorAccessTitle')}
              </Text>
              <Text style={[styles.translatorAccessBody, { color: colors.secondaryText }]}>
                {t('settings.translatorAccessBody')}
              </Text>
              <TextInput
                value={translatorAccessPasscode}
                editable={false}
                secureTextEntry
                keyboardType="number-pad"
                placeholder={t('settings.translatorAccessPlaceholder')}
                placeholderTextColor={colors.secondaryText}
                style={[
                  styles.translatorAccessInput,
                  {
                    color: colors.primaryText,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              {translatorAccessError ? (
                <Text style={[styles.feedbackIdentityError, { color: colors.error }]}>
                  {translatorAccessError}
                </Text>
              ) : null}
              <View style={styles.translatorKeypad}>
                {[
                  ['1', '2', '3', '4'],
                  ['5', '6', '7', '8'],
                  ['9', '0', 'clear', 'delete'],
                ].map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.translatorKeyRow}>
                    {row.map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.translatorKey,
                          {
                            backgroundColor:
                              key === 'clear' || key === 'delete'
                                ? colors.cardBorder
                                : colors.background,
                          },
                        ]}
                        onPress={() => {
                          if (key === 'clear') {
                            setTranslatorAccessPasscode('');
                            setTranslatorAccessError(null);
                            return;
                          }

                          if (key === 'delete') {
                            setTranslatorAccessPasscode((current) => current.slice(0, -1));
                            setTranslatorAccessError(null);
                            return;
                          }

                          handleTranslatorAccessDigit(key);
                        }}
                      >
                        <Text style={[styles.translatorKeyText, { color: colors.primaryText }]}>
                          {key === 'clear'
                            ? t('privacy.clearKey')
                            : key === 'delete'
                              ? t('privacy.deleteKey')
                              : key}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.cardBorder }]}
                  onPress={() => setShowTranslatorAccessModal(false)}
                >
                  <Text style={[styles.modalButtonTextCancel, { color: colors.primaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    {
                      backgroundColor:
                        translatorAccessPasscode.length > 0 && !isCheckingTranslatorAccess
                          ? colors.accentPrimary
                          : colors.cardBorder,
                    },
                  ]}
                  onPress={() => {
                    void handleTranslatorAccessSubmit();
                  }}
                  disabled={translatorAccessPasscode.length === 0 || isCheckingTranslatorAccess}
                >
                  {isCheckingTranslatorAccess ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Text
                      style={[
                        styles.modalButtonText,
                        {
                          color:
                            translatorAccessPasscode.length > 0
                              ? colors.onAccent
                              : colors.secondaryText,
                        },
                      ]}
                    >
                      {t('settings.translatorAccessUnlock')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
          {t('settings.notifications')}
        </Text>
        <View
          style={[
            styles.settingsGroup,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.dailyReminder')}
              </Text>
            </View>
            <Switch
              value={preferences.notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={settingSwitchTrackColor}
              ios_backgroundColor={settingSwitchOffColor}
              thumbColor={colors.cardBackground}
              accessibilityLabel={t('settings.dailyReminder')}
            />
          </View>

          <TouchableOpacity
            style={[styles.settingItem, styles.lastItem]}
            onPress={() => preferences.notificationsEnabled && openTimePicker()}
            disabled={!preferences.notificationsEnabled}
          >
            <View style={styles.settingLeft}>
              <Ionicons
                name="time-outline"
                size={24}
                color={preferences.notificationsEnabled ? colors.secondaryText : colors.cardBorder}
              />
              <Text
                style={[
                  styles.settingLabel,
                  { color: colors.primaryText },
                  !preferences.notificationsEnabled && { color: colors.cardBorder },
                ]}
              >
                {t('settings.reminderTime')}
              </Text>
            </View>
            <Text
              style={[
                styles.settingValue,
                { color: colors.secondaryText },
                !preferences.notificationsEnabled && { color: colors.cardBorder },
              ]}
            >
              {formatTime(preferences.reminderTime)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Data */}
        <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
          {t('settings.data')}
        </Text>
        <View
          style={[
            styles.settingsGroup,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}
            onPress={() => navigation.navigate('Diagnostics')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="bug-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.diagnostics.title')}
              </Text>
            </View>
            <View style={styles.settingRight}>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <View style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="cloud-download-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.settingLabel, { color: colors.primaryText }]}>
                {t('settings.downloadForOffline')}
              </Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={[styles.settingValue, { color: colors.secondaryText }]}>
                {t('common.available')}
              </Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}
            onPress={handleClearCache}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={24} color={colors.error} />
              <Text style={[styles.settingLabel, { color: colors.error }]}>
                {t('settings.clearCache')}
              </Text>
            </View>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={[styles.settingItem, styles.lastItem]}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <View style={styles.settingLeft}>
                <Ionicons name="person-remove-outline" size={24} color={colors.error} />
                <Text style={[styles.settingLabel, { color: colors.error }]}>
                  {t('settings.deleteAccount')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
              {t('settings.setReminderTime')}
            </Text>

            <View style={styles.timePickerContainer}>
              <ScrollView
                style={styles.timeColumn}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.timeColumnContent}
              >
                {HOURS.map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.timeOption,
                      selectedHour === hour && [
                        styles.timeOptionSelected,
                        { backgroundColor: colors.accentGreen },
                      ],
                    ]}
                    onPress={() => setSelectedHour(hour)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        { color: colors.secondaryText },
                        selectedHour === hour && {
                          color: colors.onAccent,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {hour.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.timeSeparator, { color: colors.primaryText }]}>:</Text>

              <ScrollView
                style={styles.timeColumn}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.timeColumnContent}
              >
                {MINUTES.map((minute) => (
                  <TouchableOpacity
                    key={minute}
                    style={[
                      styles.timeOption,
                      selectedMinute === minute && [
                        styles.timeOptionSelected,
                        { backgroundColor: colors.accentGreen },
                      ],
                    ]}
                    onPress={() => setSelectedMinute(minute)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        { color: colors.secondaryText },
                        selectedMinute === minute && {
                          color: colors.onAccent,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {minute}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.cardBorder }]}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={[styles.modalButtonTextCancel, { color: colors.secondaryText }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  { backgroundColor: colors.accentGreen },
                ]}
                onPress={handleTimeSelect}
              >
                <Text style={[styles.modalButtonText, { color: colors.onAccent }]}>
                  {t('settings.setTime')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
              {t('settings.selectLanguage')}
            </Text>

            <ScrollView
              style={styles.languageList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.languageListContent}
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <TouchableOpacity
                  key={language.code}
                  style={[
                    styles.languageOption,
                    { borderBottomColor: colors.cardBorder },
                    currentLanguage === language.code && {
                      backgroundColor: colors.accentGreen + '20',
                    },
                  ]}
                  onPress={() => handleLanguageSelect(language.code)}
                >
                  <View style={styles.languageInfo}>
                    <Text style={[styles.languageNative, { color: colors.primaryText }]}>
                      {language.nativeName}
                    </Text>
                    <Text style={[styles.languageName, { color: colors.secondaryText }]}>
                      {language.name}
                    </Text>
                    <Text
                      style={[styles.languageHint, { color: colors.secondaryText }]}
                      numberOfLines={1}
                    >
                      {language.appLanguageLabel}
                    </Text>
                  </View>
                  {currentLanguage === language.code && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.cardBorder, marginTop: 16 }]}
              onPress={() => setShowLanguagePicker(false)}
            >
              <Text style={[styles.modalButtonTextCancel, { color: colors.secondaryText }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setShowDeleteConfirm(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Ionicons
              name="warning"
              size={48}
              color={colors.error}
              style={{ alignSelf: 'center', marginBottom: 16 }}
            />
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
              {t('settings.deleteAccount')}
            </Text>
            <Text style={[styles.deleteWarningText, { color: colors.secondaryText }]}>
              {t('settings.deleteAccountWarning')}
            </Text>

            <View style={styles.modalButtons}>
              <AppButton
                label={t('common.cancel')}
                variant="secondary"
                fullWidth={false}
                disabled={isDeleting}
                onPress={() => setShowDeleteConfirm(false)}
                style={styles.modalButtonFlex}
              />
              <AppButton
                label={t('settings.delete')}
                variant="destructive"
                fullWidth={false}
                loading={isDeleting}
                onPress={handleDeleteAccount}
                style={styles.modalButtonFlex}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 12,
  },
  settingsGroup: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    minHeight: 68,
    borderBottomWidth: 1,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  feedbackIdentityRow: {
    marginTop: 4,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  settingCopy: {
    marginLeft: 12,
    gap: 2,
    flexShrink: 1,
    paddingRight: 12,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '46%',
    flexShrink: 1,
    minWidth: 0,
  },
  settingLabel: {
    fontSize: 16,
    marginLeft: 12,
    flexShrink: 1,
  },
  settingLabelNoMargin: {
    marginLeft: 0,
  },
  settingSubLabel: {
    fontSize: 13,
  },
  settingValue: {
    fontSize: 14,
    maxWidth: '100%',
    flexShrink: 1,
  },
  appearanceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  appearancePreviewRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  appearanceSwatch: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  appearanceCopy: {
    flex: 1,
    gap: 2,
  },
  appearanceTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  appearanceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontSizeButton: {
    padding: 8,
    borderRadius: radius.sm,
  },
  fontSizeButtonDisabled: {
    borderWidth: 1,
  },
  fontSizeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fontSizeValue: {
    fontSize: 14,
    marginHorizontal: 12,
    minWidth: 60,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderRadius: radius.md,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  chapterFeedbackIdentityModalContent: {
    width: '88%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  chapterFeedbackIdentityBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  feedbackIdentityFields: {
    gap: 12,
    marginBottom: 16,
  },
  feedbackIdentityField: {
    gap: 8,
  },
  feedbackIdentityLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackIdentityInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  feedbackIdentityError: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  translatorAccessBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  translatorAccessInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 0,
    textAlign: 'center',
    marginBottom: 12,
  },
  translatorKeypad: {
    gap: 6,
    marginBottom: 16,
  },
  translatorKeyRow: {
    flexDirection: 'row',
    gap: 6,
  },
  translatorKey: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translatorKeyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: 20,
  },
  timeColumn: {
    flex: 1,
    maxWidth: 80,
  },
  timeColumnContent: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  timeOption: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
    marginVertical: 2,
  },
  timeOptionSelected: {},
  timeOptionText: {
    fontSize: 20,
    fontWeight: '500',
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButtonFlex: {
    flex: 1,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalButtonPrimary: {},
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
  },
  languageList: {
    marginBottom: 8,
    maxHeight: 420,
  },
  languageListContent: {
    paddingBottom: 4,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  languageInfo: {
    flex: 1,
  },
  languageNative: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  languageName: {
    fontSize: 14,
  },
  languageHint: {
    fontSize: 12,
    marginTop: 4,
  },
  deleteWarningText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    maxWidth: 220,
  },
  themeSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  themeSelectorSwatch: {
    width: 24,
    height: 18,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  themeSelectorSwatchLine: {
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  themeSelectorSwatchDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  themeSelectorLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
