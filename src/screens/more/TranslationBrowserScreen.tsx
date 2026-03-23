import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
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

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'TranslationBrowser'>;

type PreferenceField = 'primary' | 'secondary' | 'audio';

interface TranslationSection {
  title: string;
  data: TranslationCatalogEntry[];
}

function groupByLanguage(translations: TranslationCatalogEntry[]): TranslationSection[] {
  const map = new Map<string, TranslationCatalogEntry[]>();

  for (const entry of translations) {
    const lang = entry.language_name;
    if (!map.has(lang)) {
      map.set(lang, []);
    }
    map.get(lang)!.push(entry);
  }

  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
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

  const [translations, setTranslations] = useState<TranslationCatalogEntry[]>([]);
  const [preferences, setPreferences] = useState<UserTranslationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingField, setSavingField] = useState<PreferenceField | null>(null);

  const sections = groupByLanguage(translations);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catalogResult, prefsResult] = await Promise.all([
        listAvailableTranslations(),
        getUserTranslationPreferences(),
      ]);

      if (catalogResult.success && catalogResult.data) {
        setTranslations(catalogResult.data);
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

  const handleSetPrimary = async (translation: TranslationCatalogEntry) => {
    setSavingField('primary');
    try {
      const result = await setUserTranslationPreferences({ primary: translation.translation_id });
      if (result.success) {
        setPreferences((prev) => ({
          ...(prev ?? { id: '', user_id: '', secondary_translation: null, audio_translation: null, synced_at: '' }),
          primary_translation: translation.translation_id,
        }));
      } else {
        Alert.alert(t('common.error'), result.error ?? t('common.error'));
      }
    } finally {
      setSavingField(null);
    }
  };

  const showPreferencePicker = (field: PreferenceField) => {
    if (translations.length === 0) return;

    const options = translations.map((tr) => ({
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

          const result = await setUserTranslationPreferences(payload);
          if (result.success) {
            setPreferences((prev) => ({
              ...(prev ?? { id: '', user_id: '', primary_translation: 'BSB', secondary_translation: null, audio_translation: null, synced_at: '' }),
              ...(field === 'primary' ? { primary_translation: tr.translation_id } : {}),
              ...(field === 'secondary' ? { secondary_translation: tr.translation_id } : {}),
              ...(field === 'audio' ? { audio_translation: tr.translation_id } : {}),
            }));
          } else {
            Alert.alert(t('common.error'), result.error ?? t('common.error'));
          }
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
    const match = translations.find((tr) => tr.translation_id === id);
    if (!match) return id;
    return `${match.abbreviation} – ${match.name}`;
  };

  const primaryId = preferences?.primary_translation ?? 'BSB';
  const secondaryId = preferences?.secondary_translation ?? null;
  const audioId = preferences?.audio_translation ?? null;

  const renderSectionHeader = ({ section }: { section: TranslationSection }) => (
    <Text style={[styles.sectionHeader, { color: colors.secondaryText, backgroundColor: colors.background }]}>
      {section.title}
    </Text>
  );

  const renderTranslation = ({ item, index, section }: { item: TranslationCatalogEntry; index: number; section: TranslationSection }) => {
    const isPrimary = item.translation_id === primaryId;
    const isLast = index === section.data.length - 1;
    const licenseLabel = getLicenseLabel(item.license_type, t);
    const isPublicDomain =
      item.license_type?.toLowerCase().includes('public') ||
      item.license_type?.toLowerCase().includes('pd');

    return (
      <TouchableOpacity
        style={[
          styles.translationRow,
          { borderBottomColor: colors.cardBorder },
          isLast && styles.lastRow,
          isPrimary && { backgroundColor: colors.cardBorder + '40' },
        ]}
        onPress={() => handleSetPrimary(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.abbreviation}`}
        accessibilityState={{ selected: isPrimary }}
      >
        <View style={styles.translationMain}>
          <View style={styles.translationTitleRow}>
            <Text style={[styles.translationName, { color: colors.primaryText }]}>{item.name}</Text>
            <View style={[styles.chip, { backgroundColor: colors.cardBorder }]}>
              <Text style={[styles.chipText, { color: colors.secondaryText }]}>{item.abbreviation}</Text>
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
          </View>
        </View>

        {isPrimary ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accentPrimary} />
        ) : (
          <View style={styles.checkPlaceholder} />
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

            {/* Available Translations header */}
            <Text style={[styles.groupLabel, { color: colors.secondaryText, marginTop: spacing.xl }]}>
              {t('translations.available')}
            </Text>

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
});
