import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  runOnJS,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoTrimModule, {
  isValidFile as isValidTrimMediaFile,
  trim as trimAudioMedia,
} from 'react-native-video-trim';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  getAdjacentBibleChapter,
  getBookById,
  getBookIcon,
  getTranslatedBookName,
} from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, shadows, spacing, typography } from '../../design/system';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import { getCurrentSession } from '../../services/auth';
import {
  getAnnotationsForChapter,
  softDeleteAnnotation,
  upsertAnnotation,
} from '../../services/annotations/annotationService';
import { buildBibleDeepLink, getChapter } from '../../services/bible';
import { getChapterPresentationMode } from '../../services/bible/presentation';
import {
  AUDIO_DOWNLOAD_ROOT_URI,
  expoAudioFileSystemAdapter,
  fetchRemoteChapterAudio,
  getAudioAvailability,
  getDownloadedChapterAudioUri,
  isRemoteAudioAvailable,
  prepareChapterAudioShareAsset,
} from '../../services/audio';
import { submitChapterFeedback } from '../../services/feedback';
import { normalizeChapterFeedbackIdentity } from '../../services/feedback/chapterFeedbackIdentity';
import type { ChapterFeedbackSourceScreen } from '../../services/feedback/chapterFeedbackService';
import {
  useAudioStore,
  useAuthStore,
  useBibleStore,
  useLibraryStore,
  useProgressStore,
} from '../../stores';
import { getAdjacentAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useFontSize, useAudioPlayer } from '../../hooks';
import { selectionHaptic } from '../../utils/haptics';
import {
  VersesSkeleton,
  AudioFirstChapterCard,
  AudioProgressScrubber,
  PlaybackControls,
} from '../../components';
import { AnnotationActionSheet } from '../../components/annotations/AnnotationActionSheet';
import { HighlightedVerseText } from '../../components/bible/HighlightedVerseText';
import type { BibleTranslation, Verse } from '../../types';
import type { UserAnnotation } from '../../services/supabase/types';
import type { BibleStackParamList, BibleReaderScreenProps } from '../../navigation/types';
import {
  buildBibleSelectionShareText,
  buildBibleSelectionVerseRanges,
  extractBibleSelectionText,
  formatBibleSelectionReference,
  getBibleSelectionShareTranslationLabel,
  toggleBibleSelectionVerse,
} from './bibleSelectionModel';
import { HOME_VERSE_BACKGROUND_SOURCES } from '../../data/homeVerseBackgrounds';
import { getHomeVerseBackgroundIndex } from '../../data/homeVerseBackgroundSelection';
import {
  READER_TOP_CHROME_DISMISS_DISTANCE,
  SWIPE_THRESHOLD,
  SWIPE_VELOCITY_MIN,
  FOLLOW_ALONG_VERSE_LINE_HEIGHT,
  buildReaderChapterRouteParams,
  getNextBibleTabBarVisibility,
  getEstimatedFollowAlongVerse,
  getInitialChapterSessionMode,
  getReaderVerseLineHeight,
  isActiveAudioTrackMatch,
  getNextChapterSessionMode,
  getNextFollowAlongVisibility,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
  shouldAutoplayChapterAudio,
  shouldReplayActiveAudioForTranslationChange,
  shouldSyncReaderToActiveAudioChapter,
  shouldTransferActiveAudioOnChapterChange,
} from './bibleReaderModel';
import {
  getChapterFeedbackResultVariant,
  normalizeChapterFeedbackComment,
  shouldEnableChapterFeedbackSubmit,
} from './bibleReaderFeedbackModel';
import { getTranslationSelectionState } from './bibleTranslationModel';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;
type VerseTimestamps = import('../../services/bible/verseTimestamps').VerseTimestamps;

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

interface VerseImageSharePreviewProps {
  previewRef: RefObject<View | null>;
  backgroundSource: import('react-native').ImageSourcePropType;
  referenceLabel: string;
  selectedText: string;
}

interface AudioPortionShareDraft {
  sourceUri: string;
  fileExtension: string;
  mimeType: string;
  durationMs: number;
}

const AUDIO_PORTION_MIN_DURATION_MS = 1000;
const AUDIO_PORTION_DEFAULT_DURATION_MS = 30000;
const AUDIO_PORTION_HANDLE_WIDTH = 20;

interface AudioRangeSelectorProps {
  durationMs: number;
  startMs: number;
  endMs: number;
  minRangeMs: number;
  previewPositionMs: number;
  trackColor: string;
  selectionColor: string;
  waveColor: string;
  selectedWaveColor: string;
  playedWaveColor: string;
  handleColor: string;
  onStartChange: (nextStartMs: number) => void;
  onEndChange: (nextEndMs: number) => void;
}

function AudioRangeSelector({
  durationMs,
  startMs,
  endMs,
  minRangeMs,
  previewPositionMs,
  trackColor,
  selectionColor,
  waveColor,
  selectedWaveColor,
  playedWaveColor,
  handleColor,
  onStartChange,
  onEndChange,
}: AudioRangeSelectorProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const waveformSamples = useMemo(
    () =>
      Array.from({ length: 44 }, (_, index) => {
        const harmonic = Math.sin((index + 1) * 0.9);
        const pulse = Math.sin((index + 1) * 0.33);
        const normalized = 0.25 + Math.abs(harmonic) * 0.5 + Math.abs(pulse) * 0.25;
        return 8 + Math.round(normalized * 34);
      }),
    []
  );

  const safeDurationMs = Math.max(durationMs, minRangeMs);
  const pxPerMs = trackWidth > 0 ? trackWidth / safeDurationMs : 0;
  const minGapPx = pxPerMs * minRangeMs;
  const clampedStartMs = Math.max(0, Math.min(startMs, safeDurationMs));
  const clampedEndMs = Math.max(clampedStartMs, Math.min(endMs, safeDurationMs));
  const startPx = pxPerMs * clampedStartMs;
  const endPx = pxPerMs * clampedEndMs;
  const previewPx = pxPerMs * Math.max(0, Math.min(previewPositionMs, safeDurationMs));

  const pxToMs = useCallback(
    (positionPx: number) => {
      if (trackWidth <= 0 || safeDurationMs <= 0) {
        return 0;
      }

      return Math.max(0, Math.min(safeDurationMs, Math.round((positionPx / trackWidth) * safeDurationMs)));
    },
    [safeDurationMs, trackWidth]
  );

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const startHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gestureState) => {
          const maxStartPx = Math.max(endPx - minGapPx, 0);
          const nextStartPx = Math.max(0, Math.min(maxStartPx, startPx + gestureState.dx));
          onStartChange(pxToMs(nextStartPx));
        },
      }),
    [endPx, minGapPx, onStartChange, pxToMs, startPx]
  );

  const endHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gestureState) => {
          const minEndPx = Math.min(startPx + minGapPx, trackWidth);
          const nextEndPx = Math.max(minEndPx, Math.min(trackWidth, endPx + gestureState.dx));
          onEndChange(pxToMs(nextEndPx));
        },
      }),
    [endPx, minGapPx, onEndChange, pxToMs, startPx, trackWidth]
  );

  const isPreviewWithinSelection = previewPositionMs >= clampedStartMs && previewPositionMs <= clampedEndMs;

  return (
    <View style={styles.audioPortionRangeSelector} onLayout={onTrackLayout}>
      <View style={[styles.audioPortionRangeTrack, { backgroundColor: trackColor }]} />
      <View
        style={[
          styles.audioPortionRangeSelection,
          {
            left: startPx,
            width: Math.max(endPx - startPx, 0),
            backgroundColor: selectionColor,
          },
        ]}
      />

      <View style={styles.audioPortionWaveRow}>
        {waveformSamples.map((sample, index) => {
          const segmentCenter = trackWidth * (index / Math.max(waveformSamples.length - 1, 1));
          const isSelected = segmentCenter >= startPx && segmentCenter <= endPx;
          const isPlayed = isPreviewWithinSelection && segmentCenter >= startPx && segmentCenter <= previewPx;

          return (
            <View
              key={`wave-${index}`}
              style={[
                styles.audioPortionWaveBar,
                {
                  height: sample,
                  backgroundColor: isPlayed ? playedWaveColor : isSelected ? selectedWaveColor : waveColor,
                },
              ]}
            />
          );
        })}
      </View>

      {isPreviewWithinSelection ? (
        <View
          pointerEvents="none"
          style={[
            styles.audioPortionPreviewNeedle,
            { left: previewPx, backgroundColor: playedWaveColor },
          ]}
        />
      ) : null}

      <View
        style={[
          styles.audioPortionHandle,
          styles.audioPortionHandleStart,
          {
            left: startPx - AUDIO_PORTION_HANDLE_WIDTH / 2,
            backgroundColor: handleColor,
          },
        ]}
        {...startHandleResponder.panHandlers}
      >
        <View style={styles.audioPortionHandleGrip} />
      </View>

      <View
        style={[
          styles.audioPortionHandle,
          styles.audioPortionHandleEnd,
          {
            left: endPx - AUDIO_PORTION_HANDLE_WIDTH / 2,
            backgroundColor: handleColor,
          },
        ]}
        {...endHandleResponder.panHandlers}
      >
        <View style={styles.audioPortionHandleGrip} />
      </View>
    </View>
  );
}

