import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, typography } from '../../design/system';
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
          decelerationRate="fast"
          snapToInterval={232}
          style={styles.carouselScroller}
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
    ...typography.sectionTitle,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  stack: {
    gap: 12,
  },
  carouselScroller: {
    marginHorizontal: -layout.screenPadding,
  },
  carousel: {
    gap: 12,
    paddingHorizontal: layout.screenPadding,
  },
});
