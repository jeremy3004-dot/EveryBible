import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bibleTranslations, getBookById } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { useProgressStore, useBibleStore } from '../../stores';
import { getDailyScripture } from '../../services/bible';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { CardSkeleton } from '../../components';
import type { DailyScripture } from '../../types';
import type { RootTabParamList } from '../../navigation/types';
import { layout, radius, spacing, typography } from '../../design/system';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) =>
    Array.isArray(state.translations) ? state.translations : bibleTranslations
  );
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const remoteAudioAvailable =
    config.features.audioEnabled && isRemoteAudioAvailable(currentTranslation);
  const getTodayCount = useProgressStore((state) => state.getTodayCount);
  const getWeekCount = useProgressStore((state) => state.getWeekCount);
  const getMonthCount = useProgressStore((state) => state.getMonthCount);
  const getYearCount = useProgressStore((state) => state.getYearCount);

  useEffect(() => {
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      void loadVerseOfDay({ allowInitialization: false });
    });

    retryTimerRef.current = setTimeout(() => {
      void loadVerseOfDay({ allowInitialization: false, silent: true });
    }, 2500);

    return () => {
      interactionHandle.cancel();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTranslation, remoteAudioAvailable]);

  const loadVerseOfDay = async ({
    allowInitialization = true,
    silent = false,
  }: {
    allowInitialization?: boolean;
    silent?: boolean;
  } = {}) => {
    if (!silent) {
      setIsLoadingVerse(true);
    }

    try {
      if (!currentTranslationInfo) {
        setDailyScripture(null);
        return;
      }

      const scripture = await getDailyScripture(currentTranslationInfo, remoteAudioAvailable, {
        allowInitialization,
      });
      setDailyScripture(scripture);
    } catch (error) {
      console.error('Error loading verse of the day:', error);
    } finally {
      if (!silent) {
        setIsLoadingVerse(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVerseOfDay({ allowInitialization: true });
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 17) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

  const handlePlayDailyAudio = () => {
    if (!dailyScripture || !dailyAudioAvailability?.canPlayAudio) {
      return;
    }

    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: dailyScripture.bookId,
        chapter: dailyScripture.chapter,
        autoplayAudio: true,
        focusVerse: dailyScripture.verse,
      },
    });
  };

  const dailyReferenceLabel = dailyScripture
    ? `${getBookById(dailyScripture.bookId)?.name || dailyScripture.bookId} ${dailyScripture.chapter}${
        dailyScripture.verse ? `:${dailyScripture.verse}` : ''
      }`
    : null;
  const dailyAudioAvailability =
    dailyScripture && currentTranslationInfo
      ? getAudioAvailability({
          featureEnabled: config.features.audioEnabled,
          translationHasAudio: currentTranslationInfo.hasAudio,
          remoteAudioAvailable,
          downloadedAudioBooks: currentTranslationInfo.downloadedAudioBooks,
          bookId: dailyScripture.bookId,
        })
      : null;
  const shouldShowDailyAudio =
    dailyScripture != null &&
    dailyAudioAvailability?.canPlayAudio &&
    dailyScripture.kind !== 'verse-text';
  const dailyAudioKind =
    shouldShowDailyAudio && dailyScripture?.kind === 'empty'
      ? currentTranslationInfo?.audioGranularity === 'verse'
        ? 'verse-audio'
        : 'section-audio'
      : dailyScripture?.kind;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentGreen}
          />
        }
      >
        <Text style={[styles.greeting, { color: colors.primaryText }]}>{getGreeting()}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>{t('home.welcome')}</Text>

        {/* Verse of the Day Card */}
        {isLoadingVerse ? (
          <View style={styles.cardSkeleton}>
            <CardSkeleton lines={3} />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.secondaryText }]}>
              {dailyAudioKind === 'section-audio'
                ? t('home.sectionOfTheDay')
                : t('home.verseOfTheDay')}
            </Text>
            {dailyScripture?.kind === 'verse-text' ? (
              <>
                <Text style={[styles.verseText, { color: colors.primaryText }]}>
                  {`"${dailyScripture.text}"`}
                </Text>
                <Text style={[styles.reference, { color: colors.accentGreen }]}>
                  {dailyReferenceLabel}
                </Text>
              </>
            ) : shouldShowDailyAudio ? (
              <>
                <Text style={[styles.audioFallbackBody, { color: colors.primaryText }]}>
                  {dailyAudioKind === 'section-audio'
                    ? t('home.sectionOfTheDayBody')
                    : t('home.verseAudioBody')}
                </Text>
                <Text style={[styles.reference, { color: colors.accentGreen }]}>
                  {dailyReferenceLabel}
                </Text>
                <TouchableOpacity
                  style={[styles.audioAction, { backgroundColor: colors.bibleControlBackground }]}
                  onPress={handlePlayDailyAudio}
                  activeOpacity={0.9}
                >
                  <Ionicons name="play" size={18} color={colors.bibleBackground} />
                  <Text style={[styles.audioActionText, { color: colors.bibleBackground }]}>
                    {dailyAudioKind === 'section-audio'
                      ? t('home.playSectionOfTheDay')
                      : t('home.playVerseOfTheDay')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.verseText, { color: colors.primaryText }]}>
                  {t('home.defaultVerse')}
                </Text>
                <Text style={[styles.reference, { color: colors.accentGreen }]}>
                  {t('home.defaultReference')}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Stats Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.secondaryText }]}>
            {t('home.chaptersRead')}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primaryText }]}>
                {getTodayCount()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>
                {t('home.today')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primaryText }]}>
                {getWeekCount()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>
                {t('home.week')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primaryText }]}>
                {getMonthCount()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>
                {t('home.month')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primaryText }]}>
                {getYearCount()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>
                {t('home.year')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    padding: layout.screenPadding,
  },
  greeting: {
    ...typography.screenTitle,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    marginBottom: layout.sectionGap,
  },
  card: {
    borderRadius: radius.lg,
    padding: layout.cardPadding,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  cardTitle: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
  },
  verseText: {
    ...typography.readingDisplay,
    marginBottom: spacing.md,
  },
  reference: {
    ...typography.label,
  },
  audioFallbackBody: {
    ...typography.bodyStrong,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  audioAction: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  audioActionText: {
    ...typography.button,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.micro,
  },
  cardSkeleton: {
    marginBottom: spacing.lg,
  },
});
