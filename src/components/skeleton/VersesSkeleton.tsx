import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';
import { useTheme } from '../../contexts/ThemeContext';

interface VersesSkeletonProps {
  count?: number;
}

export function VersesSkeleton({ count = 8 }: VersesSkeletonProps) {
  const { colors } = useTheme();
  // Pre-calculate widths to avoid impure function calls during render
  const verseWidths = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        line1: `${85 + (((i * 17) % 15) + 1)}%` as const,
        line2: `${60 + (((i * 23) % 25) + 1)}%` as const,
        line3: `${40 + (((i * 31) % 30) + 1)}%` as const,
      })),
    [count]
  );

  return (
    <View style={styles.container}>
      {verseWidths.map((widths, index) => (
        <View key={index} style={styles.verse}>
          <View style={styles.verseNumber}>
            <Skeleton width={14} height={12} borderRadius={3} color={colors.bibleDivider} />
          </View>
          <View style={styles.verseContent}>
            <Skeleton
              width={widths.line1}
              height={16}
              color={colors.bibleDivider}
              style={styles.line}
            />
            {index % 2 === 0 && (
              <Skeleton
                width={widths.line2}
                height={16}
                color={colors.bibleDivider}
                style={styles.line}
              />
            )}
            {index % 3 === 0 && (
              <Skeleton
                width={widths.line3}
                height={16}
                color={colors.bibleDivider}
                style={styles.line}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  verse: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  verseNumber: {
    marginRight: 12,
    marginTop: 2,
  },
  verseContent: {
    flex: 1,
  },
  line: {
    marginBottom: 12,
  },
});
