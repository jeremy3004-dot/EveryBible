import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import {
  listAvailableTranslations,
  getUserTranslationPreferences,
  setUserTranslationPreferences,
} from '../../services/translations/translationService';
import type { TranslationCatalogEntry, UserTranslationPreferences } from '../../services/supabase/types';
import type { MoreStackParamList } from '../../navigation/types';
import { useBibleStore } from '../../stores/bibleStore';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'TranslationBrowser'>;

type PreferenceField = 'primary' | 'secondary' | 'audio';

interface LanguageFilter {
  code: string; // 'all' | ISO 639-3 code
  label: string; // Display name
}

interface TranslationSection {
  title: string;
  data: TranslationCatalogEntry[];
  sectionKey: 'installed' | 'available';
}

function groupTranslationsByInstallState(
  translations: TranslationCatalogEntry[],
  isLocallyAvailableFn: (id: string) => boolean,
  installedLabel: string,
  availableLabel: string
): TranslationSection[] {
  const installed: TranslationCatalogEntry[] = [];
  const available: TranslationCatalogEntry[] = [];

  for (const entry of translations) {
    if (isLocallyAvailableFn(entry.translation_id)) {
      installed.push(entry);
    } else {
      available.push(entry);
    }
  }

  const sections: TranslationSection[] = [];
  if (installed.length > 0) {
    sections.push({ title: installedLabel, data: installed, sectionKey: 'installed' });
  }
  if (available.length > 0) {
    sections.push({ title: availableLabel, data: available, sectionKey: 'available' });
  }
  return sections;
}

function getLicenseLabel(licenseType: string | null, t: (key: string) => string): string {
  if (!licenseType) return '';
  const lower = licenseType.toLowerCase();
  if (lower.includes('public') || lower.includes('pd')) {
    return t('translations.publicDomain');
  }
  return licenseType;
}

