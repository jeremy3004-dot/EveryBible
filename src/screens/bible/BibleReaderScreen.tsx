import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById, getBookIcon } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, shadows, spacing, typography } from '../../design/system';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import {
  getAnnotationsForChapter,
  upsertAnnotation,
  softDeleteAnnotation,
} from '../../services/annotations/annotationService';
import { getChapter } from '../../services/bible';
import { getChapterPresentationMode } from '../../services/bible/presentation';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { useAudioStore, useAuthStore, useBibleStore, useLibraryStore, useProgressStore } from '../../stores';
import { getAdjacentAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useFontSize, useAudioPlayer } from '../../hooks';
import {
  VersesSkeleton,
  AudioFirstChapterCard,
  AudioProgressScrubber,
  PlaybackControls,
} from '../../components';
import { AnnotationActionSheet } from '../../components/annotations/AnnotationActionSheet';
import type { BibleTranslation, Verse } from '../../types';
import type { UserAnnotation } from '../../services/supabase/types';
import type { BibleStackParamList, BibleReaderScreenProps } from '../../navigation/types';
import {
  READER_HERO_COLLAPSE_DISTANCE,
  READER_TOP_CHROME_DISMISS_DISTANCE,
  buildReaderChapterRouteParams,
  getEstimatedFollowAlongVerse,
  getInitialChapterSessionMode,
  isActiveAudioTrackMatch,
  getNextChapterSessionMode,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
  shouldAutoplayChapterAudio,
  shouldReplayActiveAudioForTranslationChange,
  shouldSyncReaderToActiveAudioChapter,
  shouldTransferActiveAudioOnChapterChange,
} from './bibleReaderModel';
import { getTranslationSelectionState } from './bibleTranslationModel';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

interface GlassSurfaceProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
}

function GlassSurface({ children, style, contentStyle, intensity = 36 }: GlassSurfaceProps) {
  const { isDark } = useTheme();

  return (
    <View style={[styles.glassSurface, shadows.floating, style]}>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={intensity}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.05)']
            : ['rgba(255,255,255,0.84)', 'rgba(255,255,255,0.32)']
        }
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glassStroke,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)',
          },
        ]}
      />
      <View style={[styles.glassContent, contentStyle]}>{children}</View>
    </View>
  );
}

