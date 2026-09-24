import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Testament } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';

/** The ruled heading that opens a testament in the book list. */
export const TestamentDivider = memo(function TestamentDivider({
  testament,
}: {
  testament: Testament;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();

  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: colors.bibleDivider }]} />
      <Text
        accessibilityRole="header"
        style={[styles.dividerLabel, displayFont.regular, { color: colors.bibleSecondaryText }]}
      >
        {t(testament === 'NT' ? 'bible.newTestament' : 'bible.oldTestament')}
      </Text>
      <View style={[styles.dividerLine, { backgroundColor: colors.bibleDivider }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 10,
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    ...typography.eyebrow,
  },
});
