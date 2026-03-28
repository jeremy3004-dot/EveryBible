import { useState } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { mmkvInstance } from '../../stores';
import { usePrivacyStore } from '../../stores/privacyStore';
import { useFontSize, useI18n } from '../../hooks';
import { syncPreferences } from '../../services/sync';
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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];
type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, themeMode, setTheme } = useTheme();
  const { t, currentLanguage, setLanguage, availableLanguages } = useI18n();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const privacyMode = usePrivacyStore((state) => state.mode);
  const { label: fontSizeLabel, increase, decrease, canIncrease, canDecrease } = useFontSize();
  const chapterFeedbackEnabled = preferences.chapterFeedbackEnabled;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChapterFeedbackIdentityModal, setShowChapterFeedbackIdentityModal] = useState(false);
  const [pendingChapterFeedbackEnabled, setPendingChapterFeedbackEnabled] = useState(false);
  const [chapterFeedbackIdentityName, setChapterFeedbackIdentityName] = useState('');
  const [chapterFeedbackIdentityRole, setChapterFeedbackIdentityRole] = useState('');
  const [chapterFeedbackIdentityIdNumber, setChapterFeedbackIdentityIdNumber] = useState('');
  const [chapterFeedbackIdentityError, setChapterFeedbackIdentityError] = useState<string | null>(
    null
  );
  const [isSavingChapterFeedbackIdentity, setIsSavingChapterFeedbackIdentity] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState('00');
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const openTimePicker = () => {
    const pickerState = getReminderPickerState(preferences.reminderTime, MINUTES);
    setSelectedHour(pickerState.hour);
    setSelectedMinute(pickerState.minute);
    setShowTimePicker(true);
  };

  const handleThemeChange = (mode: 'dark' | 'light' | 'low-light') => {
    setTheme(mode);
    syncPreferences().catch(() => {});
  };

  const handleNotificationToggle = async () => {
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
    idNumber: preferences.chapterFeedbackIdNumber ?? '',
  });

  const openChapterFeedbackIdentityModal = (enableAfterSave: boolean) => {
    setPendingChapterFeedbackEnabled(enableAfterSave);
    setChapterFeedbackIdentityName(preferences.chapterFeedbackName ?? user?.displayName ?? '');
    setChapterFeedbackIdentityRole(preferences.chapterFeedbackRole ?? '');
    setChapterFeedbackIdentityIdNumber(preferences.chapterFeedbackIdNumber ?? '');
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
      idNumber: chapterFeedbackIdentityIdNumber,
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
        chapterFeedbackIdNumber: identity.idNumber,
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
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
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

  const privacyModeLabel =
    privacyMode === 'discreet'
      ? t('onboarding.discreetIconTitle')
      : t('onboarding.standardIconTitle');
  const chapterFeedbackSummary = getChapterFeedbackPreferenceSummary(chapterFeedbackEnabled, {
    enabledLabel: t('settings.chapterFeedbackSummaryOn'),
    disabledLabel: t('settings.chapterFeedbackSummaryOff'),
  });
  const chapterFeedbackIdentitySummary = savedChapterFeedbackIdentity
    ? `${savedChapterFeedbackIdentity.name} • ${savedChapterFeedbackIdentity.role} • ${savedChapterFeedbackIdentity.idNumber}`
    : t('settings.chapterFeedbackIdentitySummaryOff');

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
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
              >
                <Text
                  style={[
                    styles.fontSizeText,
                    { color: colors.primaryText },
                    !canDecrease && { color: colors.cardBorder },
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
              >
                <Text
                  style={[
                    styles.fontSizeText,
                    { color: colors.primaryText },
                    !canIncrease && { color: colors.cardBorder },
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
              {(['dark', 'light', 'low-light'] as const).map((mode) => {
                const isActive = themeMode === mode;
                const label =
                  mode === 'dark'
                    ? t('settings.themeDark')
                    : mode === 'light'
                      ? t('settings.themeLight')
                      : t('settings.themeLowLight');
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.themeSelectorButton,
                      {
                        backgroundColor: isActive ? colors.accentPrimary : colors.cardBackground,
                      },
                    ]}
                    onPress={() => handleThemeChange(mode)}
                  >
                    <Text
                      style={[
                        styles.themeSelectorLabel,
                        {
                          color: isActive ? colors.cardBackground : colors.secondaryText,
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
              <Text style={[styles.settingValue, { color: colors.secondaryText }]}>
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
              trackColor={{ false: colors.cardBorder, true: colors.accentGreen }}
              thumbColor={colors.cardBackground}
            />
          </View>

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
                <Text style={[styles.settingSubLabel, { color: colors.secondaryText }]}>
                  {t('onboarding.discreetIconTitle')}
                </Text>
              </View>
            </View>
            <View style={styles.settingRight}>
              <Text style={[styles.settingValue, { color: colors.secondaryText }]}>
                {privacyModeLabel}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
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
                    {t('common.name')}
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

                <View style={styles.feedbackIdentityField}>
                  <Text style={[styles.feedbackIdentityLabel, { color: colors.primaryText }]}>
                    {t('settings.chapterFeedbackIdentityIdNumber')}
                  </Text>
                  <TextInput
                    value={chapterFeedbackIdentityIdNumber}
                    onChangeText={(value) => {
                      setChapterFeedbackIdentityIdNumber(value);
                      if (chapterFeedbackIdentityError) {
                        setChapterFeedbackIdentityError(null);
                      }
                    }}
                    editable={!isSavingChapterFeedbackIdentity}
                    placeholder={t('settings.chapterFeedbackIdentityIdNumberPlaceholder')}
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
                    <ActivityIndicator size="small" color={colors.cardBackground} />
                  ) : (
                    <Text style={[styles.modalButtonText, { color: colors.cardBackground }]}>
                      {t('common.save')}
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
              trackColor={{ false: colors.cardBorder, true: colors.accentGreen }}
              thumbColor={colors.cardBackground}
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
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.cardBorder }]}>
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
          </TouchableOpacity>

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
                          color: colors.cardBackground,
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
                          color: colors.cardBackground,
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
                <Text style={[styles.modalButtonText, { color: colors.cardBackground }]}>
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

            {isDeleting ? (
              <ActivityIndicator size="large" color={colors.error} style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.cardBorder }]}
                  onPress={() => setShowDeleteConfirm(false)}
                >
                  <Text style={[styles.modalButtonTextCancel, { color: colors.secondaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.error }]}
                  onPress={handleDeleteAccount}
                >
                  <Text style={[styles.modalButtonText, { color: colors.cardBackground }]}>
                    {t('settings.delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
  },
  settingLabel: {
    fontSize: 16,
    marginLeft: 12,
  },
  settingLabelNoMargin: {
    marginLeft: 0,
  },
  settingSubLabel: {
    fontSize: 13,
  },
  settingValue: {
    fontSize: 14,
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
    gap: 6,
  },
  themeSelectorButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  themeSelectorLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
