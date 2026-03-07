import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById, getBookIcon } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import type { BibleStackParamList, ChapterSelectorScreenProps } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 72) / 5;

export function ChapterSelectorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChapterSelectorScreenProps['route']>();
  const { bookId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();

  const book = getBookById(bookId);
  if (!book) {
    return null;
  }

  const chapters = Array.from({ length: book.chapters }, (_, index) => index + 1);

  const handleChapterPress = (chapter: number) => {
    navigation.navigate('BibleReader', { bookId, chapter });
  };

  const renderChapter = ({ item }: { item: number }) => (
    <TouchableOpacity
      style={[
        styles.chapterButton,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
      onPress={() => handleChapterPress(item)}
      activeOpacity={0.85}
    >
      <Text style={[styles.chapterNumber, { color: colors.biblePrimaryText }]}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.biblePrimaryText} />
        </TouchableOpacity>

        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <View
            style={[
              styles.heroIconWrap,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <Image
              source={getBookIcon(book.id)}
              style={styles.bookIcon}
              resizeMode="contain"
              tintColor={colors.biblePrimaryText}
            />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{book.name}</Text>
            <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
              {book.chapters} {t('bible.chapters')}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={chapters}
        renderItem={renderChapter}
        keyExtractor={(item) => item.toString()}
        numColumns={5}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookIcon: {
    width: 32,
    height: 32,
  },
  heroCopy: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 8,
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
    fontWeight: '700',
  },
});
