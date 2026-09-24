import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BookIcon } from '../../../components/bible/BookIcon';
import { getTranslatedBookName, type BibleBook } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import type { TranslatorFeedbackAggregateStatus } from '../../../services/feedback/translatorFeedbackReviewModel';
import { browserStyles } from './browserStyles';
import {
  BookChapterPanel,
  UnavailableBookNotice,
  type BookChapterPanelProps,
} from './BookChapterPanel';
import { TranslatorFeedbackBadge } from './TranslatorFeedbackBadge';

interface BibleBookRowProps {
  book: BibleBook;
  isAvailable: boolean;
  feedbackStatus: TranslatorFeedbackAggregateStatus | null;
  onPressBook: (bookId: string) => void;
  /**
   * Given only to the expanded row. Collapsed rows receive `undefined`, so a change
   * that only matters to the open book's chapter grid leaves them un-rendered.
   */
  panel: BookChapterPanelProps | undefined;
}

/** One book in the browser; expanded, it shows its chapter grid or a coming-soon note. */
export const BibleBookRow = memo(function BibleBookRow({
  book,
  isAvailable,
  feedbackStatus,
  onPressBook,
  panel,
}: BibleBookRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isExpanded = panel !== undefined;
  const bookInk = isAvailable ? colors.biblePrimaryText : colors.bibleSecondaryText;

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.bookRow,
          { borderBottomColor: colors.bibleDivider },
          !isAvailable && browserStyles.unavailable,
        ]}
        onPress={() => onPressBook(book.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityValue={isAvailable ? undefined : { text: t('bible.notAvailableYet') }}
      >
        <View style={styles.bookRowLeft}>
          <View style={styles.bookIconWrap}>
            <BookIcon bookId={book.id} style={styles.bookIcon} color={bookInk} />
            <TranslatorFeedbackBadge status={feedbackStatus} />
          </View>
          <Text style={[styles.bookName, { color: bookInk }]}>
            {getTranslatedBookName(book.id, t)}
          </Text>
        </View>
        <Ionicons
          name={isAvailable ? (isExpanded ? 'chevron-up' : 'chevron-down') : 'lock-closed'}
          size={20}
          color={colors.bibleSecondaryText}
        />
      </TouchableOpacity>

      {panel && !isAvailable && <UnavailableBookNotice bookId={book.id} />}
      {panel && isAvailable && <BookChapterPanel book={book} {...panel} />}
    </View>
  );
});

const styles = StyleSheet.create({
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookIcon: {
    width: 40,
    height: 40,
  },
  bookIconWrap: {
    width: 40,
    height: 40,
  },
  bookName: {
    fontSize: 18,
    fontWeight: '500',
  },
});