function VerseImageSharePreview({
  previewRef,
  backgroundSource,
  referenceLabel,
  selectedText,
}: VerseImageSharePreviewProps) {
  const { colors, isDark } = useTheme();
  const verseText = selectedText.trim();
  const verseFontSize = verseText.length > 220 ? 19 : verseText.length > 140 ? 21 : 23;
  const referenceFontSize = verseText.length > 220 ? 13 : 14;
  const gradientColors: [string, string] = isDark
    ? ['rgba(12, 11, 9, 0.12)', 'rgba(12, 11, 9, 0.74)']
    : ['rgba(245, 240, 232, 0.08)', 'rgba(245, 240, 232, 0.6)'];

  return (
    <View ref={previewRef} collapsable={false} style={styles.verseImagePreviewFrame}>
      <ImageBackground
        source={backgroundSource}
        style={styles.verseImagePreviewBackground}
        imageStyle={styles.verseImagePreviewImage}
        resizeMode="cover"
      >
        <LinearGradient
          pointerEvents="none"
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.verseImagePreviewOverlay}
        />
        <View style={styles.verseImagePreviewContent}>
          <Text
            style={[
              styles.verseImagePreviewText,
              {
                color: colors.biblePrimaryText,
                fontSize: verseFontSize,
                lineHeight: Math.round(verseFontSize * 1.38),
              },
            ]}
            numberOfLines={8}
            adjustsFontSizeToFit
            minimumFontScale={0.64}
          >
            {`"${verseText || referenceLabel}"`}
          </Text>
          <Text
            style={[
              styles.verseImagePreviewReference,
              {
                color: colors.accentGreen,
                fontSize: referenceFontSize,
                lineHeight: Math.round(referenceFontSize * 1.4),
              },
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {referenceLabel}
          </Text>
        </View>
      </ImageBackground>
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
  const { t, i18n } = useTranslation();
  const safeInsets = useSafeAreaInsets();
  const autoplayKeyRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const previousActiveAudioBookIdRef = useRef<string | null>(null);
  const previousActiveAudioChapterRef = useRef<number | null>(null);
  const scrollViewRef = useRef<Animated.ScrollView | null>(null);
  const followAlongScrollViewRef = useRef<ScrollView | null>(null);
  const verseImageSharePreviewRef = useRef<View | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const followAlongOffsetsRef = useRef<Record<number, number>>({});
  // Monotonic follow-along: verse index only advances forward, never retreats.
  // Prevents highlight flickering caused by interpolated position noise.
  const lastFollowAlongVerseRef = useRef<number | null>(null);
  const scrollY = useSharedValue(0);

  const [verses, setVerses] = useState<Verse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFontSizeSheet, setShowFontSizeSheet] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [showFollowAlongText, setShowFollowAlongText] = useState(false);
  const [chapterTimestamps, setChapterTimestamps] = useState<VerseTimestamps | null>(null);
  const [showChapterActionsSheet, setShowChapterActionsSheet] = useState(false);
  const [showChapterAudioShareSheet, setShowChapterAudioShareSheet] = useState(false);
  const [pendingChapterAudioShareAction, setPendingChapterAudioShareAction] = useState<
    'full' | 'portion' | null
  >(null);
  const [audioPortionShareDraft, setAudioPortionShareDraft] = useState<AudioPortionShareDraft | null>(
    null
  );
  const [audioPortionStartMs, setAudioPortionStartMs] = useState(0);
  const [audioPortionEndMs, setAudioPortionEndMs] = useState(0);
  const [isSharingAudioPortion, setIsSharingAudioPortion] = useState(false);
  const [isPreviewingAudioPortion, setIsPreviewingAudioPortion] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showVerseImageSheet, setShowVerseImageSheet] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<'up' | 'down' | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isSharingVerseImage, setIsSharingVerseImage] = useState(false);
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null);
  const [chapterSessionMode, setChapterSessionMode] = useState<'listen' | 'read'>('read');
  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [selectedVerseImageBackgroundIndex, setSelectedVerseImageBackgroundIndex] = useState(() =>
    getHomeVerseBackgroundIndex(new Date(), HOME_VERSE_BACKGROUND_SOURCES.length)
  );
  const lastStableSessionModeRef = useRef(chapterSessionMode);
  const scrollDragStartOffsetYRef = useRef(0);
  const readerTabBarVisibleShared = useSharedValue(true);
  const readerTabBarRevealPendingShared = useSharedValue(false);
  const readerLastScrollOffsetYShared = useSharedValue(0);
  const setReaderTabBarVisible = useBibleStore((state) => state.setReaderTabBarVisible);

  const syncRootTabBarVisibility = useCallback(
    (nextVisible: boolean, reason: string) => {
      readerTabBarVisibleShared.value = nextVisible;
      if (nextVisible) {
        readerTabBarRevealPendingShared.value = false;
      }

      if (__DEV__) {
        console.log('[BibleReader] root tab bar visibility', {
          nextVisible,
          reason,
          sessionMode: chapterSessionMode,
        });
      }

      setReaderTabBarVisible(nextVisible);
      navigation.setParams({ tabBarVisible: nextVisible });
    },
    [
      chapterSessionMode,
      navigation,
      readerTabBarRevealPendingShared,
      readerTabBarVisibleShared,
      setReaderTabBarVisible,
    ]
  );

  const hideRootTabBarForReaderScroll = useCallback(
    (reason: string) => {
      if (chapterSessionMode !== 'read' || !readerTabBarVisibleShared.value) {
        return;
      }

      readerTabBarVisibleShared.value = false;
      readerTabBarRevealPendingShared.value = false;
      syncRootTabBarVisibility(false, reason);
    },
    [
      chapterSessionMode,
      readerTabBarRevealPendingShared,
      readerTabBarVisibleShared,
      syncRootTabBarVisibility,
    ]
  );

  useEffect(() => {
    readerTabBarVisibleShared.value = true;
    readerTabBarRevealPendingShared.value = false;
    readerLastScrollOffsetYShared.value = 0;
    syncRootTabBarVisibility(
      getNextBibleTabBarVisibility({
        sessionMode: chapterSessionMode,
        action: 'enter',
      }),
      'enter'
    );
    scrollDragStartOffsetYRef.current = 0;
  }, [
    bookId,
    chapter,
    chapterSessionMode,
    readerLastScrollOffsetYShared,
    readerTabBarRevealPendingShared,
    readerTabBarVisibleShared,
    syncRootTabBarVisibility,
  ]);

  const handleReaderScrollBeginDrag = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollDragStartOffsetYRef.current = event.nativeEvent.contentOffset.y;
      if (chapterSessionMode !== 'read') {
        return;
      }

      hideRootTabBarForReaderScroll('scrollStart');
    },
    [chapterSessionMode, hideRootTabBarForReaderScroll]
  );

  const handleReaderScrollEndDrag = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number }; velocity?: { y: number } } }) => {
      if (chapterSessionMode !== 'read') {
        return;
      }

      const currentScrollOffsetY = event.nativeEvent.contentOffset.y;
      const velocityY = event.nativeEvent.velocity?.y ?? 0;
      const shouldShowAtTop = getNextBibleTabBarVisibility({
        sessionMode: chapterSessionMode,
        action: 'scrollEndDrag',
        previousScrollOffsetY: scrollDragStartOffsetYRef.current,
        currentScrollOffsetY,
        velocityY,
      });

      if (shouldShowAtTop) {
        syncRootTabBarVisibility(true, 'scrollEndDrag');
        return;
      }

      readerTabBarRevealPendingShared.value =
        currentScrollOffsetY < scrollDragStartOffsetYRef.current &&
        Math.abs(velocityY) >= SWIPE_VELOCITY_MIN;
    },
    [
      chapterSessionMode,
      readerTabBarRevealPendingShared,
      syncRootTabBarVisibility,
    ]
  );

  const handleReaderMomentumScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (chapterSessionMode !== 'read') {
        return;
      }

      if (!readerTabBarRevealPendingShared.value || event.nativeEvent.contentOffset.y > 0) {
        return;
      }

      syncRootTabBarVisibility(true, 'momentumEnd');
    },
    [
      chapterSessionMode,
      readerTabBarRevealPendingShared,
      syncRootTabBarVisibility,
    ]
  );

  const verseImageBackgroundCount = HOME_VERSE_BACKGROUND_SOURCES.length;
  const selectedVerseImageBackground =
    HOME_VERSE_BACKGROUND_SOURCES[
      verseImageBackgroundCount > 0
        ? selectedVerseImageBackgroundIndex % verseImageBackgroundCount
        : 0
    ] ?? HOME_VERSE_BACKGROUND_SOURCES[0];
  const dismissSelectedVerseSelection = () => {
    setShowVerseImageSheet(false);
    setSelectedVerses([]);
  };

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasLiveAuthSession = useAuthStore((state) => state.session !== null);
  const hasStoredAuthSession = isAuthenticated || hasLiveAuthSession;
  const [hasRestoredAuthSession, setHasRestoredAuthSession] = useState(hasStoredAuthSession);
  const chapterFeedbackEnabled = useAuthStore((state) => state.preferences.chapterFeedbackEnabled);
  const chapterFeedbackName = useAuthStore((state) => state.preferences.chapterFeedbackName);
  const chapterFeedbackRole = useAuthStore((state) => state.preferences.chapterFeedbackRole);
  const contentLanguageCode = useAuthStore((state) => state.preferences.contentLanguageCode);
  const contentLanguageName = useAuthStore((state) => state.preferences.contentLanguageName);
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
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
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
  const translationShareLabel =
    getBibleSelectionShareTranslationLabel({
      translationName: currentTranslationInfo?.name,
      translationAbbreviation: currentTranslationInfo?.abbreviation,
      translationLanguage: currentTranslationInfo?.language,
    }) || translationLabel;
  const chapterShareTitle = `${getTranslatedBookName(bookId, t)} ${chapter}`;
  const chapterAudioShareRootUri = `${
    FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? 'file:///'
  }everybible-audio-share/`;
  const chapterAudioShareActionLabel =
    pendingChapterAudioShareAction === 'portion'
      ? t('bible.shareAudioPortion')
      : t('bible.shareChapterAudio');
  const audioPortionRangeDurationMs = Math.max(audioPortionEndMs - audioPortionStartMs, 0);
  const savedChapterFeedbackIdentity = normalizeChapterFeedbackIdentity({
    name: chapterFeedbackName ?? '',
    role: chapterFeedbackRole ?? '',
  });
  const canSubmitFeedback = shouldEnableChapterFeedbackSubmit({
    sentiment: feedbackSentiment,
    isSubmitting: isSubmittingFeedback,
  }) && savedChapterFeedbackIdentity != null;
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
  const hasReaderAuthSession = hasStoredAuthSession || hasRestoredAuthSession;
  const showInlineChapterFeedbackComposer =
    config.features.chapterFeedbackInlineComposer &&
    chapterFeedbackEnabled &&
    hasReaderAuthSession &&
    savedChapterFeedbackIdentity != null &&
    showMinimalListenChrome;
  const selectedVerseReferenceLabel =
    selectedVerses.length > 0
      ? formatBibleSelectionReference({
          bookName: getTranslatedBookName(bookId, t),
          chapter,
          verses: selectedVerses,
          translationLabel: translationShareLabel,
        })
      : '';
  const selectedVerseText =
    selectedVerses.length > 0 ? extractBibleSelectionText(verses, selectedVerses) : '';
  const selectedVerseShareText =
    selectedVerses.length > 0
      ? buildBibleSelectionShareText({
          referenceLabel: selectedVerseReferenceLabel,
          selectedText: selectedVerseText,
        })
      : '';
  const selectedVerseRanges =
    selectedVerses.length > 0 ? buildBibleSelectionVerseRanges(selectedVerses) : [];
  const getAnnotationVerseEnd = (annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>) =>
    annotation.verse_end ?? annotation.verse_start;
  const annotationOverlapsVerse = (
    annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>,
    verse: number
  ) => verse >= annotation.verse_start && verse <= getAnnotationVerseEnd(annotation);
  const annotationOverlapsSelectionRange = (
    annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>,
    range: (typeof selectedVerseRanges)[number]
  ) =>
    annotation.verse_start <= range.verse_end &&
    getAnnotationVerseEnd(annotation) >= range.verse_start;
  const selectedVerseDecorationStyle = {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: colors.bibleAccent,
  } as const;
  const selectedVerseSet = new Set(selectedVerses);
  const selectedVerseAnnotations = selectedVerseRanges.length > 0
    ? annotations.filter(
        (annotation) =>
          annotation.deleted_at == null &&
          selectedVerseRanges.some((range) => annotationOverlapsSelectionRange(annotation, range))
      )
    : [];
  const selectedHighlightAnnotations = selectedVerseAnnotations.filter(
    (annotation) => annotation.type === 'highlight'
  );
  const selectedHighlightColors = Array.from(
    new Set(
      selectedHighlightAnnotations
        .map((annotation) => annotation.color)
        .filter((color): color is string => typeof color === 'string' && color.trim().length > 0)
    )
  );
  const selectedNoteAnnotation = selectedVerseAnnotations.find(
    (annotation) => annotation.type === 'note'
  );
  const rawFollowAlongVerse = getEstimatedFollowAlongVerse({
    verses,
    currentPosition,
    duration,
    fallbackVerse: focusVerse,
    timestamps: chapterTimestamps,
  });
  // Clamp to monotonic advancement: never let the highlight go backward.
  // This prevents flickering when interpolated position briefly overshoots
  // a verse boundary and snaps back on the next real poll.
  // Reset when the chapter changes (lastFollowAlongVerseRef is cleared in the
  // chapter-change useEffect below via followAlongOffsetsRef reset).
  const activeFollowAlongVerse = (() => {
    if (rawFollowAlongVerse == null) {
      lastFollowAlongVerseRef.current = null;
      return null;
    }
    const last = lastFollowAlongVerseRef.current;
    const next = last != null && rawFollowAlongVerse < last ? last : rawFollowAlongVerse;
    lastFollowAlongVerseRef.current = next;
    return next;
  })();
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
  const firstHeadingVerseId = verses.find((verse) => verse.heading?.trim())?.id ?? null;
  const premiumTopInset = 12;
  const premiumBottomInset = 18;
  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        'worklet';
        const offsetY = event.contentOffset.y;
        const velocityY = event.velocity?.y ?? 0;
        const offsetDelta = offsetY - readerLastScrollOffsetYShared.value;
        scrollY.value = offsetY;

        if (chapterSessionMode !== 'read') {
          readerLastScrollOffsetYShared.value = offsetY;
          return;
        }

        if (offsetY > 0 && readerTabBarVisibleShared.value) {
          runOnJS(hideRootTabBarForReaderScroll)('scrollMove');
        }

        if (
          offsetY > 0 &&
          offsetDelta < 0 &&
          (Math.abs(velocityY) >= SWIPE_VELOCITY_MIN || Math.abs(offsetDelta) >= 16)
        ) {
          readerTabBarRevealPendingShared.value = true;
        }

        if (offsetY <= 0 && readerTabBarRevealPendingShared.value) {
          readerTabBarRevealPendingShared.value = false;
          runOnJS(syncRootTabBarVisibility)(true, 'scrollTop');
        }

        readerLastScrollOffsetYShared.value = offsetY;
      },
    },
    [
      chapterSessionMode,
      hideRootTabBarForReaderScroll,
      readerLastScrollOffsetYShared,
      readerTabBarRevealPendingShared,
      readerTabBarVisibleShared,
      syncRootTabBarVisibility,
    ]
  );

  const topChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, READER_TOP_CHROME_DISMISS_DISTANCE * 0.7, READER_TOP_CHROME_DISMISS_DISTANCE],
      [1, 0.88, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, READER_TOP_CHROME_DISMISS_DISTANCE],
          [0, -36],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const swipeX = useSharedValue(0);
  const swipeInFlightRef = useRef(false);

  const handleSwipeNavigation = (direction: 'next' | 'prev') => {
    if (swipeInFlightRef.current) return;
    swipeInFlightRef.current = true;

    if (direction === 'next') {
      void handleNextReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    } else {
      void handlePreviousReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    }
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      swipeX.value = event.translationX;
    })
    .onEnd((event) => {
      'worklet';
      const wantsNext =
        event.translationX < -SWIPE_THRESHOLD || event.velocityX < -SWIPE_VELOCITY_MIN;
      const wantsPrev =
        event.translationX > SWIPE_THRESHOLD || event.velocityX > SWIPE_VELOCITY_MIN;
      if (wantsNext && hasNextChapter) runOnJS(handleSwipeNavigation)('next');
      else if (wantsPrev && hasPrevChapter) runOnJS(handleSwipeNavigation)('prev');
      swipeX.value = withSpring(0, { damping: 30, stiffness: 300 });
    });
  const readerNativeScrollGesture = Gesture.Native().shouldActivateOnStart(true);
  swipeGesture.simultaneousWithExternalGesture(readerNativeScrollGesture);

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

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
    setSelectedVerses([]);
    // Reset monotonic follow-along state on chapter change
    lastFollowAlongVerseRef.current = null;
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
    const nextSessionMode = getInitialChapterSessionMode({
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
    });

    setShowFollowAlongText((current) =>
      getNextFollowAlongVisibility({
        currentlyVisible: current,
        nextSessionMode,
        hasText: verses.length > 0,
      })
    );
    setChapterSessionMode(nextSessionMode);
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

  // Fetch verse timestamps when Follow Along opens; clear when chapter changes.
  useEffect(() => {
    if (!showFollowAlongText) return;

    let isCancelled = false;
    setChapterTimestamps(null);

    void import('../../services/bible/verseTimestamps')
      .then(({ getChapterTimestamps }) =>
        getChapterTimestamps(currentTranslation, bookId, chapter)
      )
      .then((timestamps) => {
        if (!isCancelled) {
          setChapterTimestamps(timestamps);
        }
      })
      .catch((timestampsError) => {
        if (!isCancelled) {
          console.error('Error loading verse timestamps:', timestampsError);
          setChapterTimestamps(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [showFollowAlongText, currentTranslation, bookId, chapter]);

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

    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: activeAudioBookId ?? bookId,
        chapter: activeAudioChapter,
        preferredMode: chapterSessionMode,
      })
    );
  }, [
    audioEnabled,
    activeAudioBookId,
    activeAudioChapter,
    bookId,
    chapter,
    chapterSessionMode,
    navigation,
  ]);

  useEffect(() => {
    setHasRestoredAuthSession(hasStoredAuthSession);
  }, [hasStoredAuthSession]);

  useEffect(() => {
    if (hasStoredAuthSession) {
      return;
    }

    let isCancelled = false;

    void getCurrentSession().then(({ session }) => {
      if (!isCancelled) {
        setHasRestoredAuthSession(session !== null);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [hasStoredAuthSession]);

  useEffect(() => {
    const loadAnnotations = async () => {
      const result = await getAnnotationsForChapter(bookId, chapter);
      if (result.success && result.data) {
        setAnnotations(result.data);
      }
    };
    void loadAnnotations();
  }, [bookId, chapter]);

  useEffect(() => {
    if (!isPreviewingAudioPortion || !audioPortionShareDraft || !isCurrentAudioChapter) {
      return;
    }

    if (status !== 'playing') {
      setIsPreviewingAudioPortion(false);
      return;
    }

    if (currentPosition < audioPortionEndMs) {
      return;
    }

    void togglePlayPause();
    void seekTo(audioPortionStartMs);
    setIsPreviewingAudioPortion(false);
  }, [
    audioPortionEndMs,
    audioPortionShareDraft,
    audioPortionStartMs,
    currentPosition,
    isCurrentAudioChapter,
    isPreviewingAudioPortion,
    seekTo,
    status,
    togglePlayPause,
  ]);

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
    previousSequenceEntry ?? getAdjacentBibleChapter(bookId, chapter, -1);
  const nextNavigationTarget = nextSequenceEntry ?? getAdjacentBibleChapter(bookId, chapter, 1);
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
  const handleCloseFontSizeSheet = () => {
    setShowFontSizeSheet(false);
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

  const handleOpenBookPicker = () => {
    navigation.push('BiblePicker', {
      initialBookId: bookId,
    });
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
    navigation.setParams({ preferredMode: nextMode, autoplayAudio: false });
    if (nextMode === 'listen') {
      dismissSelectedVerseSelection();
    }
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
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
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

    // Cloud translation that hasn't been downloaded yet — offer to download it
    if (translation.installState === 'remote-only' || translation.source === 'runtime') {
      Alert.alert(
        translation.name,
        t('translations.downloadPrompt', { name: translation.name, size: translation.sizeInMB }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('translations.download'),
            onPress: () => {
              void downloadTranslation(translation.id).catch((error) => {
                Alert.alert(
                  t('common.error'),
                  error instanceof Error ? error.message : t('bible.failedToLoad'),
                  [{ text: t('common.ok') }]
                );
              });
            },
          },
        ]
      );
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
    const bookName = getTranslatedBookName(bookId, t);
    const url = buildBibleDeepLink(bookId, chapter);
    const text = `${bookName} ${chapter}`;
    await Share.share(
      Platform.OS === 'android'
        ? { message: url ? `${text}\n${url}` : text }
        : { message: text, url }
    );
  };

  const handleOpenChapterAudioShareSheet = () => {
    setShowChapterActionsSheet(false);
    setShowChapterAudioShareSheet(true);
  };

  const waitForChapterAudioShareSheetDismissal = async () => {
    await new Promise<void>((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };
      // Guard against long-running interaction handles that can block runAfterInteractions forever.
      const timeoutId = setTimeout(complete, 300);
      InteractionManager.runAfterInteractions(complete);
    });
  };

  const handleShareFullChapterAudio = async () => {
    if (pendingChapterAudioShareAction) {
      return;
    }

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('full');

    try {
      await waitForChapterAudioShareSheetDismissal();

      const audioShareAsset = await prepareChapterAudioShareAsset({
        translationId: currentTranslation,
        bookId,
        chapter,
        fileSystem: expoAudioFileSystemAdapter,
        rootUri: chapterAudioShareRootUri,
        resolveDownloadedAudioUri: (translationId, bookId, chapter) =>
          getDownloadedChapterAudioUri(
            translationId,
            bookId,
            chapter,
            expoAudioFileSystemAdapter,
            AUDIO_DOWNLOAD_ROOT_URI
          ),
        resolveRemoteAudio: fetchRemoteChapterAudio,
      });

      if (!audioShareAsset) {
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        mode: 'listen',
        translationId: currentTranslation,
        detail: 'share-audio-full',
      });

      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        setPendingChapterAudioShareAction(null);
        await Sharing.shareAsync(audioShareAsset.uri, {
          dialogTitle: t('groups.share'),
          mimeType: audioShareAsset.mimeType,
          UTI: 'public.audio',
        });
        return;
      }

      const url = buildBibleDeepLink(bookId, chapter);
      setPendingChapterAudioShareAction(null);
      await Share.share(
        Platform.OS === 'android'
          ? { message: url ? `${chapterShareTitle}\n${url}` : chapterShareTitle }
          : { message: chapterShareTitle, url }
      );
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setPendingChapterAudioShareAction(null);
    }
  };

  const handleShareAudioPortion = async () => {
    if (pendingChapterAudioShareAction) {
      return;
    }

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('portion');

    try {
      await waitForChapterAudioShareSheetDismissal();

      const audioShareAsset = await prepareChapterAudioShareAsset({
        translationId: currentTranslation,
        bookId,
        chapter,
        fileSystem: expoAudioFileSystemAdapter,
        rootUri: chapterAudioShareRootUri,
        resolveDownloadedAudioUri: (translationId, bookId, chapter) =>
          getDownloadedChapterAudioUri(
            translationId,
            bookId,
            chapter,
            expoAudioFileSystemAdapter,
            AUDIO_DOWNLOAD_ROOT_URI
          ),
        resolveRemoteAudio: fetchRemoteChapterAudio,
      });

      if (!audioShareAsset) {
        setPendingChapterAudioShareAction(null);
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        mode: 'listen',
        translationId: currentTranslation,
        detail: 'share-audio-clip',
      });

      const validateTrimMediaFile =
        typeof isValidTrimMediaFile === 'function'
          ? isValidTrimMediaFile
          : typeof (VideoTrimModule as { isValidFile?: (url: string) => Promise<unknown> })
                .isValidFile === 'function'
            ? (VideoTrimModule as { isValidFile: (url: string) => Promise<unknown> }).isValidFile
            : null;

      const validationResult = validateTrimMediaFile
        ? await validateTrimMediaFile(audioShareAsset.uri)
        : null;
      const isValidAudioFile =
        validationResult == null ||
        typeof validationResult === 'boolean'
          ? validationResult !== false
          : (validationResult as { isValid?: boolean } | null | undefined)?.isValid === true;
      if (!isValidAudioFile) {
        setPendingChapterAudioShareAction(null);
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      const validatedDurationMs =
        validationResult != null && typeof validationResult !== 'boolean'
          ? (validationResult as { duration?: number } | null | undefined)?.duration
          : null;
      const fallbackDurationMs = isCurrentAudioChapter && duration > 0 ? Math.round(duration) : 0;
      const resolvedDurationMs = Math.max(validatedDurationMs ?? fallbackDurationMs, AUDIO_PORTION_MIN_DURATION_MS);
      const initialStartMs = Math.max(
        0,
        Math.min(
          isCurrentAudioChapter ? currentPosition : 0,
          resolvedDurationMs - AUDIO_PORTION_MIN_DURATION_MS
        )
      );
      const initialEndMs = Math.min(
        resolvedDurationMs,
        Math.max(initialStartMs + AUDIO_PORTION_MIN_DURATION_MS, initialStartMs + AUDIO_PORTION_DEFAULT_DURATION_MS)
      );

      setAudioPortionShareDraft({
        sourceUri: audioShareAsset.uri,
        fileExtension: audioShareAsset.fileExtension,
        mimeType: audioShareAsset.mimeType,
        durationMs: resolvedDurationMs,
      });
      setAudioPortionStartMs(initialStartMs);
      setAudioPortionEndMs(initialEndMs);
      setPendingChapterAudioShareAction(null);
    } catch (shareError) {
      setPendingChapterAudioShareAction(null);
      const message = shareError instanceof Error ? shareError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    }
  };

  const handleCloseAudioPortionSheet = () => {
    if (isSharingAudioPortion) {
      return;
    }

    if (isPreviewingAudioPortion && isCurrentAudioChapter && status === 'playing') {
      void togglePlayPause();
    }

    setIsPreviewingAudioPortion(false);
    setAudioPortionShareDraft(null);
    setAudioPortionStartMs(0);
    setAudioPortionEndMs(0);
  };

  const handleAudioPortionStartSeek = (nextStartMs: number) => {
    if (!audioPortionShareDraft) {
      return;
    }

    const clampedStartMs = Math.max(0, Math.min(nextStartMs, audioPortionShareDraft.durationMs));
    const maxStartMs = Math.max(audioPortionEndMs - AUDIO_PORTION_MIN_DURATION_MS, 0);
    setAudioPortionStartMs(Math.min(clampedStartMs, maxStartMs));
  };

  const handleAudioPortionEndSeek = (nextEndMs: number) => {
    if (!audioPortionShareDraft) {
      return;
    }

    const clampedEndMs = Math.max(0, Math.min(nextEndMs, audioPortionShareDraft.durationMs));
    const minEndMs = Math.min(
      audioPortionShareDraft.durationMs,
      audioPortionStartMs + AUDIO_PORTION_MIN_DURATION_MS
    );
    setAudioPortionEndMs(Math.max(clampedEndMs, minEndMs));
  };

  const handleToggleAudioPortionPreview = () => {
    if (!audioPortionShareDraft || !isCurrentAudioChapter || duration <= 0) {
      return;
    }

    if (isPreviewingAudioPortion) {
      if (status === 'playing') {
        void togglePlayPause();
      }
      setIsPreviewingAudioPortion(false);
      return;
    }

    const nextStartMs = Math.max(0, Math.min(audioPortionStartMs, duration));
    lastFollowAlongVerseRef.current = null;
    void seekTo(nextStartMs);
    if (status !== 'playing') {
      void togglePlayPause();
    }
    setIsPreviewingAudioPortion(true);
  };

  const handleConfirmAudioPortionShare = async () => {
    if (!audioPortionShareDraft || isSharingAudioPortion) {
      return;
    }

    if (isPreviewingAudioPortion && isCurrentAudioChapter && status === 'playing') {
      void togglePlayPause();
    }
    setIsPreviewingAudioPortion(false);

    const startTime = Math.max(0, Math.round(audioPortionStartMs));
    const endTime = Math.max(startTime + AUDIO_PORTION_MIN_DURATION_MS, Math.round(audioPortionEndMs));
    if (endTime > audioPortionShareDraft.durationMs) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    const trimMediaFile =
      typeof trimAudioMedia === 'function'
        ? trimAudioMedia
        : typeof (VideoTrimModule as {
              trim?: (url: string, options: unknown) => Promise<unknown>;
            }).trim === 'function'
          ? (VideoTrimModule as {
              trim: (url: string, options: unknown) => Promise<unknown>;
            }).trim
          : null;
    if (!trimMediaFile) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    setIsSharingAudioPortion(true);
    try {
      const trimResult = await trimMediaFile(audioPortionShareDraft.sourceUri, {
        type: 'audio',
        outputExt: audioPortionShareDraft.fileExtension,
        startTime,
        endTime,
        saveToPhoto: false,
        removeAfterSavedToPhoto: false,
        removeAfterFailedToSavePhoto: false,
        enableRotation: false,
        rotationAngle: 0,
      });

      const trimOutputPath =
        typeof trimResult === 'string'
          ? trimResult
          : (trimResult as { outputPath?: string; success?: boolean } | null | undefined)?.outputPath;
      const trimSucceeded =
        typeof trimResult === 'string'
          ? trimResult.length > 0
          : (trimResult as { success?: boolean } | null | undefined)?.success !== false;

      if (!trimSucceeded || !trimOutputPath) {
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      const trimOutputUri = trimOutputPath.startsWith('file://')
        ? trimOutputPath
        : `file://${trimOutputPath}`;
      handleCloseAudioPortionSheet();

      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(trimOutputUri, {
          dialogTitle: t('groups.share'),
          mimeType: audioPortionShareDraft.mimeType,
          UTI: 'public.audio',
        });
      } else {
        const url = buildBibleDeepLink(bookId, chapter);
        await Share.share(
          Platform.OS === 'android'
            ? { message: url ? `${chapterShareTitle}\n${url}` : chapterShareTitle }
            : { message: chapterShareTitle, url }
        );
      }
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setIsSharingAudioPortion(false);
    }
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
    setPreferredChapterLaunchMode('read');
    navigation.setParams({ preferredMode: 'read', autoplayAudio: false });
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

  const resetFeedbackDraft = () => {
    setFeedbackSentiment(null);
    setFeedbackComment('');
    setFeedbackSubmitError(null);
  };

  const handleCloseFeedbackModal = () => {
    if (isSubmittingFeedback) {
      return;
    }

    setShowFeedbackModal(false);
    resetFeedbackDraft();
  };

  const handleOpenChapterFeedback = () => {
    setShowChapterActionsSheet(false);

    if (!hasReaderAuthSession) {
      Alert.alert(t('common.error'), t('bible.chapterFeedbackSignInRequired'));
      return;
    }

    trackBibleExperienceEvent({
      name: 'chapter_feedback_opened',
      translationId: currentTranslation,
      bookId,
      chapter,
      source: 'reader-feedback',
    });
    setFeedbackSubmitError(null);
    setShowFeedbackModal(true);
  };

  const handleSubmitChapterFeedback = async (sourceScreen: ChapterFeedbackSourceScreen) => {
    if (!feedbackSentiment || isSubmittingFeedback) {
      return;
    }

    if (!hasReaderAuthSession) {
      setFeedbackSubmitError(t('bible.chapterFeedbackSignInRequired'));
      return;
    }

    if (!savedChapterFeedbackIdentity) {
      setFeedbackSubmitError(t('settings.chapterFeedbackIdentityRequired'));
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackSubmitError(null);

    const result = await submitChapterFeedback({
      translationId: currentTranslation,
      translationLanguage: currentTranslationInfo?.language ?? translationLabel,
      bookId,
      chapter,
      sentiment: feedbackSentiment,
      comment: normalizeChapterFeedbackComment(feedbackComment),
      interfaceLanguage: i18n.resolvedLanguage ?? i18n.language ?? 'en',
      contentLanguageCode,
      contentLanguageName,
      participantName: savedChapterFeedbackIdentity.name,
      participantRole: savedChapterFeedbackIdentity.role,
      sourceScreen,
      appPlatform: Platform.OS,
      appVersion: config.version,
    });

    setIsSubmittingFeedback(false);

    if (result.success) {
      const resultVariant = getChapterFeedbackResultVariant(result);

      if (sourceScreen === 'reader') {
        setShowFeedbackModal(false);
      }
      resetFeedbackDraft();

      Alert.alert(
        t('common.ok'),
        resultVariant === 'saved-not-exported'
          ? t('bible.chapterFeedbackSavedFallback')
          : t('bible.chapterFeedbackSuccess')
      );
      return;
    }

    setFeedbackSubmitError(result.error ?? t('common.unexpectedError'));
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

    // Allow the verse highlight to jump backward after a user seek
    lastFollowAlongVerseRef.current = null;
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

  const handleReadChapterNavigation = async (
    target: { bookId: string; chapter: number } | null
  ) => {
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

  const handleCopySelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Clipboard.setStringAsync(selectedVerseShareText);
    selectionHaptic();
  };

  const handleCloseSelectedVerses = () => {
    dismissSelectedVerseSelection();
  };

  const handleShareSelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Share.share({ message: selectedVerseShareText });
  };

  const handleOpenVerseImageShare = () => {
    if (!selectedVerseShareText) {
      return;
    }

    setShowVerseImageSheet(true);
  };

  const handleSelectVerseImageBackground = (backgroundIndex: number) => {
    setSelectedVerseImageBackgroundIndex(backgroundIndex);
  };

  const handleShareSelectedVerseImage = async () => {
    if (!selectedVerseShareText || isSharingVerseImage) {
      return;
    }

    setIsSharingVerseImage(true);

    try {
      const Sharing = await import('expo-sharing');

      if (await Sharing.isAvailableAsync()) {
        if (verseImageSharePreviewRef.current) {
          const { captureRef } = await import('react-native-view-shot');
          const imageUri = await captureRef(verseImageSharePreviewRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });

          setShowVerseImageSheet(false);

          await Sharing.shareAsync(imageUri, {
            dialogTitle: t('groups.share'),
            mimeType: 'image/png',
          });
          return;
        }
      }

      setShowVerseImageSheet(false);
      await Share.share({ message: selectedVerseShareText });
    } catch {
      try {
        setShowVerseImageSheet(false);
        await Share.share({ message: selectedVerseShareText });
      } catch {
        // Ignore share errors.
      }
    } finally {
      setIsSharingVerseImage(false);
    }
  };

  const handleHighlightSelectedVerses = async (color: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    for (const range of selectedVerseRanges) {
      const existing = annotations.find(
        (annotation) =>
          annotation.type === 'highlight' &&
          !annotation.deleted_at &&
          annotation.verse_start === range.verse_start &&
          getAnnotationVerseEnd(annotation) === range.verse_end
      );

      const result = await upsertAnnotation({
        id: existing?.id ?? Math.random().toString(36).slice(2),
        book: bookId,
        chapter,
        verse_start: range.verse_start,
        verse_end: range.verse_start === range.verse_end ? null : range.verse_end,
        type: 'highlight',
        color,
        content: null,
        deleted_at: null,
      });
      if (!result.success) {
        Alert.alert(t('common.error'), result.error ?? t('common.unexpectedError'));
        return;
      }
    }

    await reloadAnnotations();
    setSelectedVerses([]);
  };

  const handleNoteSelectedVerses = async (text: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    for (const range of selectedVerseRanges) {
      const existing = annotations.find(
        (annotation) =>
          annotation.type === 'note' &&
          !annotation.deleted_at &&
          annotation.verse_start === range.verse_start &&
          getAnnotationVerseEnd(annotation) === range.verse_end
      );

      const result = await upsertAnnotation({
        id: existing?.id ?? Math.random().toString(36).slice(2),
        book: bookId,
        chapter,
        verse_start: range.verse_start,
        verse_end: range.verse_start === range.verse_end ? null : range.verse_end,
        type: 'note',
        color: null,
        content: text,
        deleted_at: null,
      });
      if (!result.success) {
        Alert.alert(t('common.error'), result.error ?? t('common.unexpectedError'));
        return;
      }
    }

    await reloadAnnotations();
  };

  const handleRemoveHighlightSelectedVerses = async (color: string) => {
    const annotationsToRemove = selectedHighlightAnnotations.filter(
      (annotation) => annotation.color === color
    );

    if (annotationsToRemove.length === 0) {
      return;
    }

    for (const annotation of annotationsToRemove) {
      const result = await softDeleteAnnotation(annotation.id);
      if (!result.success) {
        Alert.alert(t('common.error'), result.error ?? t('common.unexpectedError'));
        return;
      }
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

        <View style={styles.listenMetaRow}>
          <View style={styles.listenMetaBlock}>
            <Text style={[styles.listenChapterTitle, { color: colors.biblePrimaryText }]}>
              {getTranslatedBookName(bookId, t)} {chapter}
            </Text>
          </View>
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
                ? `${getTranslatedBookName(bookId, t)} ${chapter}:${highlightedVerse}`
                : `${getTranslatedBookName(bookId, t)} ${chapter}`}
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
            showTextLabel={t('audio.showText')}
            onShareAudio={() => setShowChapterAudioShareSheet(true)}
          />
        </View>

        {showInlineChapterFeedbackComposer ? (
          <View
            style={[
              styles.listenFeedbackCard,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <View style={styles.listenFeedbackHeader}>
              <View style={styles.listenFeedbackCopy}>
                <Text style={[styles.listenFeedbackTitle, { color: colors.biblePrimaryText }]}>
                  {t('bible.chapterFeedbackTitle')}
                </Text>
                <Text style={[styles.listenFeedbackBody, { color: colors.bibleSecondaryText }]}>
                  {t('bible.chapterFeedbackBody')}
                </Text>
              </View>
              <View
                style={[
                  styles.listenFeedbackIdentityPill,
                  {
                    backgroundColor: colors.bibleElevatedSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
              >
                <Ionicons name="person-outline" size={14} color={colors.bibleSecondaryText} />
                <Text
                  style={[styles.listenFeedbackIdentityText, { color: colors.bibleSecondaryText }]}
                  numberOfLines={1}
                >
                  {savedChapterFeedbackIdentity
                    ? `${savedChapterFeedbackIdentity.name} • ${savedChapterFeedbackIdentity.role}`
                    : t('common.notSet')}
                </Text>
              </View>
            </View>

            <View style={styles.feedbackSentimentRow}>
              <TouchableOpacity
                accessibilityLabel={t('bible.chapterFeedbackThumbsUp')}
                style={[
                  styles.listenSentimentButton,
                  {
                    backgroundColor:
                      feedbackSentiment === 'up' ? colors.accentGreen : colors.bibleElevatedSurface,
                    borderColor:
                      feedbackSentiment === 'up' ? colors.accentGreen : colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setFeedbackSentiment('up');
                  if (feedbackSubmitError) {
                    setFeedbackSubmitError(null);
                  }
                }}
                disabled={isSubmittingFeedback}
              >
                <Ionicons
                  name="thumbs-up-outline"
                  size={22}
                  color={
                    feedbackSentiment === 'up' ? colors.cardBackground : colors.biblePrimaryText
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityLabel={t('bible.chapterFeedbackThumbsDown')}
                style={[
                  styles.listenSentimentButton,
                  {
                    backgroundColor:
                      feedbackSentiment === 'down'
                        ? colors.accentPrimary
                        : colors.bibleElevatedSurface,
                    borderColor:
                      feedbackSentiment === 'down' ? colors.accentPrimary : colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setFeedbackSentiment('down');
                  if (feedbackSubmitError) {
                    setFeedbackSubmitError(null);
                  }
                }}
                disabled={isSubmittingFeedback}
              >
                <Ionicons
                  name="thumbs-down-outline"
                  size={22}
                  color={
                    feedbackSentiment === 'down' ? colors.cardBackground : colors.biblePrimaryText
                  }
                />
              </TouchableOpacity>
            </View>

            {feedbackSentiment ? (
              <>
                <TextInput
                  value={feedbackComment}
                  onChangeText={(value) => {
                    setFeedbackComment(value);
                    if (feedbackSubmitError) {
                      setFeedbackSubmitError(null);
                    }
                  }}
                  editable={!isSubmittingFeedback}
                  multiline
                  numberOfLines={3}
                  maxLength={2000}
                  placeholder={t('bible.chapterFeedbackPlaceholder')}
                  placeholderTextColor={colors.bibleSecondaryText}
                  style={[
                    styles.listenFeedbackInput,
                    {
                      color: colors.biblePrimaryText,
                      borderColor: colors.bibleDivider,
                      backgroundColor: colors.bibleElevatedSurface,
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[
                    styles.feedbackActionButton,
                    styles.listenFeedbackSubmitButton,
                    {
                      backgroundColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                      borderColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => {
                    void handleSubmitChapterFeedback('listener');
                  }}
                  disabled={!canSubmitFeedback}
                >
                  {isSubmittingFeedback ? (
                    <ActivityIndicator size="small" color={colors.cardBackground} />
                  ) : (
                    <Text
                      style={[
                        styles.feedbackActionLabel,
                        { color: canSubmitFeedback ? colors.cardBackground : colors.secondaryText },
                      ]}
                    >
                      {t('bible.chapterFeedbackSubmit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.listenFeedbackHint, { color: colors.bibleSecondaryText }]}>
                {t('bible.chapterFeedbackSelectionHint')}
              </Text>
            )}

            {feedbackSubmitError ? (
              <Text style={[styles.feedbackErrorText, { color: colors.error }]}>
                {feedbackSubmitError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderReaderVerses = (usePremiumTypography: boolean) => {
    const verseFontSize = usePremiumTypography
      ? scaleValue(typography.readingBody.fontSize)
      : scaleValue(20);
    const verseLineHeight = getReaderVerseLineHeight(verseFontSize);
    const verseNumberSize = usePremiumTypography
      ? scaleValue(typography.readingVerseNumber.fontSize)
      : scaleValue(12);
    const headingFontSize = scaleValue(typography.readingHeading.fontSize);

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
    const verseNumberStyle = [
      styles.inlineVerseNumber,
      usePremiumTypography ? styles.premiumVerseNumber : null,
      {
        fontSize: verseNumberSize,
        lineHeight: verseLineHeight,
        color: colors.bibleAccent,
      },
    ];

    return (
      <View style={[styles.readerColumn, usePremiumTypography ? styles.premiumReaderColumn : null]}>
        {paragraphs.map((paragraph, pIndex) => (
          <View
            key={pIndex}
            style={[styles.readerBlock, usePremiumTypography ? styles.premiumReaderBlock : null]}
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
                    color: colors.biblePrimaryText,
                  },
                ]}
              >
                {paragraph.heading}
              </Text>
            ) : null}
            <View style={styles.readerParagraph}>
              {paragraph.verses.map((verse) => {
                const verseAnnotations = annotations.filter(
                  (annotation) => !annotation.deleted_at && annotationOverlapsVerse(annotation, verse.verse)
                );
                const highlightAnnotation = verseAnnotations.find((a) => a.type === 'highlight');
                const isFocused = verse.verse === focusVerse;

                if (highlightAnnotation?.color) {
                  return (
                    <View
                      key={`${verse.id}-${highlightAnnotation.color}-${verseFontSize}-${verseLineHeight}`}
                      style={styles.readerVerse}
                    >
                      <HighlightedVerseText
                        verseNumber={verse.verse}
                        verseText={verse.text}
                        verseTextStyle={textStyle}
                        verseNumberStyle={verseNumberStyle}
                        selectedStyle={
                          selectedVerseSet.has(verse.verse) ? selectedVerseDecorationStyle : null
                        }
                        highlightColor={highlightAnnotation.color}
                        onPress={() => {
                          setSelectedVerses((current) =>
                            toggleBibleSelectionVerse(current, verse.verse)
                          );
                        }}
                      />
                    </View>
                  );
                }

                return (
                  <Pressable
                    key={verse.id}
                    onPress={() => {
                      setSelectedVerses((current) =>
                        toggleBibleSelectionVerse(current, verse.verse)
                      );
                    }}
                    style={styles.readerVerse}
                  >
                    <Text
                      style={[
                        textStyle,
                        selectedVerseSet.has(verse.verse) ? selectedVerseDecorationStyle : null,
                        isFocused ? { backgroundColor: colors.bibleAccent + '30' } : null,
                      ]}
                    >
                      <Text style={verseNumberStyle}>{verse.verse}</Text>
                      {'\u00A0'}
                      {verse.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
            onShare={() => {
              setShowChapterAudioShareSheet(true);
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
            {t('bible.noVersesAvailable', { book: getTranslatedBookName(bookId, t), chapter })}
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
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[{ flex: 1 }, swipeStyle]}>
          <Animated.View
            style={[styles.floatingReaderTopBar, { top: premiumTopInset }, topChromeAnimatedStyle]}
          >
            <TouchableOpacity
              style={styles.touchableGlassButton}
              activeOpacity={0.9}
              onPress={handleOpenBookPicker}
              accessibilityRole="button"
              accessibilityLabel={`${getTranslatedBookName(bookId, t)} ${chapter} ${translationLabel}`}
              accessibilityHint="Opens the book and chapter picker"
            >
              <GlassSurface
                style={styles.floatingReaderReferencePill}
                contentStyle={styles.floatingReaderReferencePillContent}
                intensity={44}
              >
                <Text
                  style={[styles.floatingReaderReferencePillPrimary, { color: colors.biblePrimaryText }]}
                  numberOfLines={1}
                >
                  {getTranslatedBookName(bookId, t)} {chapter}
                </Text>
                <View
                  style={[
                    styles.floatingReaderReferencePillDivider,
                    { backgroundColor: colors.bibleDivider },
                  ]}
                />
                <Text
                  style={[
                    styles.floatingReaderReferencePillTranslation,
                    { color: colors.bibleSecondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {translationLabel}
                </Text>
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
                            color: isSelected ? colors.bibleBackground : colors.bibleSecondaryText,
                          },
                        ]}
                      >
                        {mode === 'listen' ? t('bible.listen') : t('bible.read')}
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

          <GestureDetector gesture={readerNativeScrollGesture}>
            <Animated.ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={scrollHandler}
              onTouchMove={() => {
                hideRootTabBarForReaderScroll('touchMove');
              }}
              onScrollBeginDrag={(event) => {
                handleReaderScrollBeginDrag(event);
                setShowFontSizeSheet((current) =>
                  getNextFontSizeSheetVisibility(current, 'scrollStart')
                );
                setShowTranslationSheet((current) =>
                  getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
                );
              }}
              onScrollEndDrag={handleReaderScrollEndDrag}
              onMomentumScrollEnd={handleReaderMomentumScrollEnd}
              contentContainerStyle={[
                styles.premiumReaderScrollContent,
                {
                  paddingTop: premiumTopInset + 98,
                  paddingBottom: premiumBottomInset + 72,
                },
              ]}
            >
              <View style={styles.premiumReaderContentShell}>{renderReaderVerses(true)}</View>
            </Animated.ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
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
            paddingTop: spacing.md,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.navigate('BibleBrowser')}
        >
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
                      {mode === 'listen' ? t('bible.listen') : t('bible.read')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {!showMinimalListenChrome && (
            <>
              <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
                {getTranslatedBookName(bookId, t)} {chapter}
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
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              onScroll={scrollHandler}
              onTouchMove={() => {
                hideRootTabBarForReaderScroll('touchMove');
              }}
              onScrollBeginDrag={(event) => {
                handleReaderScrollBeginDrag(event);
                setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'scrollStart'));
              }}
              onScrollEndDrag={handleReaderScrollEndDrag}
              onMomentumScrollEnd={handleReaderMomentumScrollEnd}
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
              >
                {renderLegacyContent()}
              </View>
            </ScrollView>
    </>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bibleBackground,
          paddingTop: safeInsets.top,
          paddingBottom: safeInsets.bottom,
        },
      ]}
    >
      {showPremiumReadMode ? renderPremiumReadLayout() : renderLegacyReaderLayout()}

      {showFontSizeSheet && canAdjustFontSize ? (
        <Modal
          visible={showFontSizeSheet && canAdjustFontSize}
          transparent
          animationType="fade"
          onRequestClose={handleCloseFontSizeSheet}
        >
          <View style={[styles.fontSheetOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableOpacity
              style={styles.fontSheetBackdrop}
              activeOpacity={1}
              onPress={handleCloseFontSizeSheet}
            />
            <View
              style={[
                styles.fontSheet,
                {
                  backgroundColor: colors.bibleSurface,
                  borderColor: colors.bibleDivider,
                  paddingBottom: safeInsets.bottom + spacing.lg,
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
                          borderColor: isSelected
                            ? colors.bibleControlBackground
                            : colors.bibleDivider,
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
          </View>
        </Modal>
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
              {getTranslatedBookName(bookId, t)} {chapter}
            </Text>

            {[
              ...(chapterFeedbackEnabled && !showInlineChapterFeedbackComposer
                ? [
                    {
                      key: 'chapter-feedback',
                      icon: 'thumbs-up-outline',
                      label: t('bible.chapterFeedback'),
                      onPress: handleOpenChapterFeedback,
                    },
                  ]
                : []),
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
                label: isFavorite ? t('bible.removeFromFavorites') : t('bible.addToFavorites'),
                onPress: handleToggleFavorite,
              },
              {
                key: 'playlist',
                icon: 'list-outline',
                label: t('bible.addToSavedPlaylist'),
                onPress: handleAddToPlaylist,
              },
              {
                key: 'queue',
                icon: 'play-forward-outline',
                label: t('bible.addToQueue'),
                onPress: handleAddToQueue,
              },
              {
                key: 'download',
                icon: 'download-outline',
                label: t('bible.downloadBookAudio'),
                onPress: handleDownloadCurrentBookAudio,
              },
              {
                key: 'share-audio',
                icon: 'musical-notes-outline',
                label: t('bible.shareChapterAudio'),
                onPress: handleOpenChapterAudioShareSheet,
              },
              {
                key: 'share',
                icon: 'share-social-outline',
                label: t('bible.shareChapterReference'),
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

      <Modal
        visible={showFeedbackModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseFeedbackModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={safeInsets.top + spacing.lg}
          style={[styles.feedbackModalOverlay, { backgroundColor: colors.overlay }]}
        >
          <TouchableOpacity
            style={styles.feedbackModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseFeedbackModal}
          />
          <View
            style={[
              styles.feedbackModalCard,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <ScrollView
              style={styles.feedbackModalScroll}
              contentContainerStyle={styles.feedbackModalScrollContent}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.feedbackModalTitle, { color: colors.biblePrimaryText }]}>
                {t('bible.chapterFeedbackTitle')}
              </Text>
              <Text style={[styles.feedbackModalReference, { color: colors.bibleSecondaryText }]}>
                {getTranslatedBookName(bookId, t)} {chapter}
              </Text>
              <Text style={[styles.feedbackModalBody, { color: colors.bibleSecondaryText }]}>
                {t('bible.chapterFeedbackBody')}
              </Text>

              <View style={styles.feedbackSentimentRow}>
                <TouchableOpacity
                  style={[
                    styles.feedbackSentimentButton,
                    {
                      backgroundColor:
                        feedbackSentiment === 'up'
                          ? colors.accentGreen
                          : colors.bibleElevatedSurface,
                      borderColor:
                        feedbackSentiment === 'up' ? colors.accentGreen : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => {
                    setFeedbackSentiment('up');
                    if (feedbackSubmitError) {
                      setFeedbackSubmitError(null);
                    }
                  }}
                  disabled={isSubmittingFeedback}
                >
                  <Ionicons
                    name="thumbs-up-outline"
                    size={18}
                    color={
                      feedbackSentiment === 'up' ? colors.cardBackground : colors.biblePrimaryText
                    }
                  />
                  <Text
                    style={[
                      styles.feedbackSentimentLabel,
                      {
                        color:
                          feedbackSentiment === 'up'
                            ? colors.cardBackground
                            : colors.biblePrimaryText,
                      },
                    ]}
                  >
                    {t('bible.chapterFeedbackThumbsUp')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.feedbackSentimentButton,
                    {
                      backgroundColor:
                        feedbackSentiment === 'down'
                          ? colors.accentPrimary
                          : colors.bibleElevatedSurface,
                      borderColor:
                        feedbackSentiment === 'down' ? colors.accentPrimary : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => {
                    setFeedbackSentiment('down');
                    if (feedbackSubmitError) {
                      setFeedbackSubmitError(null);
                    }
                  }}
                  disabled={isSubmittingFeedback}
                >
                  <Ionicons
                    name="thumbs-down-outline"
                    size={18}
                    color={
                      feedbackSentiment === 'down'
                        ? colors.cardBackground
                        : colors.biblePrimaryText
                    }
                  />
                  <Text
                    style={[
                      styles.feedbackSentimentLabel,
                      {
                        color:
                          feedbackSentiment === 'down'
                            ? colors.cardBackground
                            : colors.biblePrimaryText,
                      },
                    ]}
                  >
                    {t('bible.chapterFeedbackThumbsDown')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={feedbackComment}
                onChangeText={setFeedbackComment}
                editable={!isSubmittingFeedback}
                multiline
                numberOfLines={4}
                maxLength={2000}
                placeholder={t('bible.chapterFeedbackPlaceholder')}
                placeholderTextColor={colors.bibleSecondaryText}
                style={[
                  styles.feedbackCommentInput,
                  {
                    color: colors.biblePrimaryText,
                    borderColor: colors.bibleDivider,
                    backgroundColor: colors.bibleElevatedSurface,
                  },
                ]}
              />

              {feedbackSubmitError ? (
                <Text style={[styles.feedbackErrorText, { color: colors.error }]}>
                  {feedbackSubmitError}
                </Text>
              ) : null}

              <View style={styles.feedbackActionRow}>
                <TouchableOpacity
                  style={[
                    styles.feedbackActionButton,
                    {
                      borderColor: colors.bibleDivider,
                      backgroundColor: colors.bibleElevatedSurface,
                    },
                  ]}
                  onPress={handleCloseFeedbackModal}
                  disabled={isSubmittingFeedback}
                >
                  <Text style={[styles.feedbackActionLabel, { color: colors.biblePrimaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.feedbackActionButton,
                    styles.feedbackSubmitButton,
                    {
                      backgroundColor:
                        canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                      borderColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => {
                    void handleSubmitChapterFeedback('reader');
                  }}
                  disabled={!canSubmitFeedback}
                >
                  {isSubmittingFeedback ? (
                    <ActivityIndicator size="small" color={colors.cardBackground} />
                  ) : (
                    <Text
                      style={[
                        styles.feedbackActionLabel,
                        { color: canSubmitFeedback ? colors.cardBackground : colors.secondaryText },
                      ]}
                    >
                      {t('bible.chapterFeedbackSubmit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showChapterAudioShareSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChapterAudioShareSheet(false)}
      >
        <TouchableOpacity
          style={[
            styles.audioShareBackdrop,
            {
              backgroundColor: colors.overlay,
              paddingBottom: Math.max(safeInsets.bottom, 12) + spacing.md,
            },
          ]}
          activeOpacity={1}
          onPress={() => setShowChapterAudioShareSheet(false)}
        >
          <View
            style={[
              styles.audioShareSheet,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <View
              style={[
                styles.audioShareGrabber,
                { backgroundColor: colors.bibleDivider },
              ]}
            />

            <View style={styles.audioShareHeader}>
              <View style={styles.audioShareTitleWrap}>
                <Text
                  style={[
                    styles.audioShareEyebrow,
                    { color: colors.bibleSecondaryText },
                  ]}
                >
                  {t('groups.share')}
                </Text>
                <Text style={[styles.audioShareTitle, { color: colors.biblePrimaryText }]}>
                  {chapterShareTitle}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                onPress={() => setShowChapterAudioShareSheet(false)}
                style={[
                  styles.audioShareCloseButton,
                  {
                    backgroundColor: colors.bibleElevatedSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
              >
                <Ionicons name="close" size={16} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            {[
              {
                key: 'full-audio',
                icon: 'musical-notes-outline',
                label: t('bible.shareChapterAudio'),
                onPress: () => {
                  void handleShareFullChapterAudio();
                },
              },
              {
                key: 'audio-clip',
                icon: 'cut-outline',
                label: t('bible.shareAudioPortion'),
                onPress: () => {
                  void handleShareAudioPortion();
                },
              },
            ].map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[
                  styles.audioShareOption,
                  {
                    backgroundColor: colors.bibleElevatedSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
                activeOpacity={0.9}
                onPress={action.onPress}
              >
                <View
                  style={[
                    styles.audioShareOptionIconWrap,
                    {
                      backgroundColor: colors.bibleSurface,
                      borderColor: colors.bibleDivider,
                    },
                  ]}
                >
                  <Ionicons name={action.icon as never} size={18} color={colors.bibleAccent} />
                </View>
                <Text style={[styles.audioShareOptionLabel, { color: colors.biblePrimaryText }]}>
                  {action.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.bibleSecondaryText}
                />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={audioPortionShareDraft !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseAudioPortionSheet}
      >
        <View style={[styles.feedbackModalOverlay, { backgroundColor: colors.overlay }]}>
          <TouchableOpacity
            style={styles.feedbackModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseAudioPortionSheet}
          />
          <View
            style={[
              styles.audioPortionSheet,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <Text style={[styles.audioPortionTitle, { color: colors.biblePrimaryText }]}>
              {t('bible.shareAudioPortion')}
            </Text>
            <Text style={[styles.audioPortionReference, { color: colors.bibleSecondaryText }]}>
              {chapterShareTitle}
            </Text>

            <View style={styles.audioPortionRangeHeader}>
              <View style={styles.audioPortionRangeLabelWrap}>
                <Ionicons
                  name="play-skip-back-outline"
                  size={14}
                  color={colors.bibleSecondaryText}
                />
                <Text style={[styles.audioPortionRangeTime, { color: colors.biblePrimaryText }]}>
                  {formatTime(audioPortionStartMs)}
                </Text>
              </View>
              <View style={styles.audioPortionRangeLabelWrap}>
                <Ionicons
                  name="play-skip-forward-outline"
                  size={14}
                  color={colors.bibleSecondaryText}
                />
                <Text style={[styles.audioPortionRangeTime, { color: colors.biblePrimaryText }]}>
                  {formatTime(audioPortionEndMs)}
                </Text>
              </View>
            </View>

            <AudioRangeSelector
              durationMs={audioPortionShareDraft?.durationMs ?? 0}
              startMs={audioPortionStartMs}
              endMs={audioPortionEndMs}
              minRangeMs={AUDIO_PORTION_MIN_DURATION_MS}
              previewPositionMs={isCurrentAudioChapter ? currentPosition : audioPortionStartMs}
              trackColor={colors.bibleDivider}
              selectionColor={colors.bibleElevatedSurface}
              waveColor={colors.bibleDivider}
              selectedWaveColor={colors.bibleSecondaryText}
              playedWaveColor={colors.bibleAccent}
              handleColor={colors.bibleAccent}
              onStartChange={handleAudioPortionStartSeek}
              onEndChange={handleAudioPortionEndSeek}
            />

            <TouchableOpacity
              style={[
                styles.audioPortionPreviewButton,
                {
                  borderColor: colors.bibleDivider,
                  backgroundColor: colors.bibleElevatedSurface,
                },
              ]}
              activeOpacity={0.9}
              onPress={handleToggleAudioPortionPreview}
              disabled={!isCurrentAudioChapter || isSharingAudioPortion}
            >
              <Ionicons
                name={isPreviewingAudioPortion ? 'pause' : 'play'}
                size={14}
                color={colors.biblePrimaryText}
              />
              <Text style={[styles.audioPortionPreviewLabel, { color: colors.biblePrimaryText }]}>
                {formatTime(audioPortionRangeDurationMs)}
              </Text>
            </TouchableOpacity>

            <View style={styles.audioPortionActions}>
              <TouchableOpacity
                style={[
                  styles.audioPortionActionButton,
                  {
                    borderColor: colors.bibleDivider,
                    backgroundColor: colors.bibleElevatedSurface,
                  },
                ]}
                onPress={handleCloseAudioPortionSheet}
                disabled={isSharingAudioPortion}
              >
                <Text style={[styles.audioPortionActionLabel, { color: colors.biblePrimaryText }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.audioPortionActionButton,
                  styles.audioPortionShareButton,
                  {
                    borderColor: colors.bibleAccent,
                    backgroundColor: colors.bibleAccent,
                  },
                ]}
                onPress={() => {
                  void handleConfirmAudioPortionShare();
                }}
                disabled={isSharingAudioPortion}
              >
                {isSharingAudioPortion ? (
                  <ActivityIndicator size="small" color={colors.cardBackground} />
                ) : (
                  <Text style={[styles.audioPortionActionLabel, { color: colors.cardBackground }]}>
                    {t('groups.share')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {pendingChapterAudioShareAction !== null ? (
        <View
          style={[
            styles.chapterAudioShareLoadingOverlay,
            { backgroundColor: colors.overlay },
          ]}
        >
          <View
            style={[
              styles.chapterAudioShareLoadingCard,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.biblePrimaryText} />
            <Text style={[styles.chapterAudioShareLoadingTitle, { color: colors.biblePrimaryText }]}>
              {chapterAudioShareActionLabel}
            </Text>
            <Text
              style={[
                styles.chapterAudioShareLoadingBody,
                { color: colors.bibleSecondaryText },
              ]}
            >
              {t('common.loading')}
            </Text>
          </View>
        </View>
      ) : null}

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
                                  : translation.installState === 'remote-only' ||
                                      translation.source === 'runtime'
                                    ? t('translations.download')
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
        transparent
        animationType="none"
        onRequestClose={() => setShowFollowAlongText(false)}
      >
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(200)}
          exiting={SlideOutDown.duration(250)}
          style={[styles.followAlongContainer, { backgroundColor: colors.bibleBackground }]}
        >
          <View
            style={[
              styles.followAlongHeader,
              {
                borderBottomColor: colors.bibleDivider,
                backgroundColor: colors.bibleBackground,
                paddingTop: safeInsets.top + spacing.md,
              },
            ]}
          >
            {/* Back to player — left */}
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

            {/* Centered title */}
            <View style={styles.followAlongTitleCenter} pointerEvents="none">
              <Text style={[styles.followAlongEyebrow, { color: colors.bibleAccent }]}>
                {translationLabel}
              </Text>
              <Text style={[styles.followAlongTitle, { color: colors.biblePrimaryText }]}>
                {getTranslatedBookName(bookId, t)} {chapter}
              </Text>
            </View>
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
        </Animated.View>
      </Modal>

      <AnnotationActionSheet
        visible={selectedVerses.length > 0}
        referenceLabel={selectedVerseReferenceLabel}
        selectedText={selectedVerseText}
        canAnnotate={true}
        closeButtonAccessibilityLabel={t('common.done')}
        bottomInset={safeInsets.bottom}
        activeHighlightColors={selectedHighlightColors}
        onCopy={() => {
          void handleCopySelectedVerses();
        }}
        onShare={() => {
          void handleShareSelectedVerses();
        }}
        onShareImage={handleOpenVerseImageShare}
        onHighlight={handleHighlightSelectedVerses}
        onNote={handleNoteSelectedVerses}
        onRemoveHighlight={handleRemoveHighlightSelectedVerses}
        onClose={() => {
          handleCloseSelectedVerses();
        }}
        existingNote={selectedNoteAnnotation?.content ?? undefined}
      />

      <Modal
        visible={showVerseImageSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVerseImageSheet(false)}
      >
        <View style={[styles.verseImageSheetOverlay, { backgroundColor: colors.overlay }]}>
          <TouchableOpacity
            style={styles.verseImageSheetBackdrop}
            activeOpacity={1}
            onPress={() => setShowVerseImageSheet(false)}
          />
          <View
            style={[
              styles.verseImageSheetCard,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <View style={styles.verseImageSheetHeader}>
              <View style={styles.verseImageSheetHeaderCopy}>
                <Text style={[styles.verseImageSheetTitle, { color: colors.biblePrimaryText }]}>
                  {t('bible.chooseVerseImageBackground')}
                </Text>
                <Text
                  style={[styles.verseImageSheetReference, { color: colors.bibleSecondaryText }]}
                  numberOfLines={1}
                >
                  {selectedVerseReferenceLabel}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.verseImageSheetCloseButton,
                  {
                    backgroundColor: colors.bibleElevatedSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
                activeOpacity={0.88}
                onPress={() => setShowVerseImageSheet(false)}
              >
                <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            <VerseImageSharePreview
              previewRef={verseImageSharePreviewRef}
              backgroundSource={selectedVerseImageBackground}
              referenceLabel={selectedVerseReferenceLabel}
              selectedText={selectedVerseText}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.verseImageBackgroundRail}
            >
              {HOME_VERSE_BACKGROUND_SOURCES.map((backgroundSource, index) => {
                const isSelected =
                  verseImageBackgroundCount > 0 &&
                  index === selectedVerseImageBackgroundIndex % verseImageBackgroundCount;

                return (
                  <Pressable
                    key={`${index}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${t('bible.chooseVerseImageBackground')} ${index + 1}`}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.verseImageBackgroundButton,
                      {
                        opacity: pressed ? 0.92 : 1,
                        borderColor: isSelected ? colors.accentGreen : colors.bibleDivider,
                      },
                    ]}
                    onPress={() => {
                      handleSelectVerseImageBackground(index);
                    }}
                  >
                    <ImageBackground
                      source={backgroundSource}
                      style={styles.verseImageBackgroundTile}
                      imageStyle={styles.verseImageBackgroundTileImage}
                      resizeMode="cover"
                    >
                      <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(12, 11, 9, 0.04)', 'rgba(12, 11, 9, 0.48)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                      {isSelected ? (
                        <View
                          style={[
                            styles.verseImageBackgroundSelectedBadge,
                            { backgroundColor: colors.accentGreen },
                          ]}
                        >
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color={colors.bibleBackground}
                          />
                        </View>
                      ) : null}
                    </ImageBackground>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.verseImageSheetActions}>
              <TouchableOpacity
                style={[
                  styles.verseImageSheetActionButton,
                  {
                    backgroundColor: colors.bibleElevatedSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
                activeOpacity={0.88}
                onPress={() => setShowVerseImageSheet(false)}
              >
                <Text style={[styles.verseImageSheetActionText, { color: colors.biblePrimaryText }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.verseImageSheetActionButton,
                  styles.verseImageSheetShareButton,
                  {
                    backgroundColor: colors.accentPrimary,
                    borderColor: colors.accentPrimary,
                  },
                ]}
                activeOpacity={0.88}
                onPress={() => {
                  void handleShareSelectedVerseImage();
                }}
                disabled={isSharingVerseImage}
              >
                {isSharingVerseImage ? (
                  <ActivityIndicator size="small" color={colors.bibleBackground} />
                ) : (
                  <Text
                    style={[
                      styles.verseImageSheetActionText,
                      { color: colors.bibleBackground },
                    ]}
                  >
                    {t('groups.share')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  floatingReaderReferencePill: {
    minHeight: layout.minTouchTarget + 4,
    maxWidth: 220,
  },
  floatingReaderReferencePillContent: {
    minHeight: layout.minTouchTarget + 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    justifyContent: 'center',
  },
  floatingReaderReferencePillPrimary: {
    ...typography.label,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: -0.15,
    flexShrink: 1,
  },
  floatingReaderReferencePillDivider: {
    width: 1,
    height: 16,
    borderRadius: radius.pill,
    opacity: 0.55,
  },
  floatingReaderReferencePillTranslation: {
    ...typography.label,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    flexShrink: 1,
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
  readerParagraph: {
    gap: 0,
  },
  listenColumn: {
    flex: 1,
    gap: 20,
    justifyContent: 'flex-start',
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
  listenMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listenMetaBlock: {
    flex: 1,
    gap: 6,
  },
  listenChapterTitle: {
    fontSize: 30,
    fontWeight: '700',
  },
  listenPlayerCard: {
    paddingBottom: 24,
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
  listenFeedbackCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  listenFeedbackHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  listenFeedbackCopy: {
    flex: 1,
    gap: 4,
  },
  listenFeedbackTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  listenFeedbackBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  listenFeedbackIdentityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listenFeedbackIdentityText: {
    maxWidth: 110,
    fontSize: 11,
    fontWeight: '700',
  },
  listenSentimentButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenFeedbackInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  listenFeedbackHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  listenFeedbackSubmitButton: {
    minWidth: 0,
  },
  readerBlock: {
    gap: 10,
    paddingHorizontal: 12,
  },
  premiumReaderBlock: {
    gap: 6,
    paddingHorizontal: 0,
  },
  readerVerse: {
    alignSelf: 'stretch',
  },
  sectionHeading: {
    ...typography.readingHeading,
    marginTop: 8,
    marginBottom: 4,
  },
  premiumSectionHeading: {
    ...typography.readingHeading,
    textTransform: 'none',
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
  fontSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fontSheetBackdrop: {
    flex: 1,
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
  feedbackModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  chapterAudioShareLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 50,
  },
  chapterAudioShareLoadingCard: {
    minWidth: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chapterAudioShareLoadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  chapterAudioShareLoadingBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  audioShareBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  audioShareSheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  audioShareGrabber: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    opacity: 0.9,
  },
  audioShareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  audioShareTitleWrap: {
    flex: 1,
    gap: 2,
  },
  audioShareEyebrow: {
    ...typography.eyebrow,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.1,
  },
  audioShareTitle: {
    ...typography.cardTitle,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.35,
  },
  audioShareCloseButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioShareOption: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  audioShareOptionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioShareOptionLabel: {
    ...typography.bodyStrong,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  audioPortionSheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.floating,
  },
  audioPortionTitle: {
    ...typography.cardTitle,
    fontSize: 20,
    lineHeight: 24,
  },
  audioPortionReference: {
    ...typography.label,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.3,
  },
  audioPortionRangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  audioPortionRangeLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioPortionRangeTime: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  audioPortionRangeSelector: {
    height: 72,
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  audioPortionRangeTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    opacity: 0.45,
  },
  audioPortionRangeSelection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 16,
    opacity: 0.6,
  },
  audioPortionWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 54,
  },
  audioPortionWaveBar: {
    width: 3,
    borderRadius: radius.pill,
    opacity: 0.95,
  },
  audioPortionPreviewNeedle: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: radius.pill,
    marginLeft: -1,
  },
  audioPortionHandle: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: AUDIO_PORTION_HANDLE_WIDTH,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPortionHandleStart: {
    marginLeft: 0,
  },
  audioPortionHandleEnd: {
    marginLeft: 0,
  },
  audioPortionHandleGrip: {
    width: 2,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    opacity: 0.88,
  },
  audioPortionPreviewButton: {
    alignSelf: 'center',
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  audioPortionPreviewLabel: {
    ...typography.label,
    fontVariant: ['tabular-nums'],
  },
  audioPortionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  audioPortionActionButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  audioPortionShareButton: {
    flex: 1.2,
  },
  audioPortionActionLabel: {
    ...typography.button,
    fontSize: 15,
    lineHeight: 20,
  },
  feedbackModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  feedbackModalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  feedbackModalScroll: {
    maxHeight: '100%',
  },
  feedbackModalScrollContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  feedbackModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  feedbackModalReference: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  feedbackModalBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackSentimentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackSentimentButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  feedbackSentimentLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackCommentInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  feedbackErrorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  verseImageSheetOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  verseImageSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  verseImageSheetCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  verseImageSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  verseImageSheetHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  verseImageSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  verseImageSheetReference: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  verseImageSheetCloseButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  verseImagePreviewFrame: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    aspectRatio: 1.08,
  },
  verseImagePreviewBackground: {
    flex: 1,
    justifyContent: 'space-between',
  },
  verseImagePreviewImage: {
    borderRadius: radius.lg,
  },
  verseImagePreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  verseImagePreviewContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  verseImagePreviewText: {
    ...typography.readingDisplay,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  verseImagePreviewReference: {
    ...typography.label,
    textAlign: 'center',
    fontWeight: '700',
  },
  verseImageBackgroundRail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  verseImageBackgroundButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  verseImageBackgroundTile: {
    width: 88,
    height: 118,
    justifyContent: 'flex-end',
  },
  verseImageBackgroundTileImage: {
    borderRadius: radius.lg,
  },
  verseImageBackgroundSelectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verseImageSheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  verseImageSheetActionButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  verseImageSheetShareButton: {
    minWidth: 132,
  },
  verseImageSheetActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackActionButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  feedbackSubmitButton: {
    minWidth: 132,
  },
  feedbackActionLabel: {
    fontSize: 14,
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  followAlongTitleCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  followAlongEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  followAlongTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  followAlongCloseButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 1,
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
    lineHeight: FOLLOW_ALONG_VERSE_LINE_HEIGHT,
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
