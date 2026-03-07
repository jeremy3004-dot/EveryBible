import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';
import { useTheme } from '../../contexts/ThemeContext';

interface CardSkeletonProps {
  showImage?: boolean;
  lines?: number;
}

export function CardSkeleton({ showImage = false, lines = 3 }: CardSkeletonProps) {
  const { colors } = useTheme();
  const lineWidths = ['100%', '85%', '60%', '75%', '90%'];

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      {showImage && <Skeleton width="100%" height={120} borderRadius={12} style={styles.image} />}
      <View style={styles.content}>
        <Skeleton width="60%" height={22} style={styles.title} />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            width={lineWidths[i % lineWidths.length] as `${number}%`}
            height={16}
            style={styles.line}
          />
        ))}
      </View>
    </View>
  );
}

interface StatCardSkeletonProps {
  count?: number;
}

export function StatCardSkeleton({ count = 4 }: StatCardSkeletonProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.statContainer, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.statCard}>
          <Skeleton width={40} height={32} borderRadius={8} style={styles.statValue} />
          <Skeleton width={50} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    marginBottom: 0,
  },
  content: {
    padding: 16,
  },
  title: {
    marginBottom: 12,
  },
  line: {
    marginBottom: 8,
  },
  statContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  statCard: {
    alignItems: 'center',
  },
  statValue: {
    marginBottom: 8,
  },
});
