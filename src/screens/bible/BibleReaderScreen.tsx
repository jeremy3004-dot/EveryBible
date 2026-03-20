import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import { getChapter } from '../../services/bible';
import { getChapterPresentationMode } from '../../services/bible/presentation';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { useBibleStore, useLibraryStore, useProgressStore } from '../../stores';
import { useFontSize, useAudioPlayer } from '../../hooks';
import {
  VersesSkeleton,
  AudioFirstChapterCard,
  AudioPlayerBar,
  PlaybackControls,
} from '../../components';
import type { BibleTranslation, Verse } from '../../types';
import type { BibleStackParamList, BibleReaderScreenProps } from '../../navigation/types';
import {
  getEstimatedFollowAlongVerse,
  getInitialChapterSessionMode,
  getNextChapterSessionMode,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
  shouldAutoplayChapterAudio,
  shouldSyncReaderToActiveAudioChapter,
} from './bibleReaderModel';
import { getTranslationSelectionState } from './bibleTranslationModel';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

export function BibleReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleReaderScreenProps['route']>();
  const { bookId, chapter, autoplayAudio, preferredMode, focusVerse } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const autoplayKeyRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const previousActiveAudioBookIdRef = useRef<string | null>(null);
  const previousActiveAudioChapterRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const followAlongScrollViewRef = useRef<ScrollView | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const followAlongOffsetsRef = useRef<Record<number, number>>({});

  const [verses, setVerses] = useState<Verse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFontSizeSheet, setShowFontSizeSheet] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [showFollowAlongText, setShowFollowAlongText] = useState(false);
  const [showChapterActionsSheet, setShowChapterActionsSheet] = useState(false);
  const [showAudioOptionsSheet, setShowAudioOptionsSheet] = useState(false);
  const [chapterSessionMode, setChapterSessionMode] = useState<'listen' | 'read'>('read');

  const markChapterRead = useProgressStore((state) => state.markChapterRead);
  const setCurrentBook = useBibleStore((state) => state.setCurrentBook);
  const setCurrentChapter = useBibleStore((state) => state.setCurrentChapter);
  const setPreferredChapterLaunchMode = useBibleStore(
    (state) => state.setPreferredChapterLaunchMode
  );
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const addChapterToDefaultPlaylist = useLibraryStore((state) => state.addChapterToDefaultPlaylist);
  const isFavorite = useLibraryStore((state) => state.isFavorite(bookId, chapter));
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const getTranslationAudioAvailability = (
    translation: Pick<BibleTranslation, 'id' | 'hasAudio' | 'downloadedAudioBooks'>,
    targetBookId?: string
  ) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: Boolean(translation.hasAudio),
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
      bookId: targetBookId,
    });
  const { fontSize, scaleValue, setSize } = useFontSize();
  const {
    status,
    showPlayer,
    togglePlayer,
    currentBookId: activeAudioBookId,
    currentChapter: activeAudioChapter,
    currentPosition,
    duration,
    playbackRate,
    sleepTimerRemaining,
    playChapter,
    addToQueue,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    startSleepTimer,
    setShowPlayer,
  } = useAudioPlayer(currentTranslation);

  const book = getBookById(bookId);
  const audioEnabled = getAudioAvailability({
    featureEnabled: config.features.audioEnabled,
    translationHasAudio: Boolean(currentTranslationInfo?.hasAudio),
    remoteAudioAvailable: isRemoteAudioAvailable(currentTranslation),
    downloadedAudioBooks: currentTranslationInfo?.downloadedAudioBooks ?? [],
    bookId,
  }).canPlayAudio;
  const translationLabel = currentTranslationInfo?.abbreviation || 'BSB';
  const chapterPresentationMode = getChapterPresentationMode({
    verses,
    translation: currentTranslationInfo,
    audioAvailable: audioEnabled,
  });
  const canAdjustFontSize = chapterPresentationMode === 'text' && verses.length > 0;
  const canShowTranslationSheet = config.features.multipleTranslations;
  const canToggleSessionMode =
    audioEnabled && chapterPresentationMode === 'text' && verses.length > 0;
  const activeFollowAlongVerse = getEstimatedFollowAlongVerse({
    verses,
    currentPosition,
    duration,
    fallbackVerse: focusVerse,
  });
  const isCurrentAudioChapter = activeAudioBookId === bookId && activeAudioChapter === chapter;

  useEffect(() => {
    setCurrentBook(bookId);
    setCurrentChapter(chapter);
  }, [bookId, chapter, setCurrentBook, setCurrentChapter]);

  useEffect(() => {
    void loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter, currentTranslation]);

  useEffect(() => {
    verseOffsetsRef.current = {};
    followAlongOffsetsRef.current = {};
  }, [bookId, chapter]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const sessionKey = `${bookId}:${chapter}:${currentTranslation}`;
    if (sessionKeyRef.current === sessionKey) {
      return;
    }

    sessionKeyRef.current = sessionKey;
    setShowFollowAlongText(false);
    setChapterSessionMode(
      getInitialChapterSessionMode({
        audioEnabled,
        hasText: verses.length > 0,
        autoplayAudio: Boolean(autoplayAudio),
        preferredMode: preferredMode ?? null,
        bookId,
        chapter,
        activeAudioBookId,
        activeAudioChapter,
      })
    );
  }, [
    activeAudioBookId,
    activeAudioChapter,
    audioEnabled,
    autoplayAudio,
    bookId,
    chapter,
    currentTranslation,
    isLoading,
    preferredMode,
    verses.length,
  ]);

  useEffect(() => {
    if (isLoading || focusVerse == null) {
      return;
    }

    const verseOffset = verseOffsetsRef.current[focusVerse];
    if (verseOffset == null) {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(verseOffset - 24, 0),
      animated: false,
    });
  }, [focusVerse, isLoading, verses]);

  useEffect(() => {
    if (!showFollowAlongText || activeFollowAlongVerse == null) {
      return;
    }

    const verseOffset = followAlongOffsetsRef.current[activeFollowAlongVerse];
    if (verseOffset == null) {
      return;
    }

    followAlongScrollViewRef.current?.scrollTo({
      y: Math.max(verseOffset - 140, 0),
      animated: true,
    });
  }, [activeFollowAlongVerse, showFollowAlongText]);

  useEffect(() => {
    if (
      !shouldAutoplayChapterAudio({
        autoplayAudio: Boolean(autoplayAudio),
        audioEnabled,
        isLoading,
        bookId,
        chapter,
        activeAudioBookId,
        activeAudioChapter,
      })
    ) {
      return;
    }

    const autoplayKey = `${bookId}:${chapter}:${focusVerse ?? 'chapter'}:${chapterPresentationMode}`;
    if (autoplayKeyRef.current === autoplayKey) {
      return;
    }

    autoplayKeyRef.current = autoplayKey;

    if (chapterPresentationMode === 'text') {
      setShowPlayer(true);
    }

    void playChapter(
      bookId,
      chapter,
      currentTranslationInfo?.audioGranularity === 'verse' ? focusVerse : undefined
    );
  }, [
    activeAudioBookId,
    activeAudioChapter,
    autoplayAudio,
    audioEnabled,
    bookId,
    chapter,
    chapterPresentationMode,
    currentTranslationInfo,
    focusVerse,
    isLoading,
    playChapter,
    setShowPlayer,
  ]);

  useEffect(() => {
    const shouldSync = shouldSyncReaderToActiveAudioChapter({
      audioEnabled,
      bookId,
      chapter,
      activeAudioBookId,
      activeAudioChapter,
      previousActiveAudioBookId: previousActiveAudioBookIdRef.current,
      previousActiveAudioChapter: previousActiveAudioChapterRef.current,
    });

    previousActiveAudioBookIdRef.current = activeAudioBookId;
    previousActiveAudioChapterRef.current = activeAudioChapter;

    if (!shouldSync || activeAudioChapter == null) {
      return;
    }

    navigation.setParams({ chapter: activeAudioChapter, focusVerse: undefined, autoplayAudio: false });
  }, [audioEnabled, activeAudioBookId, activeAudioChapter, bookId, chapter, navigation]);

  const loadChapter = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (currentTranslationInfo && !currentTranslationInfo.hasText) {
        setVerses([]);
        return;
      }

      const data = await getChapter(bookId, chapter);
      setVerses(data);
      markChapterRead(bookId, chapter);
    } catch (err) {
      setError(t('bible.failedToLoad'));
      console.error('Error loading chapter:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!book) {
    return null;
  }

  const hasPrevChapter = chapter > 1;
  const hasNextChapter = chapter < book.chapters;
  const showBottomAudioBar =
    audioEnabled && showPlayer && chapterPresentationMode === 'text' && chapterSessionMode === 'read';
  const shouldFillReaderCanvas =
    chapterPresentationMode === 'audio-first' || chapterSessionMode === 'listen';
  const syncReaderChapter = (nextChapter: number) => {
    navigation.setParams({ chapter: nextChapter, focusVerse: undefined, autoplayAudio: false });
  };
  const dismissFontSizeSheetFromReader = () => {
    setShowFontSizeSheet((current) =>
      getNextFontSizeSheetVisibility(current, 'readerContentTap')
    );
  };
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTranslationChipPress = () => {
    setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'readerContentTap'));
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'toggleChip')
    );
  };

  const handleCloseTranslationSheet = () => {
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
  };

  const handleSessionModePress = (requestedMode: 'listen' | 'read') => {
    const nextMode = getNextChapterSessionMode(chapterSessionMode, {
      requestedMode,
      audioEnabled,
      hasText: verses.length > 0,
    });

    setShowFontSizeSheet(false);
    setShowTranslationSheet(false);
    setChapterSessionMode(nextMode);
    setPreferredChapterLaunchMode(nextMode);
    if (nextMode === 'read') {
      setShowFollowAlongText(false);
    }
  };

  const handleTranslationSelect = (translation: BibleTranslation) => {
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'selectTranslation')
    );

    const audioAvailability = getTranslationAudioAvailability(translation, bookId);
    const selectionState = getTranslationSelectionState({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      hasAudio: translation.hasAudio,
      canPlayAudio: audioAvailability.canPlayAudio,
    });

    if (selectionState.isSelectable) {
      setCurrentTranslation(translation.id);
      return;
    }

    if (selectionState.reason === 'audio-unavailable') {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
      return;
    }

    Alert.alert(t('common.comingSoon'), t('bible.translationComingSoon', { name: translation.name }), [
      { text: t('common.ok') },
    ]);
  };

  const handleToggleFavorite = () => {
    toggleFavorite(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: isFavorite ? 'unfavorite' : 'favorite',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToPlaylist = () => {
    addChapterToDefaultPlaylist(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'playlist',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToQueue = () => {
    addToQueue(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'queue',
    });
    setShowChapterActionsSheet(false);
  };

  const handleOpenAudioOptions = () => {
    setShowChapterActionsSheet(false);
    setShowAudioOptionsSheet(true);
  };

  const handleShareChapter = async () => {
    setShowChapterActionsSheet(false);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'share',
    });
    await Share.share({
      message: `${book.name} ${chapter}`,
    });
  };

  const handleDownloadCurrentBookAudio = async () => {
    setShowChapterActionsSheet(false);

    if (!currentTranslationInfo?.hasAudio || !audioEnabled) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    try {
      await downloadAudioForBook(currentTranslation, bookId);
      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        detail: 'download',
      });
      Alert.alert(t('common.ok'), t('bible.audioSavedOffline'));
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    }
  };

  const handleOpenLibrary = () => {
    setShowChapterActionsSheet(false);

    if (!rootNavigationRef.isReady()) {
      return;
    }

    rootNavigationRef.navigate('More', {
      screen: 'Library',
    });
  };

  const handlePlayDisplayedChapter = () => {
    if (!isCurrentAudioChapter) {
      void playChapter(bookId, chapter);
      return;
    }

    void togglePlayPause();
  };

  const handleListenModeSeek = (locationX: number, width: number) => {
    if (duration <= 0 || width <= 0 || !isCurrentAudioChapter) {
      return;
    }

    const percentage = locationX / width;
    const nextPosition = Math.max(0, Math.min(duration, percentage * duration));
    void seekTo(nextPosition);
  };

  const handlePreviousListenChapter = async () => {
    if (isCurrentAudioChapter) {
      await previousChapter();
      return;
    }

    if (!hasPrevChapter) {
      return;
    }

    await playChapter(bookId, chapter - 1);
    syncReaderChapter(chapter - 1);
  };

  const handleNextListenChapter = async () => {
    if (isCurrentAudioChapter) {
      await nextChapter();
      return;
    }

    if (!hasNextChapter) {
      return;
    }

    await playChapter(bookId, chapter + 1);
    syncReaderChapter(chapter + 1);
  };

  const renderListenMode = () => {
    const listenStatus = isCurrentAudioChapter ? status : 'idle';
    const listenPosition = isCurrentAudioChapter ? currentPosition : 0;
    const listenDuration = isCurrentAudioChapter ? duration : 0;
    const progress = listenDuration > 0 ? (listenPosition / listenDuration) * 100 : 0;
    const highlightedVerse = activeFollowAlongVerse ?? focusVerse ?? verses[0]?.verse ?? null;

    return (
      <View style={styles.listenColumn}>
        <View
          style={[
            styles.listenHeroCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.listenEyebrow, { color: colors.bibleAccent }]}>
            {translationLabel}
          </Text>
          <Text style={[styles.listenChapterTitle, { color: colors.biblePrimaryText }]}>
            {book.name} {chapter}
          </Text>
          <Text style={[styles.listenChapterMeta, { color: colors.bibleSecondaryText }]}>
            {highlightedVerse != null
              ? `${t('bible.verse')} ${highlightedVerse}`
              : `${verses.length} ${t('bible.chapter')}`}
          </Text>

          <TouchableOpacity
            style={[
              styles.listenPrimaryAction,
              { backgroundColor: colors.bibleControlBackground },
            ]}
            onPress={handlePlayDisplayedChapter}
          >
            <Ionicons
              name={listenStatus === 'playing' ? 'pause' : 'play'}
              size={18}
              color={colors.bibleBackground}
            />
            <Text style={[styles.listenPrimaryActionText, { color: colors.bibleBackground }]}>
              {listenStatus === 'playing' ? 'Pause chapter' : 'Play chapter'}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.listenPlayerCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.listenProgressTouch}
            activeOpacity={0.85}
            onPress={(event) => {
              const { locationX } = event.nativeEvent;
              event.currentTarget.measure((_x, _y, measuredWidth) => {
                handleListenModeSeek(locationX, measuredWidth);
              });
            }}
          >
            <View style={[styles.listenProgressTrack, { backgroundColor: colors.bibleDivider }]}>
              <View
                style={[
                  styles.listenProgressFill,
                  { width: `${progress}%`, backgroundColor: colors.bibleAccent },
                ]}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.listenTimeRow}>
            <Text style={[styles.listenTimeText, { color: colors.bibleSecondaryText }]}>
              {formatTime(listenPosition)}
            </Text>
            <Text style={[styles.listenTimeText, { color: colors.bibleSecondaryText }]}>
              {formatTime(listenDuration)}
            </Text>
          </View>

          <PlaybackControls
            status={listenStatus}
            playbackRate={playbackRate}
            sleepTimerRemaining={sleepTimerRemaining}
            hasPreviousChapter={hasPrevChapter}
            hasNextChapter={hasNextChapter}
            onPlayPause={handlePlayDisplayedChapter}
            onPreviousChapter={() => void handlePreviousListenChapter()}
            onNextChapter={() => void handleNextListenChapter()}
            onSkipBackward={() => void skipBackward()}
            onSkipForward={() => void skipForward()}
            onChangePlaybackRate={changePlaybackRate}
            onSetSleepTimer={startSleepTimer}
          />

          <View style={styles.listenActionsRow}>
            <TouchableOpacity
              style={[
                styles.listenSecondaryAction,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
              onPress={() => setShowFollowAlongText(true)}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.biblePrimaryText} />
              <Text style={[styles.listenSecondaryActionText, { color: colors.biblePrimaryText }]}>
                Show text
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <VersesSkeleton count={10} />;
    }

    if (error) {
      return (
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.feedbackTitle, { color: colors.biblePrimaryText }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.feedbackButton, { backgroundColor: colors.bibleControlBackground }]}
            onPress={loadChapter}
          >
            <Text style={[styles.feedbackButtonText, { color: colors.bibleBackground }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (verses.length === 0 && chapterPresentationMode === 'audio-first') {
      return (
        <View style={styles.audioFirstShell}>
          <AudioFirstChapterCard
            bookId={bookId}
            chapter={chapter}
            translationLabel={translationLabel}
            onChapterChange={(newChapter) => {
              syncReaderChapter(newChapter);
            }}
          />
        </View>
      );
    }

    if (verses.length === 0) {
      return (
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.feedbackTitle, { color: colors.biblePrimaryText }]}>
            {t('bible.noVersesAvailable', { book: book.name, chapter })}
          </Text>
          <Text style={[styles.feedbackBody, { color: colors.bibleSecondaryText }]}>
            {t('bible.fullBibleComingSoon')}
          </Text>
        </View>
      );
    }

    if (chapterSessionMode === 'listen') {
      return renderListenMode();
    }

    return (
      <View style={styles.readerColumn}>
        {verses.map((verse) => (
          <View
            key={verse.id}
            style={[
              styles.readerBlock,
              verse.verse === focusVerse
                ? {
                    backgroundColor: colors.bibleSurface,
                    borderColor: colors.bibleAccent,
                  }
                : null,
            ]}
            onLayout={(event) => {
              verseOffsetsRef.current[verse.verse] = event.nativeEvent.layout.y;
            }}
          >
            {verse.heading ? (
              <Text
                style={[
                  styles.sectionHeading,
                  {
                    fontSize: scaleValue(15),
                    color: colors.bibleSecondaryText,
                  },
                ]}
              >
                {verse.heading}
              </Text>
            ) : null}
            <Text
              style={[
                styles.verseText,
                {
                  fontSize: scaleValue(20),
                  lineHeight: scaleValue(30),
                  color: colors.biblePrimaryText,
                },
              ]}
            >
              <Text
                style={[
                  styles.inlineVerseNumber,
                  {
                    fontSize: scaleValue(12),
                    color: colors.bibleAccent,
                  },
                ]}
              >
                {verse.verse}{' '}
              </Text>
              {verse.text}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.bibleDivider }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.biblePrimaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {canToggleSessionMode ? (
            <View
              style={[
                styles.sessionModeRail,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
            >
              {(['listen', 'read'] as const).map((mode) => {
                const isSelected = chapterSessionMode === mode;

                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.sessionModeButton,
                      isSelected
                        ? {
                            backgroundColor: colors.bibleControlBackground,
                          }
                        : null,
                    ]}
                    onPress={() => handleSessionModePress(mode)}
                  >
                    <Text
                      style={[
                        styles.sessionModeLabel,
                        {
                          color: isSelected ? colors.bibleBackground : colors.bibleSecondaryText,
                        },
                      ]}
                    >
                      {mode === 'listen' ? 'Listen' : 'Read'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
            {book.name} {chapter}
          </Text>
          <TouchableOpacity
            style={[
              styles.translationChip,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: showTranslationSheet ? colors.bibleAccent : colors.bibleDivider,
              },
            ]}
            onPress={handleTranslationChipPress}
            activeOpacity={canShowTranslationSheet ? 0.85 : 1}
            disabled={!canShowTranslationSheet}
          >
            <Text style={[styles.translationChipText, { color: colors.bibleSecondaryText }]}>
              {translationLabel}
            </Text>
            {canShowTranslationSheet ? (
              <Ionicons
                name="chevron-down"
                size={12}
                color={showTranslationSheet ? colors.bibleAccent : colors.bibleSecondaryText}
              />
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.iconButton,
              styles.secondaryIconButton,
              {
                borderColor: showFontSizeSheet ? colors.bibleAccent : colors.bibleDivider,
                opacity: canAdjustFontSize ? 1 : 0.45,
              },
            ]}
            onPress={() => {
              if (!canAdjustFontSize) {
                return;
              }

              setShowFontSizeSheet((current) =>
                getNextFontSizeSheetVisibility(current, 'toggleButton')
              );
              setChapterSessionMode('read');
            }}
            disabled={!canAdjustFontSize}
          >
            <Text
              style={[
                styles.fontButtonLabel,
                {
                  color: showFontSizeSheet ? colors.bibleAccent : colors.biblePrimaryText,
                },
              ]}
            >
              AA
            </Text>
          </TouchableOpacity>

          {audioEnabled && chapterPresentationMode === 'text' ? (
            <TouchableOpacity
              style={[
                styles.iconButton,
                styles.secondaryIconButton,
                { borderColor: colors.bibleDivider },
              ]}
              onPress={() => {
                if (chapterSessionMode === 'listen') {
                  setShowFollowAlongText(true);
                  return;
                }

                togglePlayer();
              }}
            >
              <Ionicons
                name={chapterSessionMode === 'listen' ? 'document-text-outline' : showPlayer ? 'volume-high' : 'volume-medium-outline'}
                size={20}
                color={
                  chapterSessionMode === 'listen' || showPlayer
                    ? colors.bibleAccent
                    : colors.biblePrimaryText
                }
              />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.iconButton,
              styles.secondaryIconButton,
              {
                borderColor: showChapterActionsSheet ? colors.bibleAccent : colors.bibleDivider,
              },
            ]}
            onPress={() => {
              setShowFontSizeSheet(false);
              setShowTranslationSheet(false);
              setShowChapterActionsSheet(true);
            }}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={showChapterActionsSheet ? colors.bibleAccent : colors.biblePrimaryText}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          setShowFontSizeSheet((current) =>
            getNextFontSizeSheetVisibility(current, 'scrollStart')
          );
        }}
        contentContainerStyle={[
          styles.content,
          shouldFillReaderCanvas ? styles.immersiveContent : null,
          {
            paddingBottom: showBottomAudioBar ? 28 : 32,
          },
        ]}
      >
        <View
          style={[
            styles.readerShell,
            shouldFillReaderCanvas ? styles.immersiveReaderShell : null,
            { backgroundColor: colors.bibleBackground },
          ]}
          onTouchStart={showFontSizeSheet ? dismissFontSizeSheetFromReader : undefined}
        >
          {renderContent()}
        </View>
      </ScrollView>

      {showFontSizeSheet && canAdjustFontSize ? (
        <View
          style={[
            styles.fontSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <View
            style={[
              styles.fontSheetHandle,
              { backgroundColor: colors.bibleSecondaryText + '55' },
            ]}
          />
          <Text style={[styles.fontSheetTitle, { color: colors.biblePrimaryText }]}>
            {t('settings.fontSize')}
          </Text>
          <View style={styles.fontOptionRow}>
            {(
              [
                { key: 'small', label: t('settings.fontSizeSmall'), sampleSize: 16 },
                { key: 'medium', label: t('settings.fontSizeMedium'), sampleSize: 20 },
                { key: 'large', label: t('settings.fontSizeLarge'), sampleSize: 24 },
              ] as const
            ).map((option) => {
              const isSelected = fontSize === option.key;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.fontOptionButton,
                    {
                      backgroundColor: isSelected
                        ? colors.bibleControlBackground
                        : colors.bibleBackground,
                      borderColor: isSelected ? colors.bibleControlBackground : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => setSize(option.key)}
                >
                  <Text
                    style={[
                      styles.fontOptionSample,
                      {
                        color: isSelected ? colors.bibleBackground : colors.biblePrimaryText,
                        fontSize: option.sampleSize,
                      },
                    ]}
                  >
                    A
                  </Text>
                  <Text
                    style={[
                      styles.fontOptionLabel,
                      {
                        color: isSelected ? colors.bibleBackground : colors.bibleSecondaryText,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <Modal
        visible={showChapterActionsSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChapterActionsSheet(false)}
      >
        <TouchableOpacity
          style={[styles.modalBackdropFill, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowChapterActionsSheet(false)}
        >
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <Text style={[styles.actionSheetTitle, { color: colors.biblePrimaryText }]}>
              {book.name} {chapter}
            </Text>

            {[
              {
                key: 'favorite',
                icon: isFavorite ? 'heart' : 'heart-outline',
                label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
                onPress: handleToggleFavorite,
              },
              {
                key: 'playlist',
                icon: 'list-outline',
                label: 'Add to saved playlist',
                onPress: handleAddToPlaylist,
              },
              {
                key: 'queue',
                icon: 'play-forward-outline',
                label: 'Add to queue',
                onPress: handleAddToQueue,
              },
              {
                key: 'download',
                icon: 'download-outline',
                label: 'Download book audio',
                onPress: handleDownloadCurrentBookAudio,
              },
              {
                key: 'share',
                icon: 'share-social-outline',
                label: 'Share chapter reference',
                onPress: () => {
                  void handleShareChapter();
                },
              },
              {
                key: 'audio-options',
                icon: 'options-outline',
                label: 'Audio options',
                onPress: handleOpenAudioOptions,
              },
              {
                key: 'library',
                icon: 'library-outline',
                label: 'Open saved library',
                onPress: handleOpenLibrary,
              },
            ].map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.actionRow, { borderColor: colors.bibleDivider }]}
                onPress={action.onPress}
              >
                <Ionicons name={action.icon as never} size={20} color={colors.biblePrimaryText} />
                <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showAudioOptionsSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAudioOptionsSheet(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAudioOptionsSheet(false)}
          />
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
                Audio options
              </Text>
              <TouchableOpacity onPress={() => setShowAudioOptionsSheet(false)}>
                <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            <View style={styles.audioOptionsList}>
              {[
                {
                  key: 'translation',
                  label: 'Translation',
                  value: `${currentTranslationInfo?.name ?? 'Current translation'} (${translationLabel})`,
                },
                {
                  key: 'voice',
                  label: 'Voice',
                  value:
                    'This translation currently uses its bundled recording. Additional voice options are coming later.',
                },
                {
                  key: 'ambient',
                  label: 'Ambient',
                  value:
                    'Ambient layers are not available for this chapter yet. Playback will stay clean and direct until they are.',
                },
              ].map((option) => (
                <View
                  key={option.key}
                  style={[
                    styles.audioOptionCard,
                    {
                      backgroundColor: colors.bibleBackground,
                      borderColor: colors.bibleDivider,
                    },
                  ]}
                >
                  <Text style={[styles.audioOptionLabel, { color: colors.bibleAccent }]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.audioOptionValue, { color: colors.biblePrimaryText }]}>
                    {option.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {canShowTranslationSheet ? (
        <Modal
          visible={showTranslationSheet}
          transparent
          animationType="slide"
          onRequestClose={handleCloseTranslationSheet}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={handleCloseTranslationSheet}
            />
            <View
              style={[
                styles.modalContent,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
                  {t('bible.selectTranslation')}
                </Text>
                <TouchableOpacity onPress={handleCloseTranslationSheet}>
                  <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.translationList} showsVerticalScrollIndicator={false}>
                {translations.map((translation) => {
                  const isSelected = currentTranslation === translation.id;
                  const audioAvailability = getTranslationAudioAvailability(translation, bookId);
                  const selectionState = getTranslationSelectionState({
                    isDownloaded: translation.isDownloaded,
                    hasText: translation.hasText,
                    hasAudio: translation.hasAudio,
                    canPlayAudio: audioAvailability.canPlayAudio,
                  });

                  return (
                    <TouchableOpacity
                      key={translation.id}
                      style={[
                        styles.translationCard,
                        {
                          backgroundColor: isSelected
                            ? colors.bibleElevatedSurface
                            : colors.bibleBackground,
                          borderColor: colors.bibleDivider,
                        },
                      ]}
                      onPress={() => handleTranslationSelect(translation)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.translationItem}>
                        <View style={styles.translationInfo}>
                          <View style={styles.translationNameRow}>
                            <Text
                              style={[styles.translationName, { color: colors.biblePrimaryText }]}
                            >
                              {translation.name}
                            </Text>
                            <Text style={[styles.translationAbbr, { color: colors.bibleAccent }]}>
                              {translation.abbreviation}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.translationDescription,
                              { color: colors.bibleSecondaryText },
                            ]}
                          >
                            {translation.description}
                          </Text>
                          <View style={styles.translationMeta}>
                            <Text
                              style={[styles.translationSize, { color: colors.bibleSecondaryText }]}
                            >
                              {translation.sizeInMB} MB
                            </Text>
                            <View style={styles.downloadedBadge}>
                              <Ionicons
                                name={selectionState.isSelectable ? 'checkmark-circle' : 'time-outline'}
                                size={14}
                                color={
                                  selectionState.isSelectable
                                    ? translation.isDownloaded
                                      ? colors.success
                                      : colors.bibleAccent
                                    : colors.bibleSecondaryText
                                }
                              />
                              <Text
                                style={[
                                  styles.downloadedText,
                                  {
                                    color: selectionState.isSelectable
                                      ? translation.isDownloaded
                                        ? colors.success
                                        : colors.bibleAccent
                                      : colors.bibleSecondaryText,
                                  },
                                ]}
                              >
                                {selectionState.isSelectable
                                  ? t('bible.available')
                                  : t('common.comingSoon')}
                              </Text>
                            </View>
                          </View>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark" size={22} color={colors.bibleAccent} />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal
        visible={showFollowAlongText}
        animationType="slide"
        onRequestClose={() => setShowFollowAlongText(false)}
      >
        <SafeAreaView
          style={[styles.followAlongContainer, { backgroundColor: colors.bibleBackground }]}
          edges={['top']}
        >
          <View
            style={[
              styles.followAlongHeader,
              { borderBottomColor: colors.bibleDivider, backgroundColor: colors.bibleBackground },
            ]}
          >
            <View>
              <Text style={[styles.followAlongEyebrow, { color: colors.bibleAccent }]}>
                {translationLabel}
              </Text>
              <Text style={[styles.followAlongTitle, { color: colors.biblePrimaryText }]}>
                {book.name} {chapter}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.followAlongCloseButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => setShowFollowAlongText(false)}
            >
              <Ionicons name="chevron-down" size={20} color={colors.biblePrimaryText} />
              <Text
                style={[styles.followAlongCloseLabel, { color: colors.biblePrimaryText }]}
              >
                Back to player
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={followAlongScrollViewRef}
            style={styles.followAlongScrollView}
            contentContainerStyle={styles.followAlongContent}
            showsVerticalScrollIndicator={false}
          >
            {verses.map((verse) => {
              const isActive = verse.verse === activeFollowAlongVerse;

              return (
                <View
                  key={verse.id}
                  style={[
                    styles.followAlongVerseCard,
                    {
                      backgroundColor: isActive ? colors.bibleSurface : 'transparent',
                      borderColor: isActive ? colors.bibleAccent : 'transparent',
                    },
                  ]}
                  onLayout={(event) => {
                    followAlongOffsetsRef.current[verse.verse] = event.nativeEvent.layout.y;
                  }}
                >
                  {verse.heading ? (
                    <Text
                      style={[
                        styles.followAlongHeading,
                        { color: colors.bibleSecondaryText },
                      ]}
                    >
                      {verse.heading}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.followAlongVerseText,
                      {
                        color: isActive ? colors.biblePrimaryText : colors.bibleSecondaryText,
                      },
                    ]}
                  >
                    <Text style={[styles.followAlongVerseNumber, { color: colors.bibleAccent }]}>
                      {verse.verse}{' '}
                    </Text>
                    {verse.text}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {showBottomAudioBar ? (
        <View style={[styles.footerShell, { borderTopColor: colors.bibleDivider }]}>
          <AudioPlayerBar
            bookId={bookId}
            chapter={chapter}
            onChapterChange={(newChapter) => {
              syncReaderChapter(newChapter);
            }}
          />
        </View>
      ) : null}
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
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconButton: {
    borderWidth: 1,
    borderRadius: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  sessionModeRail: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  sessionModeButton: {
    minWidth: 88,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sessionModeLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
  },
  translationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  translationChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fontButtonLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  immersiveContent: {
    flexGrow: 1,
  },
  readerShell: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  immersiveReaderShell: {
    flex: 1,
  },
  audioFirstShell: {
    flex: 1,
  },
  readerColumn: {
    gap: 10,
  },
  listenColumn: {
    flex: 1,
    gap: 16,
    justifyContent: 'space-between',
  },
  listenHeroCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 10,
  },
  listenEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  listenChapterTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  listenChapterMeta: {
    fontSize: 14,
    fontWeight: '600',
  },
  listenPrimaryAction: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listenPrimaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  listenPlayerCard: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 10,
  },
  listenProgressTouch: {
    justifyContent: 'center',
    height: 22,
  },
  listenProgressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  listenProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  listenTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  listenTimeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listenActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  listenSecondaryAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listenSecondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  readerBlock: {
    gap: 6,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionHeading: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 14,
  },
  verseText: {
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  inlineVerseNumber: {
    fontWeight: '700',
  },
  feedbackCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 14,
    minHeight: 220,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  feedbackBody: {
    fontSize: 15,
    lineHeight: 24,
  },
  feedbackButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdropFill: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 96,
    paddingHorizontal: 16,
  },
  actionSheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  actionRow: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 20,
    maxHeight: '78%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  audioOptionsList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  audioOptionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  audioOptionLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  audioOptionValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  translationList: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  translationCard: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  translationItem: {
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  translationInfo: {
    flex: 1,
  },
  translationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  translationName: {
    fontSize: 16,
    fontWeight: '700',
  },
  translationAbbr: {
    fontSize: 12,
    fontWeight: '700',
  },
  translationDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  translationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  translationSize: {
    fontSize: 12,
    fontWeight: '500',
  },
  downloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  downloadedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followAlongContainer: {
    flex: 1,
  },
  followAlongHeader: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  followAlongEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  followAlongTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  followAlongCloseButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followAlongCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  followAlongScrollView: {
    flex: 1,
  },
  followAlongContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  followAlongVerseCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  followAlongHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  followAlongVerseText: {
    fontSize: 28,
    lineHeight: 40,
    fontWeight: '400',
  },
  followAlongVerseNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  fontSheet: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 14,
  },
  fontSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
  },
  fontSheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fontOptionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fontOptionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  fontOptionSample: {
    fontWeight: '700',
  },
  fontOptionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  footerShell: {
    borderTopWidth: 1,
  },
});
