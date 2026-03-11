import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { getChapter } from '../../services/bible';
import { getChapterPresentationMode } from '../../services/bible/presentation';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { useBibleStore, useProgressStore } from '../../stores';
import { useFontSize, useAudioPlayer } from '../../hooks';
import { VersesSkeleton, AudioFirstChapterCard, AudioPlayerBar } from '../../components';
import type { Verse } from '../../types';
import type { BibleStackParamList, BibleReaderScreenProps } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

export function BibleReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleReaderScreenProps['route']>();
  const { bookId, chapter, autoplayAudio, focusVerse } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const autoplayKeyRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});

  const [verses, setVerses] = useState<Verse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFontSizeSheet, setShowFontSizeSheet] = useState(false);

  const markChapterRead = useProgressStore((state) => state.markChapterRead);
  const setCurrentBook = useBibleStore((state) => state.setCurrentBook);
  const setCurrentChapter = useBibleStore((state) => state.setCurrentChapter);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const { fontSize, scaleValue, setSize } = useFontSize();
  const {
    showPlayer,
    togglePlayer,
    currentBookId: activeAudioBookId,
    currentChapter: activeAudioChapter,
    playChapter,
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
  }, [bookId, chapter]);

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
    if (!autoplayAudio || !audioEnabled || isLoading) {
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
    if (!audioEnabled || activeAudioBookId !== bookId || !activeAudioChapter) {
      return;
    }

    if (activeAudioChapter === chapter) {
      return;
    }

    navigation.setParams({ chapter: activeAudioChapter, focusVerse: undefined });
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

  const handlePrevChapter = () => {
    if (hasPrevChapter) {
      setShowFontSizeSheet(false);
      navigation.setParams({ chapter: chapter - 1, focusVerse: undefined });
    }
  };

  const handleNextChapter = () => {
    if (hasNextChapter) {
      setShowFontSizeSheet(false);
      navigation.setParams({ chapter: chapter + 1, focusVerse: undefined });
    }
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
        <AudioFirstChapterCard
          bookId={bookId}
          chapter={chapter}
          translationLabel={translationLabel}
          onChapterChange={(newChapter) => {
            navigation.setParams({ chapter: newChapter, focusVerse: undefined });
          }}
        />
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
                  lineHeight: scaleValue(34),
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
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.bibleDivider }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.biblePrimaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
            {book.name} {chapter}
          </Text>
          <View
            style={[
              styles.translationChip,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <Text style={[styles.translationChipText, { color: colors.bibleSecondaryText }]}>
              {translationLabel}
            </Text>
          </View>
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

              setShowFontSizeSheet((current) => !current);
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
              onPress={togglePlayer}
            >
              <Ionicons
                name={showPlayer ? 'volume-high' : 'volume-medium-outline'}
                size={20}
                color={showPlayer ? colors.bibleAccent : colors.biblePrimaryText}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              audioEnabled && showPlayer && chapterPresentationMode === 'text' ? 28 : 40,
          },
        ]}
      >
        <View style={[styles.readerShell, { backgroundColor: colors.bibleBackground }]}>
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

      <View style={[styles.footerShell, { borderTopColor: colors.bibleDivider }]}>
        {audioEnabled && showPlayer && chapterPresentationMode === 'text' ? (
          <AudioPlayerBar
            bookId={bookId}
            chapter={chapter}
            onChapterChange={(newChapter) => {
              navigation.setParams({ chapter: newChapter, focusVerse: undefined });
            }}
          />
        ) : null}

        <View
          style={[
            styles.chapterRail,
            {
              borderTopColor:
                audioEnabled && showPlayer && chapterPresentationMode === 'text'
                  ? colors.bibleDivider
                  : 'transparent',
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.chapterButton,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
                opacity: hasPrevChapter ? 1 : 0.45,
              },
            ]}
            onPress={handlePrevChapter}
            disabled={!hasPrevChapter}
          >
            <Ionicons name="chevron-back" size={18} color={colors.biblePrimaryText} />
            <Text style={[styles.chapterButtonText, { color: colors.biblePrimaryText }]}>
              {t('common.previous')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.chapterButton,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
                opacity: hasNextChapter ? 1 : 0.45,
              },
            ]}
            onPress={handleNextChapter}
            disabled={!hasNextChapter}
          >
            <Text style={[styles.chapterButtonText, { color: colors.biblePrimaryText }]}>
              {t('common.next')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.biblePrimaryText} />
          </TouchableOpacity>
        </View>
      </View>
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
  title: {
    fontSize: 21,
    fontWeight: '700',
  },
  translationChip: {
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
  readerShell: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  readerColumn: {
    gap: 18,
  },
  readerBlock: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  chapterRail: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: 1,
  },
  chapterButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chapterButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
