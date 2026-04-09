import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import type { LessonDetailScreenProps } from '../../navigation/types';
import { layout, radius, spacing, typography } from '../../design/system';
import { gatherFoundations, FOUNDATION_LESSON_TITLE_KEYS } from '../../data/gatherFoundations';
import { gatherWisdomCategories, WISDOM_LESSON_TITLE_KEYS } from '../../data/gatherWisdom';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import {
  getPassageText,
  getPrimaryAudioReference,
  type PassageBlock,
} from '../../services/gather/gatherBibleService';
import { formatBibleReferenceLabel } from '../../services/gather/gatherReferenceLabel';
import { getChapterAudioUrl } from '../../services/audio/audioService';
import { getTranslatedBookName } from '../../constants';
import type { MeetingSectionType } from '../../types/gather';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LessonDetailScreen({ route, navigation }: LessonDetailScreenProps) {
  const { parentId, lessonId, parentType } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

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

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const markLessonComplete = useGatherStore((s) => s.markLessonComplete);
  const unmarkLessonComplete = useGatherStore((s) => s.unmarkLessonComplete);
  const isComplete = useGatherStore((s) => s.isLessonComplete(parentId, lessonId));
  const currentTranslation = useBibleStore((state) => state.currentTranslation);

  const [activeSection, setActiveSection] = useState<MeetingSectionType>('fellowship');
  const [headerTitle, setHeaderTitle] = useState<string>(lessonTitle);
  const [passageBlocks, setPassageBlocks] = useState<PassageBlock[]>([]);
  const [isLoadingPassage, setIsLoadingPassage] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1.0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
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

  // Sync header title when lesson changes
  useEffect(() => {
    if (lesson) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeaderTitle(lessonTitle);
    }
  }, [lesson, lessonTitle]);

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

  const seekBackward = useCallback(async () => {
    const newPosition = Math.max(0, audioPosition - 10000);
    try {
      await soundRef.current?.setPositionAsync(newPosition);
    } catch {
      // Ignore
    }
    setAudioPosition(newPosition);
  }, [audioPosition]);

  const seekForward = useCallback(async () => {
    const newPosition = Math.min(
      audioDuration > 0 ? audioDuration : audioPosition + 10000,
      audioPosition + 10000
    );
    try {
      await soundRef.current?.setPositionAsync(newPosition);
    } catch {
      // Ignore
    }
    setAudioPosition(newPosition);
  }, [audioPosition, audioDuration]);

  const togglePlayPause = useCallback(async () => {
    if (isAudioPlaying) {
      await pauseAudio();
    } else {
      await playAudio();
    }
  }, [isAudioPlaying, playAudio, pauseAudio]);

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

      setActiveSection(newSection);

      // Update header title based on section
      if (!lesson) return;
      if (y + 120 >= application) {
        setHeaderTitle(t('gather.application'));
      } else if (y + 120 >= story) {
        setHeaderTitle(formatBibleReferenceLabel(lesson.references, resolveBookName));
      } else {
        setHeaderTitle(lessonTitle);
      }
    },
    [lesson, lessonTitle, resolveBookName, t]
  );

  // -------------------------------------------------------------------------
  // Arrow button behavior (contextual)
  // -------------------------------------------------------------------------

  const handleLeftArrow = useCallback(() => {
    if (activeSection === 'fellowship') {
      // no-op
    } else if (activeSection === 'story') {
      seekBackward();
    } else {
      // application
      scrollToSection('story');
    }
  }, [activeSection, seekBackward, scrollToSection]);

  const handleRightArrow = useCallback(() => {
    if (activeSection === 'fellowship') {
      scrollToSection('story');
    } else if (activeSection === 'story') {
      seekForward();
    } else {
      // application — no-op
    }
  }, [activeSection, seekForward, scrollToSection]);

  // -------------------------------------------------------------------------
  // Settings: playback speed and font size
  // -------------------------------------------------------------------------

  const adjustPlaybackSpeed = useCallback(
    async (delta: number) => {
      const newSpeed = Math.min(
        2.5,
        Math.max(0.5, Math.round((playbackSpeed + delta) * 100) / 100)
      );
      setPlaybackSpeed(newSpeed);
      try {
        await soundRef.current?.setRateAsync(newSpeed, true);
      } catch {
        // Ignore
      }
    },
    [playbackSpeed]
  );

  const adjustFontSize = useCallback((delta: number) => {
    setFontSizeMultiplier((prev) =>
      Math.min(1.3, Math.max(0.7, Math.round((prev + delta) * 100) / 100))
    );
  }, []);

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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.notFoundText, { color: colors.secondaryText }]}>
            {t('harvest.lessonNotFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Progress bar
  // -------------------------------------------------------------------------

  const progressFraction = audioDuration > 0 ? audioPosition / audioDuration : 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const SECTIONS: { key: MeetingSectionType; label: string }[] = [
    { key: 'fellowship', label: t('gather.fellowship') },
    { key: 'story', label: t('gather.story') },
    { key: 'application', label: t('gather.application') },
  ];

  const speedPercent = Math.round(playbackSpeed * 100);
  const fontPercent = Math.round(fontSizeMultiplier * 100);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.headerIconButton,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
              borderWidth: 1,
            },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={18} color={colors.primaryText} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.primaryText }]} numberOfLines={1}>
          {headerTitle}
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* Continuous scrollable content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {/* Hero */}
        <View style={styles.heroContainer}>
          <GatherIconBadge
            artworkKey={parent?.iconImage}
            size={100}
            iconSize={54}
            style={styles.heroIconCircle}
          />
          <Text style={[styles.heroLessonTitle, { color: colors.primaryText }]}>{lessonTitle}</Text>
          <Text style={[styles.heroReference, { color: colors.secondaryText }]}>
            {formatBibleReferenceLabel(lesson.references, resolveBookName)}
          </Text>
        </View>

        {/* Fellowship section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.fellowship = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionHeading, { color: colors.primaryText, paddingTop: 32 }]}>
            {t('gather.fellowship')}
          </Text>
          <FellowshipSection questions={translatedFellowshipQuestions} colors={colors} />
        </View>

        {/* Story section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.story = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionHeading, { color: colors.primaryText, paddingTop: 32 }]}>
            {formatBibleReferenceLabel(lesson.references, resolveBookName)}
          </Text>
          <StorySection
            isLoading={isLoadingPassage}
            passageBlocks={passageBlocks}
            colors={colors}
            fontSizeMultiplier={fontSizeMultiplier}
          />
        </View>

        {/* Application section */}
        <View
          onLayout={(e) => {
            sectionYRef.current.application = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionHeading, { color: colors.primaryText, paddingTop: 32 }]}>
            {t('gather.application')}
          </Text>
          <ApplicationSection
            questions={translatedApplicationQuestions}
            colors={colors}
            onListenAgain={() => {
              scrollToSection('story');
              playAudio();
            }}
            onShareApp={() => {
              Share.share({ message: t('common.shareMessage') }).catch(() => undefined);
            }}
          />
        </View>

        {/* Mark as Completed button */}
        <TouchableOpacity
          onPress={() =>
            isComplete
              ? unmarkLessonComplete(parentId, lessonId)
              : markLessonComplete(parentId, lessonId)
          }
          style={[
            styles.completeButton,
            {
              backgroundColor: isComplete ? colors.cardBackground : colors.accentGreen,
              borderColor: isComplete ? colors.accentGreen : 'transparent',
              borderWidth: isComplete ? 1.5 : 0,
            },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isComplete ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={22}
            color={isComplete ? colors.accentGreen : '#fff'}
          />
          <Text
            style={[styles.completeButtonText, { color: isComplete ? colors.accentGreen : '#fff' }]}
          >
            {isComplete ? t('gather.completed') : t('gather.markComplete')}
          </Text>
        </TouchableOpacity>

        {/* Bottom padding so last content isn't hidden behind bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed bottom bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.cardBackground,
            borderTopColor: colors.cardBorder,
            paddingBottom: insets.bottom + spacing.sm,
          },
        ]}
      >
        {/* Section tabs */}
        <View style={styles.tabRow}>
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.key;
            return (
              <TouchableOpacity
                key={section.key}
                onPress={() => {
                  setActiveSection(section.key);
                  scrollToSection(section.key);
                }}
                style={[styles.tabPill, isActive && { backgroundColor: colors.accentPrimary }]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabPillLabel,
                    { color: isActive ? '#FFFFFF' : colors.secondaryText },
                  ]}
                >
                  {section.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Progress bar with time labels */}
        <View style={styles.progressSection}>
          <Text style={[styles.timeText, { color: colors.secondaryText }]}>
            {formatTime(audioPosition)}
          </Text>
          <View style={styles.progressTrackWrapper}>
            <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accentPrimary,
                    width: `${Math.min(100, progressFraction * 100)}%`,
                  },
                ]}
              />
            </View>
            {/* Thumb dot */}
            <View
              style={[
                styles.progressThumb,
                {
                  backgroundColor: colors.accentPrimary,
                  left: `${Math.min(100, progressFraction * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.timeText, { color: colors.secondaryText }]}>
            {formatTime(audioDuration)}
          </Text>
        </View>

        {/* Controls row */}
        <View style={styles.controlsRow}>
          {/* Left placeholder balances the dots on the right */}
          <View style={styles.settingsButton} />

          {/* Centered: back · play · forward */}
          <View style={styles.controlsCenter}>
            <TouchableOpacity
              onPress={handleLeftArrow}
              disabled={!audioUrl && activeSection === 'story'}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ opacity: !audioUrl && activeSection === 'story' ? 0.35 : 1 }}
            >
              <View style={{ transform: [{ scaleX: -1 }] }}>
                <Ionicons name="refresh-outline" size={30} color={colors.accentPrimary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlayPause}
              disabled={!audioUrl}
              style={[
                styles.playButton,
                { backgroundColor: colors.accentPrimary, opacity: audioUrl ? 1 : 0.4 },
              ]}
            >
              <Ionicons
                name={isAudioPlaying ? 'pause' : 'play'}
                size={30}
                color="#FFFFFF"
                style={isAudioPlaying ? undefined : { marginLeft: 3 }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRightArrow}
              disabled={!audioUrl && activeSection === 'story'}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ opacity: !audioUrl && activeSection === 'story' ? 0.35 : 1 }}
            >
              <Ionicons name="refresh-outline" size={30} color={colors.accentPrimary} />
            </TouchableOpacity>
          </View>

          {/* Settings dots — far right */}
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.settingsButton}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings bottom sheet */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        />
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: colors.cardBackground,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          {/* Playback Speed */}
          <View style={[styles.sheetRow, { borderBottomColor: colors.cardBorder }]}>
            <Text style={[styles.sheetRowIcon]}>⚡</Text>
            <Text style={[styles.sheetRowLabel, { color: colors.primaryText }]}>
              Playback Speed
            </Text>
            <View style={styles.sheetRowControls}>
              <TouchableOpacity
                onPress={() => adjustPlaybackSpeed(-0.25)}
                style={styles.sheetStepButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sheetStepText, { color: colors.accentPrimary }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetValueText, { color: colors.primaryText }]}>
                {speedPercent}%
              </Text>
              <TouchableOpacity
                onPress={() => adjustPlaybackSpeed(0.25)}
                style={styles.sheetStepButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sheetStepText, { color: colors.accentPrimary }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Font Size */}
          <View style={[styles.sheetRow, { borderBottomColor: 'transparent' }]}>
            <Text style={[styles.sheetRowIcon]}>Tt</Text>
            <Text style={[styles.sheetRowLabel, { color: colors.primaryText }]}>Font Size</Text>
            <View style={styles.sheetRowControls}>
              <TouchableOpacity
                onPress={() => adjustFontSize(-0.1)}
                style={styles.sheetStepButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sheetStepText, { color: colors.accentPrimary }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetValueText, { color: colors.primaryText }]}>
                {fontPercent}%
              </Text>
              <TouchableOpacity
                onPress={() => adjustFontSize(0.1)}
                style={styles.sheetStepButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sheetStepText, { color: colors.accentPrimary }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Close */}
          <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setShowSettings(false)}>
            <Text style={[styles.sheetCloseText, { color: colors.accentPrimary }]}>✕ Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ThemeColors = ReturnType<typeof import('../../contexts/ThemeContext').useTheme>['colors'];

interface QuestionCardProps {
  number: number;
  text: string;
  colors: ThemeColors;
  actionButton?: React.ReactNode;
}

function QuestionCard({ number, text, colors, actionButton }: QuestionCardProps) {
  return (
    <View
      style={[
        styles.questionCard,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <View style={[styles.questionBadge, { backgroundColor: colors.accentPrimary + '18' }]}>
        <Text style={[styles.questionBadgeText, { color: colors.accentPrimary }]}>{number}</Text>
      </View>
      <Text style={[styles.questionText, { color: colors.primaryText }]}>{text}</Text>
      {actionButton}
    </View>
  );
}

interface FellowshipSectionProps {
  questions: string[];
  colors: ThemeColors;
}

function FellowshipSection({ questions, colors }: FellowshipSectionProps) {
  return (
    <View style={styles.sectionContainer}>
      {questions.map((q, idx) => {
        return <QuestionCard key={idx} number={idx + 1} text={q} colors={colors} />;
      })}
    </View>
  );
}

interface StorySectionProps {
  isLoading: boolean;
  passageBlocks: PassageBlock[];
  colors: ThemeColors;
  fontSizeMultiplier: number;
}

function StorySection({ isLoading, passageBlocks, colors, fontSizeMultiplier }: StorySectionProps) {
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
          No passage text available
        </Text>
      </View>
    );
  }

  const scaledFontSize = typography.readingBody.fontSize * fontSizeMultiplier;
  const scaledLineHeight = typography.readingBody.lineHeight * fontSizeMultiplier;

  return (
    <View style={styles.sectionContainer}>
      {passageBlocks.map((block, blockIdx) => (
        <View key={blockIdx} style={blockIdx > 0 ? styles.passageBlockGap : undefined}>
          <Text style={[styles.passageLabel, { color: colors.primaryText }]}>{block.label}</Text>
          <Text
            style={[
              styles.versesParagraph,
              { color: colors.primaryText, fontSize: scaledFontSize, lineHeight: scaledLineHeight },
            ]}
          >
            {block.verses.map((verse, verseIdx) => {
              const isFirst = verseIdx === 0;
              const hasHeading = Boolean(verse.heading);
              return (
                <React.Fragment key={verse.id}>
                  {hasHeading && (
                    <Text style={[styles.verseHeading, { color: colors.secondaryText }]}>
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
                      {verse.verse}{' '}
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

interface ApplicationSectionProps {
  questions: string[];
  colors: ThemeColors;
  onListenAgain: () => void;
  onShareApp: () => void;
}

function ApplicationSection({
  questions,
  colors,
  onListenAgain,
  onShareApp,
}: ApplicationSectionProps) {
  return (
    <View style={styles.sectionContainer}>
      {questions.map((q, idx) => {
        let actionButton: React.ReactNode | undefined;

        if (idx === 0) {
          actionButton = (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.accentPrimary }]}
              onPress={onListenAgain}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionButtonText, { color: colors.accentPrimary }]}>
                Listen to Story Again
              </Text>
            </TouchableOpacity>
          );
        } else if (idx === 5) {
          actionButton = (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.accentPrimary }]}
              onPress={onShareApp}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionButtonText, { color: colors.accentPrimary }]}>
                Share App
              </Text>
            </TouchableOpacity>
          );
        }

        return (
          <QuestionCard
            key={idx}
            number={idx + 1}
            text={q}
            colors={colors}
            actionButton={actionButton}
          />
        );
      })}
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
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.xxl,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  notFoundContainer: {
    flex: 1,
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  backButton: {
    padding: spacing.xs,
    alignSelf: 'flex-start',
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
    gap: spacing.sm,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.bodyStrong,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
    height: 32,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },

  // Hero (inside scroll)
  heroContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroIconCircle: {
    width: 100,
    height: 100,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroLessonTitle: {
    ...typography.pageTitle,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  heroReference: {
    ...typography.body,
    textAlign: 'center',
  },

  // Section headings inside scroll
  sectionHeading: {
    ...typography.screenTitle,
    marginBottom: spacing.lg,
  },

  // Questions
  sectionContainer: {
    gap: spacing.md,
  },
  questionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    gap: spacing.sm,
  },
  questionBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  questionBadgeText: {
    ...typography.label,
  },
  questionText: {
    ...typography.body,
    lineHeight: 24,
  },

  // Action buttons inside question cards
  actionButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  actionButtonText: {
    ...typography.label,
  },

  // Story / Passage
  centerContainer: {
    flex: 1,
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
    ...typography.cardTitle,
    marginBottom: spacing.sm,
  },
  versesParagraph: {
    ...typography.readingBody,
  },
  verseHeading: {
    ...typography.readingHeading,
  },
  verseNumber: {
    ...typography.readingVerseNumber,
    color: undefined, // color applied inline
  },

  // Bottom bar
  bottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },

  // Section tab pills
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tabPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  tabPillLabel: {
    ...typography.label,
  },

  // Progress bar
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  progressTrackWrapper: {
    flex: 1,
    height: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.xs,
  },
  progressThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    top: -3.5,
  },
  timeText: {
    ...typography.micro,
    minWidth: 36,
    textAlign: 'center',
  },

  // Controls row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  controlsCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipsisText: {
    fontSize: 18,
    letterSpacing: 2,
    lineHeight: 22,
  },

  // Settings bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  sheetRowIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  sheetRowLabel: {
    ...typography.body,
    flex: 1,
  },
  sheetRowControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetStepButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetStepText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  sheetValueText: {
    ...typography.bodyStrong,
    minWidth: 52,
    textAlign: 'center',
  },
  sheetCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    marginHorizontal: 24,
    marginTop: spacing.sm,
  },
  sheetCloseText: {
    ...typography.button,
  },
});
