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
  TextInput,
} from 'react-native';
import { layout, radius, spacing, typography } from '../../design/system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Bell,
  Bug,
  Calculator,
  CheckCircle2,
  Clock,
  CloudDownload,
  Globe,
  KeyRound,
  Layers,
  MapPin,
  MessageSquare,
  Moon,
  Sun,
  Trash2,
  TriangleAlert,
  Type,
  User,
  UserX,
  type LucideIcon,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import {
  AppButton,
  AppCard,
  BackArrowIcon,
  IconButton,
  ListRow,
  TabSwitch,
} from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import { mmkvInstance } from '../../stores/mmkvStorage';
import { useDisplayFont, useFontSize, useI18n, useTabBarHeight } from '../../hooks';
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
import { resolveLocaleSummary } from './settingsLocaleSummaryModel';
import { getChapterFeedbackPreferenceSummary } from './settingsPreferenceModel';
import {
  scheduleDailyReminder,
  cancelDailyReminder,
  requestNotificationPermissions,
} from '../../services/notifications';
import type { MoreStackParamList } from '../../navigation/types';
import { hexWithAlpha, lightHaptic } from '../../utils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];
type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;

/** Matches ListRow's own leading glyph so block rows line up with list rows. */
const ROW_ICON_SIZE = 18;
const ICON_STROKE = 2;
/** ListRow insets its separator past the glyph; blocks in the card must match. */
const ROW_SEPARATOR_INSET = ROW_ICON_SIZE + spacing.md;
/** iOS switch off-track: the old `+ '55'` alpha suffix, expressed as a ratio. */
const SWITCH_OFF_ALPHA = 0.33;
/** The stepper's A-/A+ glyphs when the size is already at the end of the scale. */
const STEPPER_DISABLED_ALPHA = 0.4;
/** A row that cannot act yet still has to be legible, just clearly inert. */
const DISABLED_ROW_OPACITY = 0.45;

