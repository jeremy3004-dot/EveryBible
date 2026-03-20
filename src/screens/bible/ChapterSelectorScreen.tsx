import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { getBookById, getBookIcon } from '../../constants';
import { CompanionSection } from '../../components';
import { useTheme } from '../../contexts/ThemeContext';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import { useBibleStore, useProgressStore } from '../../stores';
import type { BibleStackParamList, ChapterSelectorScreenProps } from '../../navigation/types';
import type { BookCompanionCardModel } from './bookCompanionModel';
import { buildBookCompanionEmptyState, buildBookCompanionSections } from './bookCompanionModel';
import {
  CHAPTER_GRID_ROW_GAP,
  type ChapterLaunchMode,
  buildChapterGridRows,
  buildChapterLaunchParams,
  buildBookHubPresentation,
  getChapterGridItemSize,
} from './chapterSelectorModel';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

const { width } = Dimensions.get('window');
const ITEM_SIZE = getChapterGridItemSize(width);

export function ChapterSelectorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChapterSelectorScreenProps['route']>();
  const { bookId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();

  const currentBookId = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const setPreferredChapterLaunchMode = useBibleStore(
    (state) => state.setPreferredChapterLaunchMode
  );
  const chaptersRead = useProgressStore((state) => state.chaptersRead);

  const book = getBookById(bookId);
  if (!book) {
    return null;
  }

  const chapterRows = buildChapterGridRows(book.chapters);
  const bookHubPresentation = buildBookHubPresentation({
    book,
    chaptersRead,
    currentBookId,
    currentChapter,
  });
  const companionSections = buildBookCompanionSections(bookId);
  const companionEmptyState = buildBookCompanionEmptyState(book.name);
  const completedChapters = new Set(bookHubPresentation.completedChapters);

  const navigateToChapter = (chapter: number, preferredMode = preferredChapterLaunchMode) => {
    setPreferredChapterLaunchMode(preferredMode);
    trackBibleExperienceEvent({
      name: 'book_hub_chapter_opened',
      bookId,
      chapter,
      source: 'book-hub',
      mode: preferredMode,
    });
    navigation.navigate('BibleReader', buildChapterLaunchParams(bookId, chapter, preferredMode));
  };

  const handleModePress = (mode: ChapterLaunchMode) => {
    setPreferredChapterLaunchMode(mode);
  };

  const handleCompanionPress = (item: BookCompanionCardModel) => {
    setPreferredChapterLaunchMode(preferredChapterLaunchMode);
    trackBibleExperienceEvent({
      name: 'book_companion_opened',
      bookId: item.target.bookId,
      chapter: item.target.chapter,
      source: 'companion',
      mode: preferredChapterLaunchMode,
      detail: item.kind,
    });
    navigation.navigate('BibleReader', {
      ...buildChapterLaunchParams(
        item.target.bookId,
        item.target.chapter,
        preferredChapterLaunchMode
      ),
      focusVerse: item.target.focusVerse,
    });
  };

  const renderModePill = (mode: ChapterLaunchMode) => {
    const isSelected = preferredChapterLaunchMode === mode;

    return (
      <TouchableOpacity
        key={mode}
        style={[
          styles.modePill,
          {
            backgroundColor: isSelected ? colors.bibleControlBackground : 'transparent',
          },
        ]}
        onPress={() => handleModePress(mode)}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.modePillText,
            {
              color: isSelected ? colors.bibleBackground : colors.bibleSecondaryText,
            },
          ]}
        >
          {mode === 'listen' ? 'Listen' : 'Read'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderChapterRow = ({ item }: { item: number[] }) => (
    <View style={styles.row}>
      {item.map((chapter) => {
        const isContinueChapter = chapter === bookHubPresentation.continueChapter;
        const isCompleted = completedChapters.has(chapter);

        return (
          <TouchableOpacity
            key={chapter}
            style={[
              styles.chapterButton,
              {
                backgroundColor: isContinueChapter ? colors.bibleAccent : colors.bibleSurface,
                borderColor: isContinueChapter ? colors.bibleAccent : colors.bibleDivider,
              },
            ]}
            onPress={() => navigateToChapter(chapter)}
            activeOpacity={0.88}
          >
            <Text
              style={[
                styles.chapterNumber,
                {
                  color: isContinueChapter ? colors.bibleBackground : colors.biblePrimaryText,
                },
              ]}
            >
              {chapter}
            </Text>
            {isCompleted ? (
              <View
                style={[
                  styles.chapterBadge,
                  {
                    backgroundColor: isContinueChapter
                      ? `${colors.bibleBackground}22`
                      : `${colors.bibleAccent}18`,
                  },
                ]}
              >
                <Ionicons
                  name="checkmark"
                  size={10}
                  color={isContinueChapter ? colors.bibleBackground : colors.bibleAccent}
                />
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <FlashList
        data={chapterRows}
        renderItem={renderChapterRow}
        keyExtractor={(_, index) => `row-${index}`}
        estimatedItemSize={ITEM_SIZE + CHAPTER_GRID_ROW_GAP}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        extraData={{
          colors,
          preferredChapterLaunchMode,
          continueChapter: bookHubPresentation.continueChapter,
        }}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={[
                  styles.backButton,
                  {
                    backgroundColor: colors.bibleSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="chevron-back" size={22} color={colors.biblePrimaryText} />
              </TouchableOpacity>

              <View
                style={[
                  styles.modeSwitch,
                  {
                    backgroundColor: colors.bibleSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
              >
                {renderModePill('listen')}
                {renderModePill('read')}
              </View>
            </View>

            <LinearGradient
              colors={bookHubPresentation.palette.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <Image
                source={getBookIcon(book.id)}
                style={styles.heroWatermark}
                resizeMode="contain"
              />

              <View
                style={[
                  styles.heroIconWrap,
                  {
                    backgroundColor: `${bookHubPresentation.palette.tint}22`,
                    borderColor: `${bookHubPresentation.palette.tint}35`,
                  },
                ]}
              >
                <Image source={getBookIcon(book.id)} style={styles.bookIcon} resizeMode="contain" />
              </View>

              <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{book.name}</Text>
            </LinearGradient>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.biblePrimaryText }]}>
                {t('bible.chapters')}
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerContent}>
            {companionSections.length > 0 ? (
              companionSections.map((section) => (
                <CompanionSection
                  key={section.id}
                  section={section}
                  onPressItem={handleCompanionPress}
                />
              ))
            ) : (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.bibleSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.biblePrimaryText }]}>
                  {companionEmptyState.title}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.bibleSecondaryText }]}>
                  {companionEmptyState.body}
                </Text>
              </View>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  headerContent: {
    paddingTop: 10,
    paddingBottom: 20,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    flex: 1,
    maxWidth: 220,
    alignSelf: 'center',
  },
  modePill: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modePillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 30,
    padding: 24,
    overflow: 'hidden',
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  heroWatermark: {
    position: 'absolute',
    right: -30,
    bottom: -10,
    width: 250,
    height: 250,
    opacity: 0.16,
  },
  heroIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  bookIcon: {
    width: 44,
    height: 44,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    marginTop: 8,
  },
  sectionHeader: {
    gap: 0,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  chapterButton: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  chapterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: CHAPTER_GRID_ROW_GAP,
  },
  footerContent: {
    paddingTop: 18,
    gap: 24,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
