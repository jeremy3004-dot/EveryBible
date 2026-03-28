import { useState, useEffect, useRef, type ComponentProps } from 'react';
import {
  View,
  Text,
  Image,
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
import { bibleTranslations, getTranslatedBookName } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { useProgressStore, useBibleStore } from '../../stores';
import { useGatherStore } from '../../stores/gatherStore';
import { gatherFoundations } from '../../data/gatherFoundations';
import { gatherIconImages } from '../../data/gatherIcons';
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

  const completedLessons = useGatherStore((state) => state.completedLessons);

  // Find the active foundation: first one that has started but isn't fully complete.
  // Falls back to foundation-1 if none started yet.
  const activeFoundation = (() => {
    const inProgress = gatherFoundations.find((f) => {
      const done = completedLessons[f.id]?.length ?? 0;
      return done > 0 && done < f.lessons.length;
    });
    if (inProgress) return inProgress;
    // All complete? Show the last one. Nothing started? Show the first.
    const allDone = gatherFoundations.every(
      (f) => (completedLessons[f.id]?.length ?? 0) >= f.lessons.length
    );
    return allDone ? gatherFoundations[gatherFoundations.length - 1] : gatherFoundations[0];
  })();
  const activeFoundationDone = completedLessons[activeFoundation.id]?.length ?? 0;
  const activeFoundationTotal = activeFoundation.lessons.length;

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
    ? `${getTranslatedBookName(dailyScripture.bookId, t)} ${dailyScripture.chapter}${
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

        {/* Continue in Foundations card */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.card, styles.foundationCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
          onPress={() =>
            navigation.navigate('Learn', {
              screen: 'FoundationDetail',
              params: { foundationId: activeFoundation.id },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
          }
        >
          <Text style={[styles.cardTitle, { color: colors.secondaryText, paddingHorizontal: layout.cardPadding, paddingTop: layout.cardPadding }]}>
            {activeFoundationDone > 0 ? 'CONTINUE IN FOUNDATIONS' : 'GET STARTED'}
          </Text>
          <View style={styles.foundationCardBody}>
            <View style={[styles.foundationIconWrap, { backgroundColor: colors.accentPrimary + '18' }]}>
              {activeFoundation.iconImage && gatherIconImages[activeFoundation.iconImage] ? (
                <Image
                  source={gatherIconImages[activeFoundation.iconImage]}
                  style={styles.foundationIconImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons
                  name={(activeFoundation.iconName as ComponentProps<typeof Ionicons>['name']) ?? 'book-outline'}
                  size={36}
                  color={colors.accentPrimary}
                />
              )}
            </View>
            <View style={styles.foundationCardInfo}>
              <Text style={[styles.foundationCardTitle, { color: colors.primaryText }]} numberOfLines={2}>
                {`Foundations ${activeFoundation.number}: ${activeFoundation.title}`}
              </Text>
              <Text style={[styles.foundationCardSubtitle, { color: colors.secondaryText }]}>
                {activeFoundation.description}
              </Text>
              <Text style={[styles.foundationCardProgress, { color: colors.accentPrimary }]}>
                {`${activeFoundationDone} / ${activeFoundationTotal} lessons`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

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
  // Foundations continuation card
  foundationCard: {
    padding: 0,
    overflow: 'hidden',
  },
  foundationCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: layout.cardPadding,
    paddingTop: 0,
  },
  foundationIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  foundationIconImage: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
  },
  foundationCardInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  foundationCardTitle: {
    ...typography.bodyStrong,
  },
  foundationCardSubtitle: {
    ...typography.micro,
  },
  foundationCardProgress: {
    ...typography.label,
    marginTop: spacing.xs,
  },
});
