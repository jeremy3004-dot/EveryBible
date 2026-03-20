import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getBookIcon } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import type { BookCompanionCardModel } from '../../screens/bible/bookCompanionModel';

interface CompanionCardProps {
  item: BookCompanionCardModel;
  onPress: (item: BookCompanionCardModel) => void;
}

export function CompanionCard({ item, onPress }: CompanionCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.88}
    >
      <View
        style={[
          styles.artwork,
          {
            backgroundColor: colors.bibleElevatedSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <Image source={getBookIcon(item.target.bookId)} style={styles.artworkIcon} resizeMode="contain" />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.meta, { color: colors.bibleAccent }]} numberOfLines={1}>
          {item.meta}
        </Text>
        <Text style={[styles.title, { color: colors.biblePrimaryText }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.summary, { color: colors.bibleSecondaryText }]} numberOfLines={3}>
          {item.summary}
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]}>
          {item.actionLabel}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.bibleSecondaryText} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 14,
    width: 220,
  },
  artwork: {
    height: 112,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkIcon: {
    width: 56,
    height: 56,
  },
  copy: {
    gap: 6,
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