export function TranslationBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const storeTranslations = useBibleStore((state) => state.translations);
  const storeProgress = useBibleStore((state) => state.downloadProgress);

  const [catalogEntries, setCatalogEntries] = useState<TranslationCatalogEntry[]>([]);
  const [preferences, setPreferences] = useState<UserTranslationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingField, setSavingField] = useState<PreferenceField | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  // Returns true if a translation ID is available to read locally (bundled text or installed pack).
  // Uses getState() so it is not a reactive dependency and won't re-run the load callback.
  const isLocallyAvailable = useCallback(
    (translationId: string): boolean => {
      // Also check reactive storeTranslations so the list refreshes after download completes
      const local = storeTranslations.find((tr) => tr.id === translationId.toLowerCase());
      return Boolean(local?.hasText || local?.isDownloaded);
    },
    [storeTranslations]
  );

  // Build unique language filter list from catalog, deduplicating by language_name
  // so 'en' and 'eng' both labeled 'English' collapse into one pill.
  const languageFilters = useMemo<LanguageFilter[]>(() => {
    const seen = new Set<string>();
    const langs: LanguageFilter[] = [];
    for (const entry of catalogEntries) {
      const label = entry.language_name;
      if (!seen.has(label)) {
        seen.add(label);
        langs.push({ code: label, label });
      }
    }
    langs.sort((a, b) => {
      if (a.label === 'English') return -1;
      if (b.label === 'English') return 1;
      return a.label.localeCompare(b.label);
    });
    return langs;
  }, [catalogEntries]);

  const filteredEntries = useMemo<TranslationCatalogEntry[]>(() => {
    if (selectedLanguage === 'all') return catalogEntries;
    return catalogEntries.filter((e) => e.language_name === selectedLanguage);
  }, [catalogEntries, selectedLanguage]);

  const sections = groupTranslationsByInstallState(
    filteredEntries,
    isLocallyAvailable,
    t('translations.installed'),
    t('translations.available')
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catalogResult, prefsResult] = await Promise.all([
        listAvailableTranslations(),
        getUserTranslationPreferences(),
      ]);

      if (catalogResult.success && catalogResult.data && catalogResult.data.length > 0) {
        setCatalogEntries(catalogResult.data);
      } else {
        // Offline or empty catalog: surface locally-available translations as a fallback.
        const localState = useBibleStore.getState().translations;
        const fallback: TranslationCatalogEntry[] = localState
          .filter((tr) => tr.hasText || tr.isDownloaded)
          .map((tr) => ({
            id: tr.id,
            translation_id: tr.id.toUpperCase(),
            name: tr.name,
            abbreviation: tr.abbreviation,
            language_code: 'en',
            language_name: tr.language,
            license_type: tr.copyright ?? null,
            license_url: null,
            source_url: null,
            has_text: tr.hasText,
            has_audio: tr.hasAudio,
            is_bundled: true,
            is_available: true,
            sort_order: 0,
            created_at: '',
            updated_at: '',
          }));
        setCatalogEntries(fallback);
      }
      if (prefsResult.success) {
        setPreferences(prefsResult.data ?? null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (entry: TranslationCatalogEntry) => {
    const storeTranslationId = entry.translation_id.toLowerCase();
    setDownloadingId(storeTranslationId);

    // Ensure the translation exists in bibleStore.translations
    // (add it if it only exists in the Supabase catalog but not locally)
    const state = useBibleStore.getState();
    const existsInStore = state.translations.some((tr) => tr.id === storeTranslationId);
    if (!existsInStore) {
      useBibleStore.setState((prev) => ({
        translations: [
          ...prev.translations,
          {
            id: storeTranslationId,
            name: entry.name,
            abbreviation: entry.abbreviation,
            language: entry.language_name,
            description: entry.license_type ?? '',
            copyright: entry.license_type ?? 'Public Domain',
            isDownloaded: false,
            downloadedBooks: [],
            downloadedAudioBooks: [],
            totalBooks: 66,
            sizeInMB: 5,
            hasText: false,
            hasAudio: entry.has_audio,
            audioGranularity: 'none' as const,
            source: 'runtime' as const,
            installState: 'remote-only' as const,
          },
        ],
      }));
    }

    try {
      await useBibleStore.getState().downloadTranslation(storeTranslationId);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSetPrimary = async (translation: TranslationCatalogEntry) => {
    setSavingField('primary');
    try {
      // Always apply locally-available translations immediately — Supabase sync is a bonus.
      if (isLocallyAvailable(translation.translation_id)) {
        setCurrentTranslation(translation.translation_id.toLowerCase());
      }

      const result = await setUserTranslationPreferences({ primary: translation.translation_id });
      if (result.success) {
        setPreferences((prev) => ({
          ...(prev ?? { id: '', user_id: '', secondary_translation: null, audio_translation: null, synced_at: '' }),
          primary_translation: translation.translation_id,
        }));
      }
      // Silently ignore auth failures — local switch already happened above.
    } finally {
      setSavingField(null);
    }
  };

  const showPreferencePicker = (field: PreferenceField) => {
    if (catalogEntries.length === 0) return;

    const options = catalogEntries.map((tr) => ({
      text: `${tr.abbreviation} – ${tr.name}`,
      onPress: async () => {
        setSavingField(field);
        try {
          const payload =
            field === 'primary'
              ? { primary: tr.translation_id }
              : field === 'secondary'
                ? { secondary: tr.translation_id }
                : { audio: tr.translation_id };

          // Apply locally-available primary translations immediately — Supabase sync is a bonus.
          if (field === 'primary' && isLocallyAvailable(tr.translation_id)) {
            setCurrentTranslation(tr.translation_id.toLowerCase());
          }

          const result = await setUserTranslationPreferences(payload);
          if (result.success) {
            setPreferences((prev) => ({
              ...(prev ?? { id: '', user_id: '', primary_translation: 'BSB', secondary_translation: null, audio_translation: null, synced_at: '' }),
              ...(field === 'primary' ? { primary_translation: tr.translation_id } : {}),
              ...(field === 'secondary' ? { secondary_translation: tr.translation_id } : {}),
              ...(field === 'audio' ? { audio_translation: tr.translation_id } : {}),
            }));
          }
          // Silently ignore auth failures — local switch already happened above.
        } finally {
          setSavingField(null);
        }
      },
    }));

    const clearOption =
      field !== 'primary'
        ? [
            {
              text: t('common.notSet'),
              onPress: async () => {
                setSavingField(field);
                try {
                  const payload =
                    field === 'secondary' ? { secondary: null } : { audio: null };
                  const result = await setUserTranslationPreferences(payload);
                  if (result.success) {
                    setPreferences((prev) => ({
                      ...(prev ?? { id: '', user_id: '', primary_translation: 'BSB', secondary_translation: null, audio_translation: null, synced_at: '' }),
                      ...(field === 'secondary' ? { secondary_translation: null } : {}),
                      ...(field === 'audio' ? { audio_translation: null } : {}),
                    }));
                  }
                } finally {
                  setSavingField(null);
                }
              },
            },
          ]
        : [];

    Alert.alert(
      field === 'primary'
        ? t('translations.primary')
        : field === 'secondary'
          ? t('translations.secondary')
          : t('translations.audioPreference'),
      undefined,
      [...options, ...clearOption, { text: t('common.cancel'), style: 'cancel' as const }]
    );
  };

  const getTranslationLabel = (id: string | null | undefined): string => {
    if (!id) return t('common.notSet');
    const match = catalogEntries.find((tr) => tr.translation_id === id);
    if (!match) return id;
    return `${match.abbreviation} – ${match.name}`;
  };

  const primaryId = preferences?.primary_translation ?? 'BSB';
  const secondaryId = preferences?.secondary_translation ?? null;
  const audioId = preferences?.audio_translation ?? null;

  const renderSectionHeader = ({ section }: { section: TranslationSection }) => (
    <Text
      style={[
        styles.sectionHeader,
        { color: colors.secondaryText, backgroundColor: colors.background },
      ]}
    >
      {section.title}
    </Text>
  );

  const renderTranslation = ({
    item,
    index,
    section,
  }: {
    item: TranslationCatalogEntry;
    index: number;
    section: TranslationSection;
  }) => {
    const storeId = item.translation_id.toLowerCase();
    const isPrimary = item.translation_id === primaryId;
    const isLast = index === section.data.length - 1;
    const licenseLabel = getLicenseLabel(item.license_type, t);
    const isPublicDomain =
      item.license_type?.toLowerCase().includes('public') ||
      item.license_type?.toLowerCase().includes('pd');

    const isInstalled = isLocallyAvailable(item.translation_id);
    const isCurrentlyDownloading = downloadingId === storeId;
    const downloadPct =
      isCurrentlyDownloading && storeProgress?.translationId === storeId
        ? storeProgress.progress
        : null;

    return (
      <TouchableOpacity
        style={[
          styles.translationRow,
          { borderBottomColor: colors.cardBorder },
          isLast && styles.lastRow,
          isPrimary && { backgroundColor: colors.cardBorder + '40' },
        ]}
        onPress={() => {
          if (isInstalled) {
            handleSetPrimary(item);
          } else if (!isCurrentlyDownloading) {
            handleDownload(item);
          }
        }}
        disabled={isCurrentlyDownloading}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.abbreviation}`}
        accessibilityState={{ selected: isPrimary }}
      >
        <View style={styles.translationMain}>
          <View style={styles.translationTitleRow}>
            <Text style={[styles.translationName, { color: colors.primaryText }]}>{item.name}</Text>
            <View style={[styles.chip, { backgroundColor: colors.cardBorder }]}>
              <Text style={[styles.chipText, { color: colors.secondaryText }]}>
                {item.abbreviation}
              </Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            {licenseLabel ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isPublicDomain
                      ? colors.success + '25'
                      : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: isPublicDomain ? colors.success : colors.secondaryText },
                  ]}
                >
                  {licenseLabel}
                </Text>
              </View>
            ) : null}

            {item.is_bundled ? (
              <View style={[styles.badge, { backgroundColor: colors.accentPrimary + '20' }]}>
                <Text style={[styles.badgeText, { color: colors.accentPrimary }]}>
                  {t('translations.bundled')}
                </Text>
              </View>
            ) : null}

            {item.has_audio ? (
              <Ionicons
                name="headset-outline"
                size={14}
                color={colors.secondaryText}
                style={styles.audioIcon}
                accessibilityLabel="Has audio"
              />
            ) : null}

            {isCurrentlyDownloading ? (
              <Text style={[styles.badgeText, { color: colors.secondaryText }]}>
                {downloadPct !== null
                  ? `${t('translations.downloading')} ${downloadPct}%`
                  : t('translations.downloading')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right side: check, download icon, or spinner */}
        {isInstalled && isPrimary ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accentPrimary} />
        ) : isInstalled ? (
          <View style={styles.checkPlaceholder} />
        ) : isCurrentlyDownloading ? (
          <ActivityIndicator size="small" color={colors.accentPrimary} />
        ) : (
          <Ionicons
            name="cloud-download-outline"
            size={22}
            color={colors.accentPrimary}
            accessibilityLabel={t('translations.download')}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('translations.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderTranslation}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        ListHeaderComponent={
          <>
            {/* Preferences Section */}
            <Text style={[styles.groupLabel, { color: colors.secondaryText }]}>
              {t('settings.reading')}
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
            >
              {/* Primary Translation */}
              <TouchableOpacity
                style={[styles.preferenceRow, { borderBottomColor: colors.cardBorder }]}
                onPress={() => showPreferencePicker('primary')}
                disabled={savingField === 'primary'}
                accessibilityRole="button"
                accessibilityLabel={t('translations.primary')}
              >
                <View style={styles.preferenceLeft}>
                  <Ionicons name="book-outline" size={22} color={colors.secondaryText} />
                  <Text style={[styles.preferenceLabel, { color: colors.primaryText }]}>
                    {t('translations.primary')}
                  </Text>
                </View>
                <View style={styles.preferenceRight}>
                  {savingField === 'primary' ? (
                    <ActivityIndicator size="small" color={colors.secondaryText} />
                  ) : (
                    <Text
                      style={[styles.preferenceValue, { color: colors.secondaryText }]}
                      numberOfLines={1}
                    >
                      {getTranslationLabel(primaryId)}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </View>
              </TouchableOpacity>

              {/* Comparison Translation */}
              <TouchableOpacity
                style={[styles.preferenceRow, { borderBottomColor: colors.cardBorder }]}
                onPress={() => showPreferencePicker('secondary')}
                disabled={savingField === 'secondary'}
                accessibilityRole="button"
                accessibilityLabel={t('translations.secondary')}
              >
                <View style={styles.preferenceLeft}>
                  <Ionicons name="copy-outline" size={22} color={colors.secondaryText} />
                  <Text style={[styles.preferenceLabel, { color: colors.primaryText }]}>
                    {t('translations.secondary')}
                  </Text>
                </View>
                <View style={styles.preferenceRight}>
                  {savingField === 'secondary' ? (
                    <ActivityIndicator size="small" color={colors.secondaryText} />
                  ) : (
                    <Text
                      style={[styles.preferenceValue, { color: colors.secondaryText }]}
                      numberOfLines={1}
                    >
                      {getTranslationLabel(secondaryId)}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </View>
              </TouchableOpacity>

              {/* Audio Translation */}
              <TouchableOpacity
                style={[styles.preferenceRow, styles.lastRow]}
                onPress={() => showPreferencePicker('audio')}
                disabled={savingField === 'audio'}
                accessibilityRole="button"
                accessibilityLabel={t('translations.audioPreference')}
              >
                <View style={styles.preferenceLeft}>
                  <Ionicons name="headset-outline" size={22} color={colors.secondaryText} />
                  <Text style={[styles.preferenceLabel, { color: colors.primaryText }]}>
                    {t('translations.audioPreference')}
                  </Text>
                </View>
                <View style={styles.preferenceRight}>
                  {savingField === 'audio' ? (
                    <ActivityIndicator size="small" color={colors.secondaryText} />
                  ) : (
                    <Text
                      style={[styles.preferenceValue, { color: colors.secondaryText }]}
                      numberOfLines={1}
                    >
                      {getTranslationLabel(audioId)}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Cloud Library header */}
            <Text
              style={[styles.groupLabel, { color: colors.secondaryText, marginTop: spacing.xl }]}
            >
              {t('translations.cloudLibrary')}
            </Text>

            {/* Language filter tabs */}
            {!isLoading && languageFilters.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.languageFilterBar}
              >
                <TouchableOpacity
                  style={[
                    styles.languagePill,
                    { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
                    selectedLanguage === 'all' && {
                      backgroundColor: colors.accentPrimary,
                      borderColor: colors.accentPrimary,
                    },
                  ]}
                  onPress={() => setSelectedLanguage('all')}
                >
                  <Text
                    style={[
                      styles.languagePillText,
                      { color: selectedLanguage === 'all' ? colors.background : colors.primaryText },
                    ]}
                  >
                    {t('common.all')}
                  </Text>
                </TouchableOpacity>
                {languageFilters.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languagePill,
                      { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
                      selectedLanguage === lang.code && {
                        backgroundColor: colors.accentPrimary,
                        borderColor: colors.accentPrimary,
                      },
                    ]}
                    onPress={() => setSelectedLanguage(lang.code)}
                  >
                    <Text
                      style={[
                        styles.languagePillText,
                        {
                          color:
                            selectedLanguage === lang.code ? colors.background : colors.primaryText,
                        },
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {isLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.accentPrimary}
                style={styles.loader}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                {t('common.loading')}
              </Text>
            </View>
          ) : null
        }
      />
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
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    minWidth: 32,
  },
  headerTitle: {
    ...typography.cardTitle,
  },
  headerSpacer: {
    width: 32,
  },
  listContent: {
    paddingBottom: layout.tabBarBaseHeight + spacing.xl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
  },
  groupLabel: {
    ...typography.eyebrow,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: layout.cardPadding,
    borderBottomWidth: 1,
  },
  preferenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  preferenceLabel: {
    ...typography.bodyStrong,
  },
  preferenceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '50%',
  },
  preferenceValue: {
    ...typography.label,
    textAlign: 'right',
    flexShrink: 1,
  },
  sectionHeader: {
    ...typography.eyebrow,
    paddingVertical: spacing.sm,
    paddingTop: spacing.lg,
  },
  translationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: layout.cardPadding,
    borderBottomWidth: 1,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  translationMain: {
    flex: 1,
    gap: spacing.xs,
  },
  translationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  translationName: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipText: {
    ...typography.micro,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    ...typography.micro,
  },
  audioIcon: {
    marginLeft: spacing.xs,
  },
  checkPlaceholder: {
    width: 22,
  },
  loader: {
    marginTop: spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
  },
  languageFilterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
  },
  languagePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  languagePillText: {
    ...typography.label,
    fontWeight: '600',
  },
});
