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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { useFontSize, useI18n } from '../../hooks';
import { syncPreferences } from '../../services/sync';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../constants/languages';
import { deleteCurrentAccount } from '../../services/account';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];

export function SettingsScreen() {
  const navigation = useNavigation();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, currentLanguage, setLanguage, availableLanguages } = useI18n();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const { label: fontSizeLabel, increase, decrease, canIncrease, canDecrease } = useFontSize();
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState('00');
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const handleThemeToggle = () => {
    toggleTheme();
    syncPreferences().catch(() => {});
  };

  const handleNotificationToggle = async () => {
    if (!preferences.notificationsEnabled) {
      // Request permission when enabling
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(t('settings.permissionRequired'), t('settings.enableNotificationsMessage'), [
          { text: t('common.ok') },
        ]);
        return;
      }

      setPreferences({ notificationsEnabled: true });
      // Show time picker if no reminder time is set
      if (!preferences.reminderTime) {
        setShowTimePicker(true);
      }
    } else {
      // Disable notifications and cancel scheduled ones
      await Notifications.cancelAllScheduledNotificationsAsync();
      setPreferences({ notificationsEnabled: false });
    }
    syncPreferences().catch(() => {});
  };

  const handleLanguageSelect = async (languageCode: LanguageCode) => {
    await setLanguage(languageCode);
    setShowLanguagePicker(false);
  };

  const localeSummary =
    preferences.countryName && preferences.contentLanguageNativeName
      ? `${preferences.countryName} • ${preferences.contentLanguageNativeName}`
      : preferences.countryName || preferences.contentLanguageNativeName || t('common.notSet');

  const handleTimeSelect = async () => {
    const timeString = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute}`;
    setPreferences({ reminderTime: timeString });
    setShowTimePicker(false);

    // Cancel existing and schedule new notification
    await Notifications.cancelAllScheduledNotificationsAsync();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('settings.notificationTitle'),
        body: t('settings.notificationBody'),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: selectedHour,
        minute: parseInt(selectedMinute, 10),
      },
    });

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
            // Get all keys
            const allKeys = await AsyncStorage.getAllKeys();
            // Filter out keys we want to preserve (auth state, user progress)
            const keysToPreserve = ['auth-storage', 'progress-storage', 'user-preferences'];
            const keysToRemove = allKeys.filter(
              (key) => !keysToPreserve.some((preserve) => key.includes(preserve))
            );
            // Remove cached keys
            if (keysToRemove.length > 0) {
              await AsyncStorage.multiRemove(keysToRemove);
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
                {t('settings.darkMode')}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleThemeToggle}
              trackColor={{ false: colors.cardBorder, true: colors.accentGreen }}
              thumbColor="#ffffff"
            />
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
            style={[styles.settingItem, styles.lastItem]}
            onPress={() => navigation.navigate('LocalePreferences' as never)}
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
        </View>

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
              thumbColor="#ffffff"
            />
          </View>

          <TouchableOpacity
            style={[styles.settingItem, styles.lastItem]}
            onPress={() => preferences.notificationsEnabled && setShowTimePicker(true)}
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
                        selectedHour === hour && { color: '#ffffff', fontWeight: '700' },
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
                        selectedMinute === minute && { color: '#ffffff', fontWeight: '700' },
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
                <Text style={[styles.modalButtonText, { color: '#ffffff' }]}>
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
                  <Text style={[styles.modalButtonText, { color: '#ffffff' }]}>
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
    borderRadius: 16,
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
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
  settingValue: {
    fontSize: 14,
  },
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontSizeButton: {
    padding: 8,
    borderRadius: 8,
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
  modalContent: {
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
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
    borderRadius: 8,
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
    borderRadius: 12,
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
    borderRadius: 8,
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
});