export function BibleReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleReaderScreenProps['route']>();
  const {
    bookId,
    chapter,
    autoplayAudio,
    preferredMode,
    focusVerse,
    playbackSequenceEntries = [],
  } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const autoplayKeyRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const previousActiveAudioBookIdRef = useRef<string | null>(null);
  const previousActiveAudioChapterRef = useRef<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const followAlongScrollViewRef = useRef<ScrollView | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const followAlongOffsetsRef = useRef<Record<number, number>>({});
  const readerScrollY = useRef(new Animated.Value(0)).current;

  const [verses, setVerses] = useState<Verse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFontSizeSheet, setShowFontSizeSheet] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [showFollowAlongText, setShowFollowAlongText] = useState(false);
  const [showChapterActionsSheet, setShowChapterActionsSheet] = useState(false);
  const [chapterSessionMode, setChapterSessionMode] = useState<'listen' | 'read'>('read');
  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [showAnnotationSheet, setShowAnnotationSheet] = useState(false);
  const lastStableSessionModeRef = useRef(chapterSessionMode);

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
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
  const setPlaybackSequence = useAudioStore((state) => state.setPlaybackSequence);
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
    currentTranslationId: activeAudioTranslationId,
    currentBookId: activeAudioBookId,
    currentChapter: activeAudioChapter,
    currentPosition,
    duration,
    playbackRate,
    repeatMode,
    sleepTimerRemaining,
    backgroundMusicChoice,
    playChapter,
    playChapterForTranslation,
    addToQueue,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    cycleRepeatMode,
    startSleepTimer,
    changeBackgroundMusicChoice,
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
  const rawPresentationMode = getChapterPresentationMode({
    verses,
    translation: currentTranslationInfo,
    audioAvailable: audioEnabled,
  });
  const lastStablePresentationModeRef = useRef(rawPresentationMode);
  if (!isLoading) {
    lastStablePresentationModeRef.current = rawPresentationMode;
    lastStableSessionModeRef.current = chapterSessionMode;
  }
  const chapterPresentationMode = isLoading
    ? lastStablePresentationModeRef.current
    : rawPresentationMode;
  const canReadDisplayedChapter = chapterPresentationMode === 'text' && verses.length > 0;
  const canAdjustFontSize = canReadDisplayedChapter;
  const canShowTranslationSheet = config.features.multipleTranslations;
  const canToggleSessionMode = audioEnabled && canReadDisplayedChapter;
  const showSessionModeRail =
    chapterPresentationMode === 'text' ||
    canToggleSessionMode ||
    chapterPresentationMode === 'audio-first';
  const stableSessionMode = isLoading ? lastStableSessionModeRef.current : chapterSessionMode;
  const showMinimalListenChrome =
    stableSessionMode === 'listen' || chapterPresentationMode === 'audio-first';
  const activeFollowAlongVerse = getEstimatedFollowAlongVerse({
    verses,
    currentPosition,
    duration,
    fallbackVerse: focusVerse,
  });
  const isCurrentAudioChapter = isActiveAudioTrackMatch({
    translationId: currentTranslation,
    bookId,
    chapter,
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
  });
  const showPremiumReadMode =
    chapterPresentationMode === 'text' &&
    chapterSessionMode === 'read' &&
    verses.length > 0 &&
    !isLoading &&
    error == null;
  const primarySectionHeading =
    verses.find((verse) => verse.heading?.trim())?.heading?.trim() ?? null;
  const firstHeadingVerseId = verses.find((verse) => verse.heading?.trim())?.id ?? null;
  const premiumTopInset = insets.top + 12;
  const premiumBottomInset = insets.bottom + 18;
  const topChromeOpacity = readerScrollY.interpolate({
    inputRange: [0, READER_TOP_CHROME_DISMISS_DISTANCE * 0.7, READER_TOP_CHROME_DISMISS_DISTANCE],
    outputRange: [1, 0.88, 0],
    extrapolate: 'clamp',
  });
  const topChromeTranslateY = readerScrollY.interpolate({
    inputRange: [0, READER_TOP_CHROME_DISMISS_DISTANCE],
    outputRange: [0, -36],
    extrapolate: 'clamp',
  });
  const heroOpacity = readerScrollY.interpolate({
    inputRange: [0, READER_HERO_COLLAPSE_DISTANCE * 0.45, READER_HERO_COLLAPSE_DISTANCE],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });
  const heroTranslateY = readerScrollY.interpolate({
    inputRange: [0, READER_HERO_COLLAPSE_DISTANCE],
    outputRange: [0, -52],
    extrapolate: 'clamp',
  });
  const readerScrollHandler = Animated.event(
    [{ nativeEvent: { contentOffset: { y: readerScrollY } } }],
    { useNativeDriver: true }
  );

  useEffect(() => {
    setCurrentBook(bookId);
    setCurrentChapter(chapter);
  }, [bookId, chapter, setCurrentBook, setCurrentChapter]);

  useEffect(() => {
    if (playbackSequenceEntries.length === 0) {
      return;
    }

    setPlaybackSequence(playbackSequenceEntries);
  }, [playbackSequenceEntries, setPlaybackSequence]);

  useEffect(() => {
    void loadChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter, currentTranslation]);

  useEffect(() => {
    verseOffsetsRef.current = {};
    followAlongOffsetsRef.current = {};
    if (focusVerse == null) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [bookId, chapter, focusVerse]);

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
        translationId: currentTranslation,
        audioEnabled,
        hasText: verses.length > 0,
        autoplayAudio: Boolean(autoplayAudio),
        preferredMode: preferredMode ?? null,
        bookId,
        chapter,
        activeAudioTranslationId,
        activeAudioBookId,
        activeAudioChapter,
      })
    );
  }, [
    activeAudioTranslationId,
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
        translationId: currentTranslation,
        autoplayAudio: Boolean(autoplayAudio),
        audioEnabled,
        isLoading,
        bookId,
        chapter,
        activeAudioTranslationId,
        activeAudioBookId,
        activeAudioChapter,
      })
    ) {
      return;
    }

    const autoplayKey = `${currentTranslation}:${bookId}:${chapter}:${focusVerse ?? 'chapter'}:${chapterPresentationMode}`;
    if (autoplayKeyRef.current === autoplayKey) {
      return;
    }

    autoplayKeyRef.current = autoplayKey;

    void playChapter(
      bookId,
      chapter,
      currentTranslationInfo?.audioGranularity === 'verse' ? focusVerse : undefined
    );
  }, [
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
    autoplayAudio,
    audioEnabled,
    bookId,
    chapter,
    chapterPresentationMode,
    currentTranslation,
    currentTranslationInfo,
    focusVerse,
    isLoading,
    playChapter,
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

    navigation.setParams({
      bookId: activeAudioBookId ?? bookId,
      chapter: activeAudioChapter,
      focusVerse: undefined,
      autoplayAudio: false,
    });
  }, [audioEnabled, activeAudioBookId, activeAudioChapter, bookId, chapter, navigation]);

  useEffect(() => {
    const loadAnnotations = async () => {
      const result = await getAnnotationsForChapter(bookId, chapter);
      if (result.success && result.data) {
        setAnnotations(result.data);
      }
    };
    if (isAuthenticated) {
      loadAnnotations();
    }
  }, [bookId, chapter, isAuthenticated]);

  const loadChapter = async () => {
    // Only show loading skeleton on the very first load (no verses yet).
    // For chapter-to-chapter transitions, keep the old content visible to
    // avoid a layout flash / button jump.
    if (verses.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await getChapter(currentTranslation, bookId, chapter);
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

  const previousSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    playbackSequenceEntries,
    bookId,
    chapter,
    -1
  );
  const nextSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    playbackSequenceEntries,
    bookId,
    chapter,
    1
  );
  const previousNavigationTarget =
    previousSequenceEntry ?? (chapter > 1 ? { bookId, chapter: chapter - 1 } : null);
  const nextNavigationTarget =
    nextSequenceEntry ?? (chapter < book.chapters ? { bookId, chapter: chapter + 1 } : null);
  const hasPrevChapter = previousNavigationTarget != null;
  const hasNextChapter = nextNavigationTarget != null;
  const shouldFillReaderCanvas =
    chapterPresentationMode === 'audio-first' || chapterSessionMode === 'listen';
  const syncReaderReference = (nextBookId: string, nextChapter: number) => {
    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: nextBookId,
        chapter: nextChapter,
        preferredMode: chapterSessionMode,
      })
    );
  };
  const dismissFontSizeSheetFromReader = () => {
    setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'readerContentTap'));
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
      return;
    }

    if (nextMode === 'listen' && !isCurrentAudioChapter) {
      void playChapter(
        bookId,
        chapter,
        currentTranslationInfo?.audioGranularity === 'verse' ? focusVerse : undefined
      );
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
      const shouldReplayAudio = shouldReplayActiveAudioForTranslationChange({
        currentTranslationId: currentTranslation,
        nextTranslationId: translation.id,
        audioEnabled: audioAvailability.canPlayAudio,
        bookId,
        chapter,
        activeAudioTranslationId,
        activeAudioBookId,
        activeAudioChapter,
      });

      setCurrentTranslation(translation.id);

      if (shouldReplayAudio) {
        void playChapterForTranslation(
          translation.id,
          bookId,
          chapter,
          translation.audioGranularity === 'verse' ? focusVerse : undefined
        );
      }

      return;
    }

    if (selectionState.reason === 'audio-unavailable') {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
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

  const handleOpenFontSizeOptions = () => {
    setShowChapterActionsSheet(false);
    setShowTranslationSheet(false);

    if (!canAdjustFontSize) {
      return;
    }

    setChapterSessionMode('read');
    setShowFontSizeSheet(true);
  };

  const handleOpenTranslationOptions = () => {
    setShowChapterActionsSheet(false);
    setShowFontSizeSheet(false);

    if (!canShowTranslationSheet) {
      return;
    }

    setShowTranslationSheet(true);
  };

  const handlePlayDisplayedChapter = () => {
    if (!isCurrentAudioChapter) {
      void playChapter(bookId, chapter);
      return;
    }

    void togglePlayPause();
  };

  const handleListenModeSeek = (positionMs: number) => {
    if (duration <= 0 || !isCurrentAudioChapter) {
      return;
    }

    void seekTo(Math.max(0, Math.min(duration, positionMs)));
  };

  const handlePreviousListenChapter = async () => {
    if (isCurrentAudioChapter) {
      const target = await previousChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    if (!previousNavigationTarget) {
      return;
    }

    await playChapter(previousNavigationTarget.bookId, previousNavigationTarget.chapter);
    syncReaderReference(previousNavigationTarget.bookId, previousNavigationTarget.chapter);
  };

  const handleNextListenChapter = async () => {
    if (isCurrentAudioChapter) {
      const target = await nextChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    if (!nextNavigationTarget) {
      return;
    }

    await playChapter(nextNavigationTarget.bookId, nextNavigationTarget.chapter);
    syncReaderReference(nextNavigationTarget.bookId, nextNavigationTarget.chapter);
  };

  const handleReadChapterNavigation = async (target: { bookId: string; chapter: number } | null) => {
    if (!target) {
      return;
    }

    setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'chapterChange'));
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
    setShowChapterActionsSheet(false);

    if (
      shouldTransferActiveAudioOnChapterChange({
        audioEnabled,
        isCurrentAudioChapter,
      })
    ) {
      await playChapter(target.bookId, target.chapter);
    }

    syncReaderReference(target.bookId, target.chapter);
  };

  const handlePreviousReadChapter = async () => {
    await handleReadChapterNavigation(previousNavigationTarget);
  };

  const handleNextReadChapter = async () => {
    await handleReadChapterNavigation(nextNavigationTarget);
  };

  const reloadAnnotations = async () => {
    const result = await getAnnotationsForChapter(bookId, chapter);
    if (result.success && result.data) {
      setAnnotations(result.data);
    }
  };

  const handleAnnotationBookmark = async () => {
    const existing = annotations.find(
      (a) => a.verse_start === selectedVerse && a.type === 'bookmark' && !a.deleted_at
    );
    if (existing) {
      await softDeleteAnnotation(existing.id);
    } else if (selectedVerse != null) {
      await upsertAnnotation({
        id: Math.random().toString(36).slice(2),
        book: bookId,
        chapter,
        verse_start: selectedVerse,
        verse_end: null,
        type: 'bookmark',
        color: null,
        content: null,
        deleted_at: null,
      });
    }
    await reloadAnnotations();
  };

  const handleAnnotationHighlight = async (color: string) => {
    const existing = annotations.find(
      (a) => a.verse_start === selectedVerse && a.type === 'highlight' && !a.deleted_at
    );
    if (existing) {
      await upsertAnnotation({
        id: existing.id,
        book: bookId,
        chapter,
        verse_start: existing.verse_start,
        verse_end: existing.verse_end,
        type: 'highlight',
        color,
        content: null,
        deleted_at: null,
      });
    } else if (selectedVerse != null) {
      await upsertAnnotation({
        id: Math.random().toString(36).slice(2),
        book: bookId,
        chapter,
        verse_start: selectedVerse,
        verse_end: null,
        type: 'highlight',
        color,
        content: null,
        deleted_at: null,
      });
    }
    await reloadAnnotations();
  };

  const handleAnnotationNote = async (text: string) => {
    const existing = annotations.find(
      (a) => a.verse_start === selectedVerse && a.type === 'note' && !a.deleted_at
    );
    if (existing) {
      await upsertAnnotation({
        id: existing.id,
        book: bookId,
        chapter,
        verse_start: existing.verse_start,
        verse_end: existing.verse_end,
        type: 'note',
        color: null,
        content: text,
        deleted_at: null,
      });
    } else if (selectedVerse != null) {
      await upsertAnnotation({
        id: Math.random().toString(36).slice(2),
        book: bookId,
        chapter,
        verse_start: selectedVerse,
        verse_end: null,
        type: 'note',
        color: null,
        content: text,
        deleted_at: null,
      });
    }
    await reloadAnnotations();
  };

  const renderListenMode = () => {
    const listenStatus = isCurrentAudioChapter ? status : 'idle';
    const listenPosition = isCurrentAudioChapter ? currentPosition : 0;
    const listenDuration = isCurrentAudioChapter ? duration : 0;
    const highlightedVerse = activeFollowAlongVerse ?? focusVerse ?? verses[0]?.verse ?? null;
    const remainingDuration = Math.max(listenDuration - listenPosition, 0);

    return (
      <View style={styles.listenColumn}>
        <View
          style={[
            styles.listenArtworkFrame,
            {
              backgroundColor: colors.bibleElevatedSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Image source={getBookIcon(bookId)} style={styles.listenArtwork} resizeMode="cover" />
        </View>

        <View style={styles.listenMetaBlock}>
          <Text style={[styles.listenChapterTitle, { color: colors.biblePrimaryText }]}>
            {book.name} {chapter}
          </Text>
          <Text style={[styles.listenChapterMeta, { color: colors.bibleSecondaryText }]}>
            {verses.length} {verses.length === 1 ? 'Verse' : 'Verses'}
          </Text>
        </View>

        <View
          style={[
            styles.listenPlayerCard,
            {
              backgroundColor: 'transparent',
              borderColor: 'transparent',
            },
          ]}
        >
          <AudioProgressScrubber
            position={listenPosition}
            duration={listenDuration}
            onSeek={handleListenModeSeek}
            trackColor={colors.bibleDivider}
            fillColor={colors.bibleAccent}
            containerStyle={styles.listenProgressTouch}
            trackStyle={styles.listenProgressTrack}
            fillStyle={styles.listenProgressFill}
          />

          <View style={styles.listenTimeRow}>
            <Text style={[styles.listenTimeText, { color: colors.bibleSecondaryText }]}>
              {formatTime(listenPosition)}
            </Text>
            <Text style={[styles.listenTimeCenterText, { color: colors.bibleSecondaryText }]}>
              {highlightedVerse != null
                ? `${book.name} ${chapter}:${highlightedVerse}`
                : `${book.name} ${chapter}`}
            </Text>
            <Text style={[styles.listenTimeText, { color: colors.bibleSecondaryText }]}>
              -{formatTime(remainingDuration)}
            </Text>
          </View>

          <PlaybackControls
            variant="chapter-only"
            status={listenStatus}
            playbackRate={playbackRate}
            repeatMode={repeatMode}
            sleepTimerRemaining={sleepTimerRemaining}
            backgroundMusicChoice={backgroundMusicChoice}
            hasPreviousChapter={hasPrevChapter}
            hasNextChapter={hasNextChapter}
            onPlayPause={handlePlayDisplayedChapter}
            onPreviousChapter={() => void handlePreviousListenChapter()}
            onNextChapter={() => void handleNextListenChapter()}
            onSkipBackward={() => void skipBackward()}
            onSkipForward={() => void skipForward()}
            onChangePlaybackRate={changePlaybackRate}
            onCycleRepeatMode={cycleRepeatMode}
            onSetSleepTimer={startSleepTimer}
            onChangeBackgroundMusicChoice={changeBackgroundMusicChoice}
            onShowText={() => setShowFollowAlongText(true)}
            showTextLabel="Text"
          />
        </View>
      </View>
    );
  };

  const renderReaderVerses = (usePremiumTypography: boolean) => {
    const verseFontSize = usePremiumTypography
      ? scaleValue(typography.readingBody.fontSize)
      : scaleValue(20);
    const verseLineHeight = usePremiumTypography
      ? scaleValue(typography.readingBody.lineHeight * 1.15)
      : scaleValue(64);
    const verseNumberSize = usePremiumTypography
      ? scaleValue(typography.readingVerseNumber.fontSize)
      : scaleValue(12);
    const headingFontSize = usePremiumTypography
      ? scaleValue(typography.readingHeading.fontSize)
      : scaleValue(15);

    // Group verses into paragraphs split by section headings
    const paragraphs: { heading: string | null; verses: typeof verses }[] = [];
    let currentParagraph: { heading: string | null; verses: typeof verses } = {
      heading: null,
      verses: [],
    };

    for (const verse of verses) {
      const shouldRenderHeading =
        Boolean(verse.heading) && (!usePremiumTypography || verse.id !== firstHeadingVerseId);

      if (shouldRenderHeading && currentParagraph.verses.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = { heading: verse.heading ?? null, verses: [verse] };
      } else {
        if (shouldRenderHeading) {
          currentParagraph.heading = verse.heading ?? null;
        }
        currentParagraph.verses.push(verse);
      }
    }
    if (currentParagraph.verses.length > 0) {
      paragraphs.push(currentParagraph);
    }

    const textStyle = [
      styles.verseText,
      usePremiumTypography ? styles.premiumVerseText : null,
      { fontSize: verseFontSize, lineHeight: verseLineHeight, color: colors.biblePrimaryText },
    ];

    return (
      <View style={[styles.readerColumn, usePremiumTypography ? styles.premiumReaderColumn : null]}>
        {paragraphs.map((paragraph, pIndex) => (
          <View
            key={pIndex}
            style={[
              styles.readerBlock,
              usePremiumTypography ? styles.premiumReaderBlock : null,
            ]}
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              for (const v of paragraph.verses) {
                verseOffsetsRef.current[v.verse] = y;
              }
            }}
          >
            {paragraph.heading ? (
              <Text
                style={[
                  styles.sectionHeading,
                  usePremiumTypography ? styles.premiumSectionHeading : null,
                  {
                    fontSize: headingFontSize,
                    color: colors.bibleSecondaryText,
                  },
                ]}
              >
                {paragraph.heading}
              </Text>
            ) : null}
            <Text style={textStyle}>
              {paragraph.verses.map((verse, vIndex) => {
                const verseAnnotations = annotations.filter(
                  (a) => a.verse_start === verse.verse && !a.deleted_at
                );
                const highlightAnnotation = verseAnnotations.find((a) => a.type === 'highlight');
                const isFocused = verse.verse === focusVerse;

                return (
                  <Text
                    key={verse.id}
                    onLongPress={
                      isAuthenticated
                        ? () => {
                            setSelectedVerse(verse.verse);
                            setShowAnnotationSheet(true);
                          }
                        : undefined
                    }
                    style={[
                      isFocused
                        ? { backgroundColor: colors.bibleAccent + '30' }
                        : null,
                      highlightAnnotation?.color
                        ? { backgroundColor: highlightAnnotation.color + '25' }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.inlineVerseNumber,
                        usePremiumTypography ? styles.premiumVerseNumber : null,
                        {
                          fontSize: verseNumberSize,
                          color: colors.bibleAccent,
                        },
                      ]}
                    >
                      {verse.verse}
                    </Text>
                    {'\u00A0'}{verse.text}{vIndex < paragraph.verses.length - 1 ? ' ' : ''}
                  </Text>
                );
              })}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderLegacyContent = () => {
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
            playbackSequenceEntries={playbackSequenceEntries}
            onChapterChange={(nextBookId, newChapter) => {
              syncReaderReference(nextBookId, newChapter);
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

    return renderReaderVerses(false);
  };

  const renderPremiumReadLayout = () => (
    <View style={styles.premiumReaderLayout}>
      <Animated.View
        style={[
          styles.floatingReaderTopBar,
          {
            top: premiumTopInset,
            opacity: topChromeOpacity,
            transform: [{ translateY: topChromeTranslateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.touchableGlassButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('BibleBrowser')}
        >
          <GlassSurface style={styles.glassIconButton} intensity={44}>
            <Ionicons name="arrow-back" size={20} color={colors.biblePrimaryText} />
          </GlassSurface>
        </TouchableOpacity>

        {showSessionModeRail ? (
          <GlassSurface
            style={styles.floatingReaderModeRail}
            contentStyle={styles.floatingReaderModeRailContent}
          >
            {(['listen', 'read'] as const).map((mode) => {
              const isSelected = chapterSessionMode === mode;
              const isDisabled = mode === 'listen' ? !audioEnabled : !canReadDisplayedChapter;

              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.floatingReaderModeButton,
                    isSelected ? { backgroundColor: colors.bibleControlBackground } : null,
                    isDisabled ? styles.disabledSessionModeButton : null,
                  ]}
                  disabled={isDisabled}
                  onPress={() => handleSessionModePress(mode)}
                >
                  <Text
                    style={[
                      styles.floatingReaderModeLabel,
                      {
                        color: isSelected
                          ? colors.bibleBackground
                          : colors.bibleSecondaryText,
                      },
                    ]}
                  >
                    {mode === 'listen' ? 'Listen' : 'Read'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </GlassSurface>
        ) : (
          <View style={styles.floatingReaderModeSpacer} />
        )}

        <TouchableOpacity
          style={styles.touchableGlassButton}
          activeOpacity={0.9}
          onPress={() => {
            setShowFontSizeSheet(false);
            setShowTranslationSheet(false);
            setShowChapterActionsSheet(true);
          }}
        >
          <GlassSurface style={styles.glassIconButton} intensity={44}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.biblePrimaryText} />
          </GlassSurface>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.floatingReaderTranslationDock,
          {
            top: premiumTopInset + 62,
            opacity: topChromeOpacity,
            transform: [{ translateY: topChromeTranslateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.floatingReaderTranslationButtonTouchable}
          activeOpacity={canShowTranslationSheet ? 0.9 : 1}
          disabled={!canShowTranslationSheet}
          onPress={handleOpenTranslationOptions}
        >
          <GlassSurface
            style={styles.floatingReaderTranslationButton}
            contentStyle={styles.floatingReaderTranslationButtonContent}
            intensity={40}
          >
            <Text
              style={[
                styles.floatingReaderTranslationButtonLabel,
                {
                  color: canShowTranslationSheet
                    ? colors.biblePrimaryText
                    : colors.bibleSecondaryText,
                },
              ]}
              numberOfLines={1}
            >
              {translationLabel}
            </Text>
          </GlassSurface>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.floatingReaderHero,
          {
            top: premiumTopInset + 124,
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }],
          },
        ]}
      >
        <Text
          style={[
            styles.premiumReaderTitle,
            {
              color: colors.biblePrimaryText,
              fontSize: scaleValue(typography.readingDisplay.fontSize),
              lineHeight: scaleValue(typography.readingDisplay.lineHeight),
            },
          ]}
        >
          {book.name} {chapter}
        </Text>
        {primarySectionHeading ? (
          <Text
            style={[
              styles.premiumReaderSubtitle,
              {
                color: colors.bibleSecondaryText,
                fontSize: scaleValue(typography.readingHeading.fontSize),
                lineHeight: scaleValue(typography.readingHeading.lineHeight),
              },
            ]}
          >
            {primarySectionHeading}
          </Text>
        ) : null}
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={readerScrollHandler}
        onScrollBeginDrag={() => {
          setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'scrollStart'));
          setShowTranslationSheet((current) =>
            getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
          );
        }}
        contentContainerStyle={[
          styles.premiumReaderScrollContent,
          {
            paddingTop: premiumTopInset + 208,
            paddingBottom: premiumBottomInset + 108,
          },
        ]}
      >
        <View style={styles.premiumReaderContentShell}>{renderReaderVerses(true)}</View>
      </Animated.ScrollView>

      <View style={[styles.persistentReaderBottomBar, { bottom: premiumBottomInset }]}>
        <GlassSurface
          style={styles.persistentReaderBottomBarSurface}
          contentStyle={styles.persistentReaderBottomBarContent}
          intensity={44}
        >
          <TouchableOpacity
            style={[
              styles.persistentReaderArrowButton,
              !hasPrevChapter ? styles.disabledIconButton : null,
            ]}
            activeOpacity={0.9}
            onPress={() => void handlePreviousReadChapter()}
            disabled={!hasPrevChapter}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={hasPrevChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.persistentReaderChapterCenter}
            activeOpacity={0.9}
            onPress={() => setShowChapterActionsSheet(true)}
          >
            <Text
              style={[styles.persistentReaderChapterLabel, { color: colors.biblePrimaryText }]}
              numberOfLines={1}
            >
              {book.name} {chapter}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.persistentReaderArrowButton,
              !hasNextChapter ? styles.disabledIconButton : null,
            ]}
            activeOpacity={0.9}
            onPress={() => void handleNextReadChapter()}
            disabled={!hasNextChapter}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={hasNextChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
            />
          </TouchableOpacity>
        </GlassSurface>
      </View>
    </View>
  );

  const renderLegacyReaderLayout = () => (
    <>
      <View
        style={[
          styles.header,
          showMinimalListenChrome ? styles.minimalHeader : null,
          {
            borderBottomColor: colors.bibleDivider,
            borderBottomWidth: showMinimalListenChrome ? 0 : 1,
          },
        ]}
      >
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('BibleBrowser')}>
          <Ionicons name="chevron-back" size={24} color={colors.biblePrimaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {showSessionModeRail ? (
            <View
              style={[
                styles.sessionModeRail,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
            >
              {(['listen', 'read'] as const).map((mode) => {
                const isSelected = chapterSessionMode === mode;
                const isDisabled = mode === 'read' && !canReadDisplayedChapter;

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
                      isDisabled ? styles.disabledSessionModeButton : null,
                    ]}
                    onPress={() => handleSessionModePress(mode)}
                    disabled={isDisabled}
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

          {!showMinimalListenChrome && (
            <>
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
            </>
          )}
        </View>

        <View style={styles.headerActions}>
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
          setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'scrollStart'));
        }}
        contentContainerStyle={[
          styles.content,
          shouldFillReaderCanvas ? styles.immersiveContent : null,
          {
            paddingBottom: 32,
            paddingTop: fontSize === 'large' ? 28 : 18,
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
          {renderLegacyContent()}
        </View>
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top', 'bottom']}
    >
      {showPremiumReadMode ? renderPremiumReadLayout() : renderLegacyReaderLayout()}

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
            style={[styles.fontSheetHandle, { backgroundColor: colors.bibleSecondaryText + '55' }]}
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
              ...(canAdjustFontSize
                ? [
                    {
                      key: 'font-size',
                      icon: 'text-outline',
                      label: t('settings.fontSize'),
                      onPress: handleOpenFontSizeOptions,
                    },
                  ]
                : []),
              ...(canShowTranslationSheet
                ? [
                    {
                      key: 'translation',
                      icon: 'book-outline',
                      label: t('bible.selectTranslation'),
                      onPress: handleOpenTranslationOptions,
                    },
                  ]
                : []),
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
                                name={
                                  selectionState.isSelectable ? 'checkmark-circle' : 'time-outline'
                                }
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
              <Ionicons name="chevron-back" size={20} color={colors.biblePrimaryText} />
              <Text style={[styles.followAlongCloseLabel, { color: colors.biblePrimaryText }]}>
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
                    <Text style={[styles.followAlongHeading, { color: colors.bibleSecondaryText }]}>
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

      <AnnotationActionSheet
        visible={showAnnotationSheet}
        verseNumber={selectedVerse ?? 0}
        bookId={bookId}
        chapter={chapter}
        onBookmark={handleAnnotationBookmark}
        onHighlight={handleAnnotationHighlight}
        onNote={handleAnnotationNote}
        onClose={() => {
          setShowAnnotationSheet(false);
          setSelectedVerse(null);
        }}
        existingNote={
          annotations.find(
            (a) => a.verse_start === selectedVerse && a.type === 'note' && !a.deleted_at
          )?.content ?? undefined
        }
        isBookmarked={annotations.some(
          (a) => a.verse_start === selectedVerse && a.type === 'bookmark' && !a.deleted_at
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  premiumReaderLayout: {
    flex: 1,
  },
  glassSurface: {
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  glassStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  glassContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  touchableGlassButton: {
    alignSelf: 'flex-start',
  },
  glassIconButton: {
    minWidth: layout.minTouchTarget + 4,
    minHeight: layout.minTouchTarget + 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  floatingReaderTopBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  floatingReaderModeRail: {
    flex: 1,
    maxWidth: 188,
    alignSelf: 'center',
  },
  floatingReaderModeRailContent: {
    padding: 4,
    gap: 4,
  },
  floatingReaderModeButton: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  floatingReaderModeLabel: {
    ...typography.label,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  floatingReaderModeSpacer: {
    flex: 1,
  },
  floatingReaderTranslationDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    alignItems: 'center',
  },
  floatingReaderTranslationButtonTouchable: {
    alignSelf: 'center',
  },
  floatingReaderTranslationButton: {
    minHeight: 34,
    borderRadius: radius.pill,
    maxWidth: 240,
  },
  floatingReaderTranslationButtonContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  floatingReaderTranslationButtonLabel: {
    ...typography.label,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  floatingReaderHero: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 20,
    alignItems: 'center',
    gap: spacing.lg,
  },
  premiumReaderTitle: {
    ...typography.readingDisplay,
    textAlign: 'center',
  },
  premiumReaderSubtitle: {
    ...typography.readingHeading,
    textAlign: 'center',
    opacity: 0.84,
  },
  premiumReaderScrollContent: {
    paddingHorizontal: spacing.xl,
  },
  premiumReaderContentShell: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  minimalHeader: {
    paddingBottom: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconButton: {
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  disabledIconButton: {
    opacity: 0.45,
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
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  sessionModeButton: {
    minWidth: 88,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  disabledSessionModeButton: {
    opacity: 0.45,
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
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  translationChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
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
    gap: 20,
  },
  premiumReaderColumn: {
    gap: 16,
  },
  listenColumn: {
    flex: 1,
    gap: 20,
    justifyContent: 'space-between',
  },
  listenArtworkFrame: {
    alignSelf: 'stretch',
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listenArtwork: {
    width: '100%',
    height: '100%',
  },
  listenMetaBlock: {
    gap: 6,
  },
  listenChapterTitle: {
    fontSize: 30,
    fontWeight: '700',
  },
  listenChapterMeta: {
    fontSize: 14,
    fontWeight: '600',
  },
  listenPlayerCard: {
    marginTop: 'auto',
    paddingBottom: 8,
    gap: 12,
  },
  listenProgressTouch: {
    justifyContent: 'center',
    height: 22,
  },
  listenProgressTrack: {
    height: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  listenProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  listenTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  listenTimeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listenTimeCenterText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  readerBlock: {
    gap: 10,
    paddingHorizontal: 12,
  },
  premiumReaderBlock: {
    gap: 6,
    paddingHorizontal: 0,
  },
  sectionHeading: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 8,
  },
  premiumSectionHeading: {
    ...typography.readingHeading,
    textTransform: 'none',
    letterSpacing: -0.1,
    marginTop: 8,
    marginBottom: 4,
  },
  verseText: {
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  premiumVerseText: {
    ...typography.readingBody,
    letterSpacing: -0.1,
  },
  inlineVerseNumber: {
    fontWeight: '700',
  },
  premiumVerseNumber: {
    ...typography.readingVerseNumber,
    opacity: 0.92,
  },
  persistentReaderBottomBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 30,
  },
  persistentReaderBottomBarSurface: {
    borderRadius: radius.pill,
  },
  persistentReaderBottomBarContent: {
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  persistentReaderArrowButton: {
    width: layout.minTouchTarget + 4,
    minHeight: layout.minTouchTarget + 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  persistentReaderChapterCenter: {
    flex: 1,
    minHeight: layout.minTouchTarget + 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  persistentReaderChapterLabel: {
    ...typography.cardTitle,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  feedbackCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
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
    borderRadius: radius.pill,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    paddingTop: spacing.md,
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
    borderRadius: radius.pill,
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
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 8,
  },
  followAlongHeading: {
    ...typography.readingHeading,
  },
  followAlongVerseText: {
    ...typography.readingBody,
    fontSize: 18,
    lineHeight: 30,
  },
  followAlongVerseNumber: {
    ...typography.readingVerseNumber,
    fontSize: 12,
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
    borderRadius: radius.pill,
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
    borderRadius: radius.lg,
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
