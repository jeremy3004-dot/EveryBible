import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { getTopCrossReferences } from '../../services/bible/crossReferenceService';
import { getTranslatedBookName } from '../../constants/books';

interface CrossReferencePanelProps {
  /** Book ID of the currently selected verse (e.g. 'JHN'). */
  bookId: string;
  /** Chapter number (1-based). */
  chapter: number;
  /** Verse number (1-based). */
  verse: number;
  /** Called when the user taps a cross-reference entry. */
  onPressReference?: (bookId: string, chapter: number, verse: number) => void;
  /** Maximum number of cross-references to display (default 5). */
  limit?: number;
}

/**
 * CrossReferencePanel
 *
 * Renders a compact list of related verses for the currently selected verse.
 * Intended to be dropped into BibleReaderScreen as a companion panel once the
 * verse-selection UX is wired up.
 *
 * NOTE: Cross-reference data is currently powered by a 28-entry sample dataset.
 * See crossReferenceService.ts for the TODO on importing the full OpenBible.info
 * dataset.
 */
export function CrossReferencePanel({
  bookId,
  chapter,
  verse,
  onPressReference,
  limit = 5,
}: CrossReferencePanelProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const refs = getTopCrossReferences(bookId, chapter, verse, limit);

  if (refs.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.bibleSecondaryText }]}>
        {t('bible.relatedVerses')}
      </Text>

      {refs.map((ref) => {
        const label = `${getTranslatedBookName(ref.toBook, t)} ${ref.toChapter}:${ref.toVerse}`;

        return (
          <TouchableOpacity
            key={`${ref.toBook}-${ref.toChapter}-${ref.toVerse}`}
            style={[
              styles.row,
              {
                backgroundColor: colors.bibleSurface,
                borderBottomColor: colors.bibleDivider,
              },
            ]}
            onPress={() => onPressReference?.(ref.toBook, ref.toChapter, ref.toVerse)}
            activeOpacity={0.75}
            disabled={!onPressReference}
            accessibilityRole="button"
          >
            <Text style={[styles.referenceLabel, { color: colors.biblePrimaryText }]}>{label}</Text>
            {onPressReference ? (
              <Ionicons name="chevron-forward" size={14} color={colors.bibleSecondaryText} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  referenceLabel: {
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
