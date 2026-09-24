import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getTranslatedBookName } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { PassageReferenceTarget } from '../../../services/bible/referenceParser';
import { formatReferenceLabel, formatReferenceMeta } from './bibleBrowserModel';
import { browserStyles } from './browserStyles';

/** Shown in place of the book list when the query is a passage reference. */
export function ReferenceJumpCard({
  target,
  onPress,
}: {
  target: PassageReferenceTarget;
  onPress: (target: PassageReferenceTarget) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

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
          {formatReferenceLabel(target, getTranslatedBookName(target.bookId, t))}
        </Text>
        <Ionicons name="arrow-forward" size={18} color={colors.bibleSecondaryText} />
      </View>
      <Text style={[styles.meta, { color: colors.biblePrimaryText }]}>
        {formatReferenceMeta(target, t)}
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
