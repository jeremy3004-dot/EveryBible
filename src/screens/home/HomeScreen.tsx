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
import { LinearGradient } from 'expo-linear-gradient';
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
import { resolveHomeMomentumMetric, resolveHomePrimaryAction } from './homeExperienceModel';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) =>
    Array.isArray(state.translations) ? state.translations : bibleTranslations
  );
  const currentBookInfo = getBookById(currentBook);
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const remoteAudioAvailable =
    config.features.audioEnabled && isRemoteAudioAvailable(currentTranslation);
  const getTodayCount = useProgressStore((state) => state.getTodayCount);
  const getWeekCount = useProgressStore((state) => state.getWeekCount);
  const getMonthCount = useProgressStore((state) => state.getMonthCount);
  const getYearCount = useProgressStore((state) => state.getYearCount);
  const streakDays = useProgressStore((state) => state.streakDays);

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

  const chaptersToday = getTodayCount();
  const chaptersThisWeek = getWeekCount();
  const chaptersThisMonth = getMonthCount();
  const chaptersThisYear = getYearCount();

  const handleContinueReading = () => {
    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: { bookId: currentBook, chapter: currentChapter },
    });
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

  const handlePrimaryAction = () => {
    if (primaryAction === 'play-daily-audio') {
      handlePlayDailyAudio();
      return;
    }

    handleContinueReading();
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
    dailyScripture != null
      ? Boolean(dailyAudioAvailability?.canPlayAudio) && dailyScripture.kind !== 'verse-text'
      : false;
  const dailyAudioKind =
    shouldShowDailyAudio && dailyScripture?.kind === 'empty'
      ? currentTranslationInfo?.audioGranularity === 'verse'
        ? 'verse-audio'
        : 'section-audio'
      : dailyScripture?.kind;
  const primaryAction = resolveHomePrimaryAction({
    chaptersToday,
    hasNextLesson: false,
    canPlayDailyAudio: shouldShowDailyAudio,
  });
  const momentumMetric = resolveHomeMomentumMetric({
    streakDays,
    weekCount: chaptersThisWeek,
    completedLessons: 0,
  });
  const heroMetricLabel =
    momentumMetric === 'streak' ? t('profile.streak') : t('home.week');
  const heroMetricValue = momentumMetric === 'streak' ? streakDays : chaptersThisWeek;
  const heroActionLabel =
    primaryAction === 'play-daily-audio'
      ? dailyAudioKind === 'section-audio'
        ? t('home.playSectionOfTheDay')
        : t('home.playVerseOfTheDay')
      : t('home.continueReading');
  const heroActionTitle =
    primaryAction === 'play-daily-audio'
      ? (dailyReferenceLabel ?? t('home.defaultReference'))
      : `${currentBookInfo?.name || 'Genesis'} ${currentChapter}`;
  const heroActionBody =
    primaryAction === 'play-daily-audio'
      ? dailyAudioKind === 'section-audio'
        ? t('home.sectionOfTheDayBody')
        : t('home.verseAudioBody')
      : t('home.welcome');
  const heroGradientColors = isDark
    ? (['#25181b', '#181b21', '#111316'] as const)
    : (['#fff6ea', '#f6ede1', '#efe2d2'] as const);

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

        <LinearGradient
          colors={heroGradientColors}
          style={[styles.heroCard, { borderColor: colors.cardBorder }]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: colors.accentSecondary }]}>
                {heroActionLabel}
              </Text>
              <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                {heroActionTitle}
              </Text>
              <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
                {heroActionBody}
              </Text>
            </View>
            <View
              style={[
                styles.metricBadge,
                { borderColor: colors.cardBorder, backgroundColor: colors.overlay },
              ]}
            >
              <Text style={[styles.metricBadgeValue, { color: colors.primaryText }]}>
                {heroMetricValue}
              </Text>
              <Text style={[styles.metricBadgeLabel, { color: colors.secondaryText }]}>
                {heroMetricLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.heroButton, { backgroundColor: colors.accentPrimary }]}
            onPress={handlePrimaryAction}
            activeOpacity={0.9}
          >
            <Text style={styles.heroButtonText}>{heroActionLabel}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.momentumRow}>
            <View
              style={[
                styles.momentumPill,
                { backgroundColor: colors.overlay, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.momentumValue, { color: colors.primaryText }]}>
                {chaptersToday}
              </Text>
              <Text style={[styles.momentumLabel, { color: colors.secondaryText }]}>
                {t('home.today')}
              </Text>
            </View>
            <View
              style={[
                styles.momentumPill,
                { backgroundColor: colors.overlay, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.momentumValue, { color: colors.primaryText }]}>
                {chaptersThisWeek}
              </Text>
              <Text style={[styles.momentumLabel, { color: colors.secondaryText }]}>
                {t('home.week')}
              </Text>
            </View>
            <View
              style={[
                styles.momentumPill,
                { backgroundColor: colors.overlay, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.momentumValue, { color: colors.primaryText }]}>
                {journeyProgress}%
              </Text>
              <Text style={[styles.momentumLabel, { color: colors.secondaryText }]}>
                {t('harvest.fourFieldsJourney')}
              </Text>
            </View>
          </View>
        </LinearGradient>

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

        <TouchableOpacity
          style={[
            styles.card,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
          onPress={handleContinueReading}
          activeOpacity={0.85}
        >
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.accentPrimary + '14' }]}>
              <Ionicons name="book-outline" size={18} color={colors.accentPrimary} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={[styles.cardTitle, { color: colors.secondaryText }]}>
                {t('home.continueReading')}
              </Text>
              <Text style={[styles.cardSubtext, { color: colors.primaryText }]}>
                {currentBookInfo?.name || 'Genesis'} {currentChapter}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardMeta, { color: colors.secondaryText }]}>
            {t('home.chaptersRead')}: {chaptersThisMonth} {t('home.month')} / {chaptersThisYear}{' '}
            {t('home.year')}
          </Text>
        </TouchableOpacity>
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
    padding: 20,
    gap: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  metricBadge: {
    minWidth: 90,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  metricBadgeValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  metricBadgeLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  heroButton: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  momentumRow: {
    flexDirection: 'row',
    gap: 10,
  },
  momentumPill: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  momentumValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  momentumLabel: {
    fontSize: 12,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    gap: 14,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verseText: {
    fontSize: 18,
    lineHeight: 28,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  reference: {
    fontSize: 14,
    fontWeight: '600',
  },
  audioFallbackBody: {
    fontSize: 17,
    lineHeight: 26,
  },
  audioAction: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubtext: {
    fontSize: 20,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCopy: {
    flex: 1,
  },
  cardSkeleton: {
    marginBottom: 0,
  },
});
