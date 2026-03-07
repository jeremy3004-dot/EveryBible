import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  oldTestamentBooks,
  newTestamentBooks,
  type BibleBook,
  config,
  getBookIcon,
} from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import type { BibleStackParamList } from '../../navigation/types';
import type { BibleTranslation } from '../../types';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 56) / 2;

export function BibleBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [selectedTestament, setSelectedTestament] = useState<'OT' | 'NT'>('OT');
  const [showTranslationModal, setShowTranslationModal] = useState(false);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);

  const currentTranslationInfo = translations.find((translation) => translation.id === currentTranslation);
  const books = selectedTestament === 'OT' ? oldTestamentBooks : newTestamentBooks;

  const handleBookPress = (book: BibleBook) => {
    navigation.navigate('ChapterSelector', { bookId: book.id });
  };

  const handleTranslationSelect = (translation: BibleTranslation) => {
    setShowTranslationModal(false);

    if (translation.isDownloaded) {
      setCurrentTranslation(translation.id);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
  };

  const renderBookCard = ({ item }: { item: BibleBook }) => (
    <TouchableOpacity
      style={[
        styles.bookCard,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
      onPress={() => handleBookPress(item)}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.iconBadge,
          { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <Image
          source={getBookIcon(item.id)}
          style={styles.bookIcon}
          resizeMode="contain"
          tintColor={colors.biblePrimaryText}
        />
      </View>
      <Text style={[styles.bookName, { color: colors.biblePrimaryText }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.chapterCount, { color: colors.bibleSecondaryText }]}>
        {item.chapters} {t('bible.chapters')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{t('bible.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
            {currentTranslationInfo?.name || 'Berean Standard Bible'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.translationButton,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
          onPress={() => {
            if (config.features.multipleTranslations) {
              setShowTranslationModal(true);
            }
          }}
          activeOpacity={config.features.multipleTranslations ? 0.85 : 1}
        >
          <Ionicons name="book-outline" size={16} color={colors.bibleSecondaryText} />
          <Text style={[styles.translationButtonText, { color: colors.biblePrimaryText }]}>
            {currentTranslationInfo?.abbreviation || 'BSB'}
          </Text>
          {config.features.multipleTranslations ? (
            <Ionicons name="chevron-down" size={16} color={colors.bibleSecondaryText} />
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.toggleWrapper}>
        <View
          style={[
            styles.toggleContainer,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.toggleButton,
              selectedTestament === 'OT' && {
                backgroundColor: colors.bibleElevatedSurface,
              },
            ]}
            onPress={() => setSelectedTestament('OT')}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color:
                    selectedTestament === 'OT'
                      ? colors.biblePrimaryText
                      : colors.bibleSecondaryText,
                },
              ]}
            >
              {t('bible.oldTestament')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              selectedTestament === 'NT' && {
                backgroundColor: colors.bibleElevatedSurface,
              },
            ]}
            onPress={() => setSelectedTestament('NT')}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color:
                    selectedTestament === 'NT'
                      ? colors.biblePrimaryText
                      : colors.bibleSecondaryText,
                },
              ]}
            >
              {t('bible.newTestament')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={books}
        renderItem={renderBookCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />

      {config.features.multipleTranslations ? (
        <Modal
          visible={showTranslationModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTranslationModal(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
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
                <TouchableOpacity onPress={() => setShowTranslationModal(false)}>
                  <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.translationList} showsVerticalScrollIndicator={false}>
                {translations.map((translation) => {
                  const isSelected = currentTranslation === translation.id;
                  return (
                    <TouchableOpacity
                      key={translation.id}
                      style={[
                        styles.translationItem,
                        {
                          borderBottomColor: colors.bibleDivider,
                          backgroundColor: isSelected
                            ? colors.bibleElevatedSurface
                            : 'transparent',
                        },
                      ]}
                      onPress={() => handleTranslationSelect(translation)}
                    >
                      <View style={styles.translationInfo}>
                        <View style={styles.translationNameRow}>
                          <Text style={[styles.translationName, { color: colors.biblePrimaryText }]}>
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
                          {translation.isDownloaded ? (
                            <View style={styles.downloadedBadge}>
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color={colors.success}
                              />
                              <Text
                                style={[styles.downloadedText, { color: colors.success }]}
                              >
                                {t('bible.available')}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.downloadedBadge}>
                              <Ionicons
                                name="time-outline"
                                size={14}
                                color={colors.bibleSecondaryText}
                              />
                              <Text
                                style={[
                                  styles.downloadedText,
                                  { color: colors.bibleSecondaryText },
                                ]}
                              >
                                {t('common.comingSoon')}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={22} color={colors.bibleAccent} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  translationButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  translationButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
  },
  toggleButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bookCard: {
    width: CARD_WIDTH,
    minHeight: 152,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  bookIcon: {
    width: 28,
    height: 28,
  },
  bookName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 10,
  },
  chapterCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 20,
    maxHeight: '82%',
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
  translationList: {
    paddingHorizontal: 20,
  },
  translationItem: {
    minHeight: 88,
    borderBottomWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 18,
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
});
