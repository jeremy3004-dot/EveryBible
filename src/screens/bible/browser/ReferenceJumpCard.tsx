import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getTranslatedPassageBookName } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { PassageReferenceTarget } from '../../../services/bible/referenceParser';
import { formatReferenceLabel, formatReferenceMeta } from './bibleBrowserModel';
import { browserStyles } from './browserStyles';
import { useReferenceVersePreview } from './useReferenceVersePreview';

/** Shown in place of the book list when the query is a passage reference. */
export function ReferenceJumpCard({
  target,
  translationId,
  onPress,
}: {
  target: PassageReferenceTarget;
  /** The translation the verse text preview is read from. */
  translationId: string;
  onPress: (target: PassageReferenceTarget) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const versePreview = useReferenceVersePreview(target, translationId);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={() => onPress(target)}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <View style={browserStyles.resultHeader}>
        <Text style={[browserStyles.resultReference, { color: colors.bibleAccent }]}>
          {formatReferenceLabel(target, getTranslatedPassageBookName(target.bookId, t))}
        </Text>
        <Ionicons name="arrow-forward" size={18} color={colors.bibleSecondaryText} />
      </View>
      <Text
        style={[styles.meta, { color: colors.biblePrimaryText }]}
        numberOfLines={versePreview ? 4 : undefined}
      >
        {versePreview ?? formatReferenceMeta(target, t)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  meta: {
    ...typography.label,
  },
});
