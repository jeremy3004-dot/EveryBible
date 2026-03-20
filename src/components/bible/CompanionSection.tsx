import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { BookCompanionCardModel, BookCompanionSectionModel } from '../../screens/bible/bookCompanionModel';
import { CompanionCard } from './CompanionCard';

interface CompanionSectionProps {
  section: BookCompanionSectionModel;
  onPressItem: (item: BookCompanionCardModel) => void;
}

export function CompanionSection({ section, onPressItem }: CompanionSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{section.title}</Text>
        {section.description ? (
          <Text style={[styles.description, { color: colors.bibleSecondaryText }]}>
            {section.description}
          </Text>
        ) : null}
      </View>

      {section.layout === 'stack' ? (
        <View style={styles.stack}>
          {section.items.map((item) => (
            <CompanionCard key={item.id} item={item} onPress={onPressItem} />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {section.items.map((item) => (
            <CompanionCard key={item.id} item={item} onPress={onPressItem} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  stack: {
    gap: 12,
  },
  carousel: {
    gap: 12,
    paddingRight: 20,
  },
});
