import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Minus, Pause, Play, Plus, Type } from 'lucide-react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import type { LessonDetailScreenProps } from '../../navigation/types';
import { layout, shadows, spacing, typography } from '../../design/system';
import { getReadingFontFamily } from '../../design/fonts';
import { gatherFoundations, FOUNDATION_LESSON_TITLE_KEYS } from '../../data/gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_LESSON_TITLE_KEYS,
  WISDOM_TITLE_KEYS,
} from '../../data/gatherWisdom';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import {
  AppButton,
  AppCard,
  IconButton,
  PressableScale,
  ProgressBar,
  Sheet,
  TabSwitch,
} from '../../components/ui';
import {
  getPassageText,
  getPrimaryAudioReference,
  type PassageBlock,
} from '../../services/gather/gatherBibleService';
import { formatBibleReferenceLabel } from '../../services/gather/gatherReferenceLabel';
import { getChapterAudioUrl } from '../../services/audio/audioService';
import { getTranslatedBookName } from '../../constants';
import { formatPlaybackTime, lightHaptic, successHaptic } from '../../utils';
import type { MeetingSectionType } from '../../types/gather';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { useFontSize } from '../../hooks/useFontSize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LESSON_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

// The floating listen capsule: a 44pt play disc with 10pt of paper above and
// below it. Content has to clear this plus the gap under it.
const STRIP_CONTROL_SIZE = 44;
const STRIP_PADDING_VERTICAL = 10;
const STRIP_HEIGHT = STRIP_CONTROL_SIZE + STRIP_PADDING_VERTICAL * 2;
const STRIP_SIDE_INSET = 16;
/** Gap between the capsule's lower edge and the screen bottom. */
const STRIP_BOTTOM_WITH_INDICATOR = 26;

const MIN_FONT_MULTIPLIER = 0.7;
const MAX_FONT_MULTIPLIER = 1.3;

/** Story passage metrics — Lora 17/27 at 1.0×, scaled by the text-size stepper. */
const PASSAGE_FONT_SIZE = 17;
const PASSAGE_LINE_HEIGHT = 27;