// The EL system ships two scopes, so the selector is a two-up segment carrying a
// sun and a moon rather than five labelled swatch chips.
const THEME_SEGMENTS: ReadonlyArray<{
  mode: ThemeMode;
  icon: LucideIcon;
  labelKey: string;
}> = [
  { mode: 'light', icon: Sun, labelKey: 'settings.themeLight' },
  { mode: 'dark', icon: Moon, labelKey: 'settings.themeDark' },
];

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, themeMode, setTheme } = useTheme();
  const displayFont = useDisplayFont();
  const settingSwitchOffColor = hexWithAlpha(colors.secondaryText, SWITCH_OFF_ALPHA);
  const settingSwitchTrackColor = {
    false: settingSwitchOffColor,
    true: colors.accentPrimary,
  };
  const { t, currentLanguage, setLanguage, availableLanguages } = useI18n();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const { label: fontSizeLabel, increase, decrease, canIncrease, canDecrease } = useFontSize();
  // Absolute tab bar overlays the bottom of nested More screens; pad the scroll
  // content so the last row (Clear Cache) clears it.
  const { contentClearance } = useTabBarHeight();
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

  // TabSwitch already plays the selection haptic when a segment changes; a second call
  // here produced a double tick after the EL migration, so the handler stays silent.
  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    syncPreferences().catch(() => {});
  };

  // TabSwitch hands back the segment key as a plain string; resolve it against
  // the segment table rather than casting, so an unknown key is simply ignored.
  const handleThemeSegmentChange = (key: string) => {
    const segment = THEME_SEGMENTS.find((candidate) => candidate.mode === key);
    if (!segment) {
      return;
    }
    handleThemeChange(segment.mode);
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
        setChapterFeedbackIdentityError(t('common.unexpectedError'));
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
            : t('common.unexpectedError')
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

  const localeSummary = resolveLocaleSummary({
    countryCode: preferences.countryCode ?? null,
    countryName: preferences.countryName ?? null,
    contentLanguageNativeName: preferences.contentLanguageNativeName ?? null,
    currentLanguage,
    resolveCountryDisplayName: (countryCode, languageCode) =>
      localeSearchEngine.getCountryDisplayName(countryCode, languageCode as LanguageCode),
    fallbackLabel: t('common.notSet'),
  });

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
        Alert.alert(t('common.error'), t('settings.deleteAccountError'));
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

  // The A-/A+ stepper stays a bespoke control: it is a three-stop scale, not a
  // switch or a picker, and the label between the buttons is the value.
  const fontSizeStepper = (
    <View style={styles.fontSizeControls}>
      <TouchableOpacity
        style={[
          styles.fontSizeButton,
          { backgroundColor: colors.muted },
          !canDecrease && [
            styles.fontSizeButtonDisabled,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong },
          ],
        ]}
        onPress={decrease}
        disabled={!canDecrease}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canDecrease }}
      >
        <Text
          style={[
            styles.fontSizeText,
            { color: colors.primaryText },
            !canDecrease && { color: hexWithAlpha(colors.secondaryText, STEPPER_DISABLED_ALPHA) },
          ]}
        >
          A-
        </Text>
      </TouchableOpacity>
      <Text
        style={[styles.fontSizeValue, displayFont.regular, { color: colors.secondaryText }]}
        numberOfLines={1}
      >
        {fontSizeLabel}
      </Text>
      <TouchableOpacity
        style={[
          styles.fontSizeButton,
          { backgroundColor: colors.muted },
          !canIncrease && [
            styles.fontSizeButtonDisabled,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong },
          ],
        ]}
        onPress={increase}
        disabled={!canIncrease}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canIncrease }}
      >
        <Text
          style={[
            styles.fontSizeText,
            { color: colors.primaryText },
            !canIncrease && { color: hexWithAlpha(colors.secondaryText, STEPPER_DISABLED_ALPHA) },
          ]}
        >
          A+
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
        <View style={styles.header}>
          <IconButton
            icon={BackArrowIcon}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
          <Text
            style={[styles.headerEyebrow, displayFont.regular, { color: colors.secondaryText }]}
            numberOfLines={1}
          >
            {t('settings.title')}
          </Text>
        </View>

        {/* Reading Settings */}
        <View style={styles.group}>
          <Text style={[styles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('settings.reading')}
          </Text>
          <AppCard padding={0} style={styles.groupCard}>
            <ListRow title={t('settings.fontSize')} leadingIcon={Type} trailing={fontSizeStepper} />

            {/* Appearance is a block, not a row: the segment needs the full width
                of the card, so the label sits above it rather than beside it. */}
            <View style={styles.themeBlock}>
              <View style={styles.blockHeader}>
                <Moon
                  size={ROW_ICON_SIZE}
                  color={colors.secondaryText}
                  strokeWidth={ICON_STROKE}
                  style={styles.blockIcon}
                />
                <Text style={[typography.rowTitle, { color: colors.primaryText }]}>
                  {t('settings.themeMode')}
                </Text>
              </View>
              <TabSwitch
                segments={THEME_SEGMENTS.map(({ mode, icon, labelKey }) => ({
                  key: mode,
                  label: t(labelKey),
                  icon,
                }))}
                value={themeMode}
                onChange={handleThemeSegmentChange}
                fullWidth
                accessibilityLabel={t('settings.themeMode')}
              />
            </View>
            <View style={[styles.blockSeparator, { backgroundColor: colors.borderStrong }]} />

            <ListRow
              title={t('settings.language')}
              leadingIcon={Globe}
              value={availableLanguages[currentLanguage].nativeName}
              showChevron
              onPress={() => setShowLanguagePicker(true)}
            />

            <ListRow
              title={t('settings.nationAndLanguage')}
              leadingIcon={MapPin}
              value={localeSummary}
              showChevron
              onPress={() => navigation.navigate('LocalePreferences')}
            />

            <ListRow
              title={t('settings.chapterFeedback')}
              subtitle={chapterFeedbackSummary}
              leadingIcon={MessageSquare}
              trailing={
                <Switch
                  value={chapterFeedbackEnabled}
                  onValueChange={handleChapterFeedbackToggle}
                  trackColor={settingSwitchTrackColor}
                  ios_backgroundColor={settingSwitchOffColor}
                  thumbColor={colors.cardBackground}
                  accessibilityLabel={t('settings.chapterFeedback')}
                />
              }
            />

            {/* Tapping anywhere on this row toggles review mode, exactly as it
                did before the redesign — the switch is the visible state. */}
            <ListRow
              title={t('settings.translatorAccess')}
              subtitle={
                translatorReviewEnabled
                  ? t('settings.translatorAccessSummaryOn')
                  : t('settings.translatorAccessSummaryOff')
              }
              leadingIcon={KeyRound}
              onPress={() => handleTranslatorReviewToggle(!translatorReviewEnabled)}
              accessibilityLabel={t('settings.translatorAccess')}
              trailing={
                <Switch
                  value={translatorReviewEnabled}
                  onValueChange={handleTranslatorReviewToggle}
                  trackColor={settingSwitchTrackColor}
                  ios_backgroundColor={settingSwitchOffColor}
                  thumbColor={colors.cardBackground}
                  accessibilityLabel={t('settings.translatorAccess')}
                />
              }
            />

            <ListRow
              title={t('settings.chapterFeedbackIdentity')}
              subtitle={chapterFeedbackIdentitySummary}
              leadingIcon={User}
              value={savedChapterFeedbackIdentity ? t('common.edit') : t('common.notSet')}
              showChevron
              onPress={handleOpenChapterFeedbackIdentityEditor}
              isLast={!chapterFeedbackEnabled}
            />

            {chapterFeedbackEnabled ? (
              <ListRow
                title={t('myFeedback.settingsRow')}
                subtitle={t('myFeedback.settingsRowSummary')}
                leadingIcon={Layers}
                showChevron
                onPress={() => navigation.navigate('MyFeedback')}
                isLast
              />
            ) : null}
          </AppCard>
        </View>

        <View style={styles.group}>
          <AppCard padding={0} style={styles.groupCard}>
            <ListRow
              title={t('onboarding.privacyTitle')}
              leadingIcon={Calculator}
              showChevron
              onPress={() => navigation.navigate('PrivacyPreferences')}
              isLast
            />
          </AppCard>
        </View>

        {/* Accent-palette picker removed — ember is the sole accent palette; the
            2 theme scopes above remain the appearance control. */}

        <Modal
          visible={showChapterFeedbackIdentityModal}
          transparent
          statusBarTranslucent
          navigationBarTranslucent
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
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.modalTitle, displayFont.bold, { color: colors.primaryText }]}>
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
                        borderColor: colors.borderStrong,
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
                        borderColor: colors.borderStrong,
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
                <AppButton
                  label={t('common.cancel')}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  disabled={isSavingChapterFeedbackIdentity}
                  onPress={closeChapterFeedbackIdentityModal}
                  style={styles.modalButtonFlex}
                />
                <AppButton
                  label={t('common.save')}
                  variant="primary"
                  size="md"
                  fullWidth={false}
                  loading={isSavingChapterFeedbackIdentity}
                  disabled={isSavingChapterFeedbackIdentity}
                  onPress={() => {
                    void handleSaveChapterFeedbackIdentity();
                  }}
                  style={styles.modalButtonFlex}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showTranslatorAccessModal}
          transparent
          statusBarTranslucent
          navigationBarTranslucent
          animationType="fade"
          onRequestClose={() => setShowTranslatorAccessModal(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowTranslatorAccessModal(false)}
            />
            <View
              style={[
                styles.modalContent,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.modalTitle, displayFont.bold, { color: colors.primaryText }]}>
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
                    borderColor: colors.borderStrong,
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
                                ? colors.muted
                                : colors.background,
                          },
                        ]}
                        accessibilityRole="button"
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
                <AppButton
                  label={t('common.cancel')}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={() => setShowTranslatorAccessModal(false)}
                  style={styles.modalButtonFlex}
                />
                <AppButton
                  label={t('settings.translatorAccessUnlock')}
                  variant="primary"
                  size="md"
                  fullWidth={false}
                  loading={isCheckingTranslatorAccess}
                  disabled={translatorAccessPasscode.length === 0 || isCheckingTranslatorAccess}
                  onPress={() => {
                    void handleTranslatorAccessSubmit();
                  }}
                  style={styles.modalButtonFlex}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Notifications */}
        <View style={styles.group}>
          <Text style={[styles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('settings.notifications')}
          </Text>
          <AppCard padding={0} style={styles.groupCard}>
            <ListRow
              title={t('settings.dailyReminder')}
              leadingIcon={Bell}
              trailing={
                <Switch
                  value={preferences.notificationsEnabled}
                  onValueChange={handleNotificationToggle}
                  trackColor={settingSwitchTrackColor}
                  ios_backgroundColor={settingSwitchOffColor}
                  thumbColor={colors.cardBackground}
                  accessibilityLabel={t('settings.dailyReminder')}
                />
              }
            />

            {preferences.notificationsEnabled ? (
              <ListRow
                title={t('settings.reminderTime')}
                leadingIcon={Clock}
                value={formatTime(preferences.reminderTime)}
                onPress={openTimePicker}
                isLast
              />
            ) : (
              // Without a reminder there is no time to set: the row stays legible
              // but inert, and announces itself as disabled rather than silent.
              <View
                style={styles.disabledRow}
                accessible
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={t('settings.reminderTime')}
              >
                <ListRow
                  title={t('settings.reminderTime')}
                  leadingIcon={Clock}
                  value={formatTime(preferences.reminderTime)}
                  isLast
                />
              </View>
            )}
          </AppCard>
        </View>

        {/* Data */}
        <View style={styles.group}>
          <Text style={[styles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('settings.data')}
          </Text>
          <AppCard padding={0} style={styles.groupCard}>
            <ListRow
              title={t('settings.diagnostics.title')}
              leadingIcon={Bug}
              showChevron
              onPress={() => navigation.navigate('Diagnostics')}
            />

            <ListRow
              title={t('settings.downloadForOffline')}
              leadingIcon={CloudDownload}
              trailing={
                <View style={styles.statusTrailing}>
                  <Text
                    style={[typography.mono, displayFont.regular, { color: colors.secondaryText }]}
                    numberOfLines={1}
                  >
                    {t('common.available')}
                  </Text>
                  <CheckCircle2
                    size={ROW_ICON_SIZE}
                    color={colors.success}
                    strokeWidth={ICON_STROKE}
                  />
                </View>
              }
            />

            <ListRow
              title={t('settings.clearCache')}
              leadingIcon={Trash2}
              destructive
              onPress={handleClearCache}
              isLast={!user}
            />

            {user ? (
              <ListRow
                title={t('settings.deleteAccount')}
                leadingIcon={UserX}
                destructive
                onPress={() => setShowDeleteConfirm(true)}
                isLast
              />
            ) : null}
          </AppCard>
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.modalTitle, displayFont.bold, { color: colors.primaryText }]}>
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
                      selectedHour === hour && { backgroundColor: colors.accentPrimary },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedHour === hour }}
                    onPress={() => setSelectedHour(hour)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        { color: colors.secondaryText },
                        selectedHour === hour && {
                          color: colors.onAccent,
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
                      selectedMinute === minute && { backgroundColor: colors.accentPrimary },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedMinute === minute }}
                    onPress={() => setSelectedMinute(minute)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        { color: colors.secondaryText },
                        selectedMinute === minute && {
                          color: colors.onAccent,
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
              <AppButton
                label={t('common.cancel')}
                variant="secondary"
                size="md"
                fullWidth={false}
                onPress={() => setShowTimePicker(false)}
                style={styles.modalButtonFlex}
              />
              <AppButton
                label={t('settings.setTime')}
                variant="primary"
                size="md"
                fullWidth={false}
                onPress={handleTimeSelect}
                style={styles.modalButtonFlex}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.modalTitle, displayFont.bold, { color: colors.primaryText }]}>
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
                    { borderBottomColor: colors.borderStrong },
                    currentLanguage === language.code && {
                      backgroundColor: colors.accentSoft,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: currentLanguage === language.code }}
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
                    <CheckCircle2
                      size={22}
                      color={colors.accentPrimary}
                      strokeWidth={ICON_STROKE}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <AppButton
              label={t('common.cancel')}
              variant="secondary"
              size="md"
              onPress={() => setShowLanguagePicker(false)}
              style={styles.languageCancelButton}
            />
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => !isDeleting && setShowDeleteConfirm(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <TriangleAlert
              size={44}
              color={colors.error}
              strokeWidth={ICON_STROKE}
              style={styles.deleteWarningIcon}
            />
            <Text style={[styles.modalTitle, displayFont.bold, { color: colors.primaryText }]}>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  headerEyebrow: {
    ...typography.eyebrow,
    flexShrink: 1,
  },
  group: {
    marginBottom: spacing.xl,
  },
  groupEyebrow: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
  },
  groupCard: {
    paddingHorizontal: layout.cardPadding,
  },
  themeBlock: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockIcon: {
    marginRight: spacing.md,
  },
  blockSeparator: {
    height: 1,
    marginLeft: ROW_SEPARATOR_INSET,
  },
  disabledRow: {
    opacity: DISABLED_ROW_OPACITY,
  },
  statusTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontSizeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  fontSizeButtonDisabled: {
    borderWidth: 1,
  },
  fontSizeText: {
    ...typography.captionStrong,
  },
  fontSizeValue: {
    ...typography.mono,
    marginHorizontal: spacing.md,
    minWidth: 58,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 320,
  },
  chapterFeedbackIdentityModalContent: {
    width: '88%',
    maxWidth: 360,
  },
  modalTitle: {
    ...typography.pageTitle,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  chapterFeedbackIdentityBody: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  feedbackIdentityFields: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  feedbackIdentityField: {
    gap: spacing.sm,
  },
  feedbackIdentityLabel: {
    ...typography.captionStrong,
  },
  feedbackIdentityInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  feedbackIdentityError: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  translatorAccessBody: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  translatorAccessInput: {
    ...typography.sectionTitle,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  translatorKeypad: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  translatorKeyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  translatorKey: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translatorKeyText: {
    ...typography.button,
  },
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: spacing.lg,
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    marginVertical: 2,
  },
  // ASCII digits only, so these keep the display face without a locale fallback.
  timeOptionText: {
    ...typography.numeralRow,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.8,
  },
  timeSeparator: {
    ...typography.numeralRow,
    marginHorizontal: spacing.sm,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalButtonFlex: {
    flex: 1,
  },
  languageList: {
    marginBottom: spacing.sm,
    maxHeight: 420,
  },
  languageListContent: {
    paddingBottom: spacing.xs,
  },
  languageCancelButton: {
    marginTop: spacing.lg,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  languageInfo: {
    flex: 1,
  },
  languageNative: {
    ...typography.cardTitle,
    marginBottom: 2,
  },
  languageName: {
    ...typography.caption,
  },
  languageHint: {
    ...typography.micro,
    marginTop: spacing.xs,
  },
  deleteWarningIcon: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  deleteWarningText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
