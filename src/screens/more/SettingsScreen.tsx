import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { layout, spacing, typography } from '../../design/system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calculator } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { AppCard, BackArrowIcon, IconButton, ListRow } from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import {
  getFeedbackParticipationMode,
  useTranslatorReviewStore,
} from '../../stores/translatorReviewStore';
import { useDisplayFont, useI18n, useTabBarHeight } from '../../hooks';
import { syncPreferences } from '../../services/sync';
import { type LanguageCode } from '../../constants/languages';
import { localeSearchEngine } from '../../services/onboarding/localeSelection';
import { resolveLocaleSummary } from './settingsLocaleSummaryModel';
import { getChapterFeedbackPreferenceSummary } from './settingsPreferenceModel';
import type { MoreStackParamList } from '../../navigation/types';
import {
  ChapterFeedbackIdentityModal,
  DataSettingsSection,
  DeleteAccountModal,
  InterfaceLanguagePickerModal,
  NotificationSettingsSection,
  ParticipationAccessModal,
  ReadingSettingsSection,
  ReminderTimePickerModal,
  formatReminderTimeLabel,
  getChapterFeedbackIdentitySummary,
  isLegacyCreoleContentLanguage,
  sectionStyles,
  useChapterFeedbackIdentityEditor,
  useDataSettings,
  useParticipationAccess,
  useReminderSettings,
} from './settings';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, setTheme } = useTheme();
  const displayFont = useDisplayFont();
  const { t, currentLanguage, setLanguage, availableLanguages } = useI18n();
  // Only the preferences this screen reads: a change to any other one (reading
  // position, font size, ...) no longer re-renders every section and modal.
  const localePreferences = useAuthStore(
    useShallow((state) => ({
      countryCode: state.preferences.countryCode,
      countryName: state.preferences.countryName,
      contentLanguageCode: state.preferences.contentLanguageCode,
      contentLanguageName: state.preferences.contentLanguageName,
      contentLanguageNativeName: state.preferences.contentLanguageNativeName,
    }))
  );
  const chapterFeedbackPreference = useAuthStore(
    (state) => state.preferences.chapterFeedbackEnabled
  );
  const setPreferences = useAuthStore((state) => state.setPreferences);
  // Absolute tab bar overlays the bottom of nested More screens; pad the scroll
  // content so the last row (Clear Cache) clears it.
  const { contentClearance } = useTabBarHeight();
  const participationState = useTranslatorReviewStore((state) => state.mode);
  const translatorReviewEnabled = useTranslatorReviewStore((state) => state.enabled);
  const participationMode = getFeedbackParticipationMode(
    { mode: participationState, enabled: translatorReviewEnabled },
    chapterFeedbackPreference
  );
  const chapterFeedbackEnabled =
    participationMode === 'community' || participationMode === 'scripture_council';
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  const access = useParticipationAccess();
  const identityEditor = useChapterFeedbackIdentityEditor(chapterFeedbackEnabled);
  const reminder = useReminderSettings();
  const data = useDataSettings();

  const { contentLanguageCode, contentLanguageName, contentLanguageNativeName } = localePreferences;
  useEffect(() => {
    if (
      !isLegacyCreoleContentLanguage({
        code: contentLanguageCode,
        name: contentLanguageName,
        nativeName: contentLanguageNativeName,
      })
    ) {
      return;
    }

    setPreferences({
      contentLanguageCode: 'en',
      contentLanguageName: 'English',
      contentLanguageNativeName: 'English',
    });
    syncPreferences().catch(() => {});
  }, [contentLanguageCode, contentLanguageName, contentLanguageNativeName, setPreferences]);

  // TabSwitch already plays the selection haptic when a segment changes; a second call
  // here produced a double tick after the EL migration, so the handler stays silent.
  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    syncPreferences().catch(() => {});
  };

  const handleLanguageSelect = async (languageCode: LanguageCode) => {
    await setLanguage(languageCode);
    setShowLanguagePicker(false);
  };

  const handleChapterFeedbackToggle = (enabled: boolean) => {
    if (!enabled) {
      useTranslatorReviewStore.getState().disableFeedback();
      setPreferences({ chapterFeedbackEnabled: false });
      syncPreferences().catch(() => {});
      return;
    }

    // Participation is a Settings choice. Identity remains editable separately and is
    // required only when the person sends a response.
    useTranslatorReviewStore.getState().enableCommunityFeedback();
    setPreferences({ chapterFeedbackEnabled: true });
    syncPreferences().catch(() => {});
  };

  const localeSummary = resolveLocaleSummary({
    countryCode: localePreferences.countryCode ?? null,
    countryName: localePreferences.countryName ?? null,
    contentLanguageNativeName: contentLanguageNativeName ?? null,
    currentLanguage,
    resolveCountryDisplayName: (countryCode, languageCode) =>
      localeSearchEngine.getCountryDisplayName(countryCode, languageCode as LanguageCode),
    fallbackLabel: t('common.notSet'),
  });

  const chapterFeedbackSummary = chapterFeedbackEnabled
    ? `${t('settings.chapterFeedbackSummaryOn')} · ${
        participationMode === 'scripture_council' ? t('feedback.council') : t('feedback.community')
      }`
    : getChapterFeedbackPreferenceSummary(false, {
        enabledLabel: t('settings.chapterFeedbackSummaryOn'),
        disabledLabel: t('settings.chapterFeedbackSummaryOff'),
      });

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
            accessibilityRole="header"
            style={[styles.headerEyebrow, displayFont.regular, { color: colors.secondaryText }]}
            numberOfLines={1}
          >
            {t('settings.title')}
          </Text>
        </View>

        <ReadingSettingsSection
          onThemeChange={handleThemeChange}
          languageLabel={availableLanguages[currentLanguage].nativeName}
          onOpenLanguagePicker={() => setShowLanguagePicker(true)}
          localeSummary={localeSummary}
          onOpenLocalePreferences={() => navigation.navigate('LocalePreferences')}
          participationMode={participationMode}
          chapterFeedbackEnabled={chapterFeedbackEnabled}
          chapterFeedbackSummary={chapterFeedbackSummary}
          onChapterFeedbackToggle={handleChapterFeedbackToggle}
          onSelectCommunity={() => useTranslatorReviewStore.getState().enableCommunityFeedback()}
          onSelectCouncil={() => {
            if (participationMode !== 'scripture_council') access.open('scripture_council');
          }}
          translatorReviewEnabled={translatorReviewEnabled}
          onTranslatorReviewToggle={access.handleTranslatorReviewToggle}
          identitySummary={getChapterFeedbackIdentitySummary(
            identityEditor.savedIdentity,
            t('settings.chapterFeedbackIdentitySummaryOff')
          )}
          hasIdentity={Boolean(identityEditor.savedIdentity)}
          onEditIdentity={() => identityEditor.open(false)}
          onOpenMyFeedback={() => navigation.navigate('MyFeedback')}
        />

        <View style={sectionStyles.group}>
          <AppCard padding={0} style={sectionStyles.groupCard}>
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

        <ChapterFeedbackIdentityModal
          visible={identityEditor.isVisible}
          name={identityEditor.name}
          role={identityEditor.role}
          error={identityEditor.error}
          isSaving={identityEditor.isSaving}
          onChangeName={identityEditor.changeName}
          onChangeRole={identityEditor.changeRole}
          onClose={identityEditor.close}
          onSave={() => {
            void identityEditor.save();
          }}
        />

        <ParticipationAccessModal
          visible={access.isVisible}
          kind={access.kind}
          passcode={access.passcode}
          error={access.error}
          coverage={access.coverage}
          isChecking={access.isChecking}
          currentTranslation={access.currentTranslation}
          onPressKey={access.pressKey}
          onClose={access.close}
          onSubmit={() => {
            void access.submit();
          }}
        />

        <NotificationSettingsSection
          notificationsEnabled={reminder.notificationsEnabled}
          reminderTimeLabel={formatReminderTimeLabel(
            reminder.reminderTime,
            currentLanguage,
            t('common.notSet')
          )}
          onToggle={reminder.handleNotificationToggle}
          onOpenTimePicker={reminder.openTimePicker}
        />

        <DataSettingsSection
          isSignedIn={data.isSignedIn}
          onOpenDiagnostics={() => navigation.navigate('Diagnostics')}
          onClearCache={data.handleClearCache}
          onDeleteAccount={data.openDeleteConfirm}
        />
      </ScrollView>

      <ReminderTimePickerModal
        visible={reminder.showTimePicker}
        selectedHour={reminder.selectedHour}
        selectedMinute={reminder.selectedMinute}
        onSelectHour={reminder.setSelectedHour}
        onSelectMinute={reminder.setSelectedMinute}
        onClose={reminder.closeTimePicker}
        onConfirm={reminder.handleTimeSelect}
      />

      <InterfaceLanguagePickerModal
        visible={showLanguagePicker}
        currentLanguage={currentLanguage}
        onSelect={handleLanguageSelect}
        onClose={() => setShowLanguagePicker(false)}
      />

      <DeleteAccountModal
        visible={data.showDeleteConfirm}
        isDeleting={data.isDeleting}
        onClose={data.closeDeleteConfirm}
        onConfirm={data.handleDeleteAccount}
      />
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
});