const padLessonNumber = (value: number) => String(value).padStart(2, '0');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LessonDetailScreen({ route, navigation }: LessonDetailScreenProps) {
  const { parentId, lessonId, parentType } = route.params;
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Seed the lesson font multiplier from the user's global Settings font-size so
  // the preference applies here instead of always starting at 1.0 (L23).
  const { scale: globalFontScale } = useFontSize();

  const translatedFellowshipQuestions = [
    t('gather.fellowshipQ1'),
    t('gather.fellowshipQ2'),
    t('gather.fellowshipQ3'),
    t('gather.fellowshipQ4'),
  ];

  const translatedApplicationQuestions = [
    t('gather.applicationQ1'),
    t('gather.applicationQ2'),
    t('gather.applicationQ3'),
    t('gather.applicationQ4'),
    t('gather.applicationQ5'),
    t('gather.applicationQ6'),
    t('gather.applicationQ7'),
  ];
  const resolveBookName = useCallback((bookId: string) => getTranslatedBookName(bookId, t), [t]);

  // -------------------------------------------------------------------------
  // Lesson resolution
  // -------------------------------------------------------------------------

  const parent =
    parentType === 'foundation'
      ? gatherFoundations.find((f) => f.id === parentId)
      : gatherWisdomCategories.flatMap((c) => c.wisdoms).find((wisdom) => wisdom.id === parentId);

  const lesson = parent?.lessons.find((l) => l.id === lessonId);

  // Translate lesson title when an i18n key is available (foundation or wisdom lessons)
  const lessonTitleKey = lesson
    ? (FOUNDATION_LESSON_TITLE_KEYS[lesson.id] ?? WISDOM_LESSON_TITLE_KEYS[lesson.id])
    : undefined;
  const lessonTitle = lessonTitleKey
    ? t(lessonTitleKey as Parameters<typeof t>[0])
    : (lesson?.title ?? '');

  // "FOUNDATIONS 1" for a foundation, the wisdom's own title otherwise — the
  // wisdom track has no ordinal to show.
  const parentLabel = (() => {
    if (!parent) return '';
    if ('number' in parent) {
      return t('gather.foundationLabel', { number: parent.number });
    }
    const wisdomTitleKey = WISDOM_TITLE_KEYS[parent.id];
    return wisdomTitleKey ? t(wisdomTitleKey as Parameters<typeof t>[0]) : parent.title;
  })();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const markLessonComplete = useGatherStore((s) => s.markLessonComplete);
  const unmarkLessonComplete = useGatherStore((s) => s.unmarkLessonComplete);
  const isComplete = useGatherStore((s) => s.isLessonComplete(parentId, lessonId));
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const translationInfo = translations.find((item) => item.id === currentTranslation);
  // Reading-surface serif for this translation's script. Latin → Lora;
  // Devanagari and other unsupported scripts → undefined = platform serif.
  const readingFontFamily = getReadingFontFamily(translationInfo?.language);
  const readingHeadingFontFamily = getReadingFontFamily(translationInfo?.language, 600);

  const [activeSection, setActiveSection] = useState<MeetingSectionType>('fellowship');
  const [passageBlocks, setPassageBlocks] = useState<PassageBlock[]>([]);
  const [isLoadingPassage, setIsLoadingPassage] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(globalFontScale);
  // Tracks whether the user has manually stepped the lesson font size this
  // session; until then we keep it mirrored to the global Settings preference.
  const hasManualFontOverride = useRef(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const progressWidthRef = useRef(0);
  const sectionYRef = useRef<{ fellowship: number; story: number; application: number }>({
    fellowship: 0,
    story: 0,
    application: 0,
  });
  const resetAudioPlaybackState = useCallback(() => {
    setAudioUrl(null);
    setAudioPosition(0);
    setAudioDuration(0);
    setIsAudioPlaying(false);
  }, []);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Load Bible passage text
  useEffect(() => {
    if (!lesson) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingPassage(true);
    setPassageBlocks([]);

    getPassageText(lesson.references, currentTranslation, { bookNameResolver: resolveBookName })
      .then((blocks) => {
        if (!cancelled) {
          setPassageBlocks(blocks);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPassageBlocks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPassage(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTranslation, lesson, resolveBookName]);

  // Resolve audio URL
  useEffect(() => {
    if (!lesson) return;

    const primaryRef = getPrimaryAudioReference(lesson.references);
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetAudioPlaybackState();
    void soundRef.current?.unloadAsync().catch(() => undefined);
    soundRef.current = null;

    if (!primaryRef) {
      return () => {
        cancelled = true;
      };
    }

    getChapterAudioUrl(currentTranslation, primaryRef.bookId, primaryRef.chapter)
      .then((asset) => {
        if (!cancelled) {
          setAudioUrl(asset?.url ?? null);
        }
      })
      .catch(() => {
        // Audio URL resolution failure is non-fatal — controls stay disabled
      });

    return () => {
      cancelled = true;
    };
  }, [currentTranslation, lesson, resetAudioPlaybackState]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, []);

  // Mirror the global Settings font-size preference until the user manually
  // adjusts the lesson-local stepper (L23).
  useEffect(() => {
    if (hasManualFontOverride.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFontSizeMultiplier(globalFontScale);
  }, [globalFontScale]);

  // -------------------------------------------------------------------------
  // Audio controls
  // -------------------------------------------------------------------------

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    setAudioPosition(status.positionMillis);
    if (status.durationMillis) {
      setAudioDuration(status.durationMillis);
    }

    if (status.didJustFinish) {
      setIsAudioPlaying(false);
      setAudioPosition(0);
    } else {
      // Functional update bails out of re-render when value is unchanged,
      // preventing excessive re-renders during playback from making the
      // play/pause button unresponsive after switching tabs.
      setIsAudioPlaying((prev) => (prev !== status.isPlaying ? status.isPlaying : prev));
    }
  }, []);

  const playAudio = useCallback(async () => {
    if (!audioUrl) return;

    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true, progressUpdateIntervalMillis: 500, rate: playbackSpeed },
          handlePlaybackStatusUpdate
        );
        soundRef.current = sound;
      } else {
        await soundRef.current.playAsync();
      }
      setIsAudioPlaying(true);
    } catch {
      // Ignore playback errors silently — user can retry
    }
  }, [audioUrl, handlePlaybackStatusUpdate, playbackSpeed]);

  const pauseAudio = useCallback(async () => {
    try {
      await soundRef.current?.pauseAsync();
    } catch {
      // Ignore
    }
    setIsAudioPlaying(false);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (isAudioPlaying) {
      await pauseAudio();
    } else {
      await playAudio();
    }
  }, [isAudioPlaying, playAudio, pauseAudio]);

  // The two-row transport bar's ±10s arrows are gone with the redesign, so the
  // progress rule itself carries scrubbing: tap anywhere along it to seek.
  const seekToLocation = useCallback(
    (locationX: number) => {
      const width = progressWidthRef.current;
      if (!width || audioDuration <= 0 || !soundRef.current) return;
      const fraction = Math.min(1, Math.max(0, locationX / width));
      const target = Math.round(fraction * audioDuration);
      void soundRef.current.setPositionAsync(target).catch(() => undefined);
      setAudioPosition(target);
    },
    [audioDuration]
  );

  // -------------------------------------------------------------------------
  // Section scrolling
  // -------------------------------------------------------------------------

  const scrollToSection = useCallback((key: MeetingSectionType) => {
    scrollViewRef.current?.scrollTo({ y: sectionYRef.current[key], animated: true });
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const { story, application } = sectionYRef.current;

      let newSection: MeetingSectionType;
      if (y + 120 >= application) {
        newSection = 'application';
      } else if (y + 120 >= story) {
        newSection = 'story';
      } else {
        newSection = 'fellowship';
      }

      setActiveSection((prev) => (prev !== newSection ? newSection : prev));
    },
    [setActiveSection]
  );

  // -------------------------------------------------------------------------
  // Settings: playback speed and font size
  // -------------------------------------------------------------------------

  const setPlaybackSpeedValue = useCallback(async (rate: number) => {
    setPlaybackSpeed(rate);
    try {
      await soundRef.current?.setRateAsync(rate, true);
    } catch {
      // Ignore
    }
  }, []);

  const adjustFontSize = useCallback((delta: number) => {
    hasManualFontOverride.current = true;
    setFontSizeMultiplier((prev) =>
      Math.min(
        MAX_FONT_MULTIPLIER,
        Math.max(MIN_FONT_MULTIPLIER, Math.round((prev + delta) * 100) / 100)
      )
    );
  }, []);

  const toggleComplete = useCallback(() => {
    if (isComplete) {
      lightHaptic();
      unmarkLessonComplete(parentId, lessonId);
    } else {
      successHaptic();
      markLessonComplete(parentId, lessonId);
    }
  }, [isComplete, lessonId, markLessonComplete, parentId, unmarkLessonComplete]);

  const verseCount = useMemo(
    () => passageBlocks.reduce((total, block) => total + block.verses.length, 0),
    [passageBlocks]
  );

  // -------------------------------------------------------------------------
  // Lesson not found
  // -------------------------------------------------------------------------

  if (!lesson) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.notFoundContainer}>
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
          <Text style={[styles.notFoundText, { color: colors.secondaryText }]}>
            {t('harvest.lessonNotFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Derived render values
  // -------------------------------------------------------------------------

  const referenceLabel = formatBibleReferenceLabel(lesson.references, resolveBookName);
  const progressFraction = audioDuration > 0 ? audioPosition / audioDuration : 0;
  const stripBottom = insets.bottom > 0 ? STRIP_BOTTOM_WITH_INDICATOR : spacing.lg;
  const contentClearance = STRIP_HEIGHT + stripBottom + spacing.lg;

  const sections: { key: MeetingSectionType; label: string }[] = [
    { key: 'fellowship', label: t('gather.fellowship') },
    { key: 'story', label: t('gather.story') },
    { key: 'application', label: t('gather.application') },
  ];

  const headerEyebrow = [
    parentLabel,
    t('gather.lessonOfCount', { number: lesson.number, total: parent?.lessons.length ?? 0 }),
  ]
    .filter(Boolean)
    .join(' · ');

  const heroEyebrow = [referenceLabel, translationInfo?.name].filter(Boolean).join(' · ');
  // Elapsed time once playback has moved; the chapter length before that.
  const stripTime = formatPlaybackTime(audioPosition > 0 ? audioPosition : audioDuration);
  const fontPercent = Math.round(fontSizeMultiplier * 100);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon={ArrowLeft}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
        />
        <Text
          style={[
            typography.eyebrow,
            displayFont.regular,
            styles.headerEyebrow,
            { color: colors.secondaryText },
          ]}
          numberOfLines={1}
        >
          {headerEyebrow}
        </Text>
        <IconButton
          icon={Type}
          onPress={() => setShowSettings(true)}
          accessibilityLabel={t('learn.playbackAndText')}
        />
      </View>

      {/* Continuous scrollable content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentClearance }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text
            style={[typography.numeralHero, styles.heroNumeral, { color: colors.accentPrimary }]}
          >
            {padLessonNumber(lesson.number)}
          </Text>
          <View style={styles.heroColumn}>
            <Text style={[styles.heroTitle, displayFont.bold, { color: colors.primaryText }]}>
              {lessonTitle}
            </Text>
            <Text
              style={[
                typography.eyebrow,
                displayFont.regular,
                styles.heroEyebrow,
                { color: colors.secondaryText },
              ]}
            >
              {heroEyebrow}
            </Text>
          </View>
          <GatherIconBadge
            artworkKey={parent?.iconImage}
            size={40}
            iconSize={40}
            iconColor={colors.secondaryText}
            style={styles.heroBadge}
          />
        </View>

        {/* Section switch — drives the scroll, and follows it back */}
        <TabSwitch
          segments={sections}
          value={activeSection}
          onChange={(key) => {
            const next = key as MeetingSectionType;
            setActiveSection(next);
            scrollToSection(next);
          }}
          fullWidth
          size="md"
          style={styles.tabSwitch}
        />

        {/* Fellowship section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.fellowship = e.nativeEvent.layout.y;
          }}
          style={styles.sectionBlock}
        >
          <QuestionList questions={translatedFellowshipQuestions} colors={colors} />
        </View>

        {/* Story section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.story = e.nativeEvent.layout.y;
          }}
          style={styles.sectionBlock}
        >
          <SectionRule colors={colors} />
          <View style={styles.sectionEyebrowRow}>
            <Text
              style={[
                typography.eyebrow,
                displayFont.regular,
                styles.sectionEyebrow,
                { color: colors.secondaryText },
              ]}
              numberOfLines={1}
            >
              {`${t('gather.story')} · ${referenceLabel}`}
            </Text>
            {verseCount > 0 ? (
              <Text
                style={[typography.eyebrow, displayFont.regular, { color: colors.textTertiary }]}
              >
                {t('bible.verseCount', { count: verseCount })}
              </Text>
            ) : null}
          </View>
          <StorySection
            isLoading={isLoadingPassage}
            passageBlocks={passageBlocks}
            colors={colors}
            fontSizeMultiplier={fontSizeMultiplier}
            readingFontFamily={readingFontFamily}
            readingHeadingFontFamily={readingHeadingFontFamily}
            displayFont={displayFont}
          />
        </View>

        {/* Application section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.application = e.nativeEvent.layout.y;
          }}
          style={styles.sectionBlock}
        >
          <SectionRule colors={colors} />
          <View style={styles.sectionEyebrowRow}>
            <Text
              style={[
                typography.eyebrow,
                displayFont.regular,
                styles.sectionEyebrow,
                { color: colors.secondaryText },
              ]}
              numberOfLines={1}
            >
              {t('gather.application')}
            </Text>
          </View>
          <QuestionList
            questions={translatedApplicationQuestions}
            colors={colors}
            actionForIndex={(idx) => {
              if (idx === 0) {
                return {
                  label: t('learn.listenToStoryAgain'),
                  onPress: () => {
                    scrollToSection('story');
                    void playAudio();
                  },
                };
              }
              if (idx === 5) {
                return {
                  label: t('learn.shareApp'),
                  onPress: () => {
                    Share.share({ message: t('common.shareMessage') }).catch(() => undefined);
                  },
                };
              }
              return undefined;
            }}
          />
        </View>
      </ScrollView>

      {/* Floating listen + complete capsule */}
      <View style={[styles.strip, { bottom: stripBottom }]} pointerEvents="box-none">
        <View
          style={[
            styles.stripInner,
            shadows.floating,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <IconButton
            icon={isAudioPlaying ? Pause : Play}
            variant="accent"
            size={STRIP_CONTROL_SIZE}
            iconSize={20}
            onPress={() => void togglePlayPause()}
            disabled={!audioUrl}
            accessibilityLabel={
              isAudioPlaying ? t('interface.pauseChapterAudio') : t('interface.playChapterAudio')
            }
          />

          <View style={styles.stripColumn}>
            <View style={styles.stripLabelRow}>
              <Text
                style={[
                  typography.eyebrow,
                  displayFont.regular,
                  styles.stripEyebrow,
                  { color: colors.secondaryText },
                ]}
                numberOfLines={2}
              >
                {`${t('bible.listen')} · ${referenceLabel}`}
              </Text>
              <Text style={[typography.mono, styles.stripTime, { color: colors.secondaryText }]}>
                {stripTime}
              </Text>
            </View>
            <Pressable
              onLayout={(e: LayoutChangeEvent) => {
                progressWidthRef.current = e.nativeEvent.layout.width;
              }}
              onPress={(e) => seekToLocation(e.nativeEvent.locationX)}
              disabled={!audioUrl}
              hitSlop={10}
              accessibilityRole="adjustable"
              accessibilityLabel={t('bible.listen')}
            >
              <ProgressBar progress={progressFraction} height={4} />
            </Pressable>
          </View>

          <CompleteToggle isComplete={isComplete} onPress={toggleComplete} colors={colors} />
        </View>
      </View>

      {/* Playback speed + text size */}
      <Sheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        title={t('learn.playbackAndText')}
        closeLabel={t('interface.close')}
      >
        <View style={styles.sheetSection}>
          <Text
            style={[
              typography.eyebrow,
              displayFont.regular,
              styles.sheetSectionLabel,
              { color: colors.secondaryText },
            ]}
          >
            {t('learn.playbackSpeed')}
          </Text>
          <TabSwitch
            segments={LESSON_PLAYBACK_RATES.map((rate) => ({
              key: String(rate),
              label: `${rate}×`,
            }))}
            value={String(playbackSpeed)}
            onChange={(key) => void setPlaybackSpeedValue(Number(key))}
            fullWidth
            size="md"
            accessibilityLabel={t('learn.playbackSpeed')}
          />
        </View>

        <View style={styles.sheetSection}>
          <Text
            style={[
              typography.eyebrow,
              displayFont.regular,
              styles.sheetSectionLabel,
              { color: colors.secondaryText },
            ]}
          >
            {t('learn.fontSizeLabel')}
          </Text>
          <View style={styles.fontStepperRow}>
            <IconButton
              icon={Minus}
              onPress={() => adjustFontSize(-0.1)}
              disabled={fontSizeMultiplier <= MIN_FONT_MULTIPLIER}
              accessibilityLabel={t('learn.decreaseTextSize')}
            />
            <Text
              style={[typography.mono, styles.fontStepperValue, { color: colors.primaryText }]}
            >{`${fontPercent}%`}</Text>
            <IconButton
              icon={Plus}
              onPress={() => adjustFontSize(0.1)}
              disabled={fontSizeMultiplier >= MAX_FONT_MULTIPLIER}
              accessibilityLabel={t('learn.increaseTextSize')}
            />
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ThemeColors = ReturnType<typeof import('../../contexts/ThemeContext').useTheme>['colors'];
type DisplayFont = ReturnType<typeof useDisplayFont>;

/** The 1.5px ink rule that opens Story and Application. */
function SectionRule({ colors }: { colors: ThemeColors }) {
  return <View style={[styles.sectionRule, { backgroundColor: colors.primaryText }]} />;
}

interface QuestionAction {
  label: string;
  onPress: () => void;
}

interface QuestionListProps {
  questions: string[];
  colors: ThemeColors;
  actionForIndex?: (index: number) => QuestionAction | undefined;
}

// One paper panel holding every question as a hairline-divided row: a mono
// ordinal in the accent and the question beside it. Fellowship and Application
// share the recipe exactly.
function QuestionList({ questions, colors, actionForIndex }: QuestionListProps) {
  return (
    <AppCard padding={0} style={styles.questionCard}>
      {questions.map((question, idx) => {
        const action = actionForIndex?.(idx);
        return (
          <View
            key={idx}
            style={[
              styles.questionRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: colors.borderStrong },
            ]}
          >
            <Text
              style={[typography.mono, styles.questionOrdinal, { color: colors.accentPrimary }]}
            >
              {padLessonNumber(idx + 1)}
            </Text>
            <View style={styles.questionBody}>
              <Text style={[styles.questionText, { color: colors.primaryText }]}>{question}</Text>
              {action ? (
                <AppButton
                  label={action.label}
                  onPress={action.onPress}
                  variant="outline"
                  size="md"
                  fullWidth={false}
                  style={styles.questionAction}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </AppCard>
  );
}

interface CompleteToggleProps {
  isComplete: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

// The one control AppButton cannot express: its completed state is a
// `successSoft` fill with `onSuccessSoft` ink, and AppButton's content colour is
// variant-derived. Geometry matches AppButton `md` (40pt, fully rounded).
function CompleteToggle({ isComplete, onPress, colors }: CompleteToggleProps) {
  const { t } = useTranslation();
  const contentColor = isComplete ? colors.onSuccessSoft : colors.primaryText;

  return (
    <PressableScale
      onPress={onPress}
      pressEffect="translate"
      haptic="light"
      accessibilityRole="button"
      accessibilityState={{ checked: isComplete }}
      accessibilityLabel={isComplete ? t('gather.markIncomplete') : t('gather.markComplete')}
      style={[
        styles.completeToggle,
        {
          backgroundColor: isComplete ? colors.successSoft : 'transparent',
          borderColor: isComplete ? colors.successSoft : colors.borderStrong,
        },
      ]}
    >
      <Check size={16} color={contentColor} strokeWidth={2} />
      <Text style={[typography.captionStrong, { color: contentColor }]} numberOfLines={1}>
        {isComplete ? t('gather.completed') : t('gather.complete')}
      </Text>
    </PressableScale>
  );
}

interface StorySectionProps {
  isLoading: boolean;
  passageBlocks: PassageBlock[];
  colors: ThemeColors;
  fontSizeMultiplier: number;
  readingFontFamily: string | undefined;
  readingHeadingFontFamily: string | undefined;
  displayFont: DisplayFont;
}

function StorySection({
  isLoading,
  passageBlocks,
  colors,
  fontSizeMultiplier,
  readingFontFamily,
  readingHeadingFontFamily,
  displayFont,
}: StorySectionProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  if (passageBlocks.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
          {t('learn.noPassageText')}
        </Text>
      </View>
    );
  }

  const scaledFontSize = PASSAGE_FONT_SIZE * fontSizeMultiplier;
  const scaledLineHeight = PASSAGE_LINE_HEIGHT * fontSizeMultiplier;
  const showBlockLabels = passageBlocks.length > 1;

  return (
    <View>
      {passageBlocks.map((block, blockIdx) => (
        <View key={blockIdx} style={blockIdx > 0 ? styles.passageBlockGap : undefined}>
          {showBlockLabels ? (
            <Text
              style={[
                typography.eyebrow,
                displayFont.regular,
                styles.passageLabel,
                { color: colors.secondaryText },
              ]}
            >
              {block.label}
            </Text>
          ) : null}
          <Text
            style={[
              styles.versesParagraph,
              {
                color: colors.primaryText,
                fontFamily: readingFontFamily,
                fontSize: scaledFontSize,
                lineHeight: scaledLineHeight,
              },
            ]}
          >
            {block.verses.map((verse, verseIdx) => {
              const isFirst = verseIdx === 0;
              const hasHeading = Boolean(verse.heading);
              return (
                <React.Fragment key={verse.id}>
                  {hasHeading && (
                    <Text
                      style={[
                        styles.verseHeading,
                        { color: colors.secondaryText, fontFamily: readingHeadingFontFamily },
                      ]}
                    >
                      {'\n'}
                      {verse.heading}
                      {'\n'}
                    </Text>
                  )}
                  {!isFirst && !hasHeading && ' '}
                  <Text style={{ lineHeight: scaledLineHeight }}>
                    <Text
                      style={[
                        styles.verseNumber,
                        { color: colors.accentPrimary, lineHeight: scaledLineHeight },
                      ]}
                    >
                      {/* RN has no baseline shift, so the marker is approximated
                          with a small mono figure and a thin space. */}
                      {verse.verse}
                      {' '}
                    </Text>
                    <Text style={{ color: colors.primaryText, lineHeight: scaledLineHeight }}>
                      {verse.text}
                    </Text>
                  </Text>
                </React.Fragment>
              );
            })}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  notFoundContainer: {
    flex: 1,
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  notFoundText: {
    ...typography.body,
  },

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  headerEyebrow: {
    flex: 1,
    textAlign: 'center',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: 22,
  },
  heroNumeral: {
    // The 0.85 optical line-height clips the cap slightly; nudge it back down so
    // the numeral's top aligns with the title's.
    marginTop: 2,
  },
  heroColumn: {
    flex: 1,
  },
  heroTitle: {
    ...typography.pageTitle,
    fontSize: 26,
    lineHeight: 27,
    letterSpacing: -0.91, // -0.035em at 26px
  },
  heroEyebrow: {
    marginTop: spacing.md,
  },
  heroBadge: {
    marginTop: spacing.xs,
  },

  tabSwitch: {
    marginBottom: spacing.lg,
  },

  // Sections
  sectionBlock: {
    marginBottom: spacing.lg,
  },
  sectionRule: {
    height: 1.5,
    opacity: 0.8,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sectionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionEyebrow: {
    flexShrink: 1,
  },

  // Questions
  questionCard: {
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: 14,
  },
  questionOrdinal: {
    fontSize: 13,
    width: 22,
    lineHeight: 22,
  },
  questionBody: {
    flex: 1,
  },
  questionText: {
    ...typography.body,
    lineHeight: 22.5,
  },
  questionAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },

  // Story / Passage
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
  },
  passageBlockGap: {
    marginTop: spacing.xl,
  },
  passageLabel: {
    marginBottom: spacing.sm,
  },
  versesParagraph: {
    ...typography.readingBody,
  },
  verseHeading: {
    ...typography.readingHeading,
  },
  verseNumber: {
    ...typography.mono,
    fontSize: 10,
  },

  // Floating listen capsule
  strip: {
    position: 'absolute',
    left: STRIP_SIDE_INSET,
    right: STRIP_SIDE_INSET,
  },
  stripInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: STRIP_PADDING_VERTICAL,
    paddingHorizontal: spacing.md,
  },
  stripColumn: {
    flex: 1,
    justifyContent: 'center',
    minHeight: STRIP_CONTROL_SIZE,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  stripLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stripEyebrow: {
    flex: 1,
  },
  stripTime: {
    textAlign: 'right',
  },
  completeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: layout.iconButton,
    borderRadius: layout.iconButton / 2,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },

  // Playback + text sheet
  sheetSection: {
    marginBottom: spacing.xl,
  },
  sheetSectionLabel: {
    marginBottom: spacing.md,
  },
  fontStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fontStepperValue: {
    flex: 1,
    textAlign: 'center',
  },
});
