import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import type { FoundationDetailScreenProps } from '../../navigation/types';
import { layout, spacing, typography } from '../../design/system';

export function FoundationDetailScreen({ navigation }: FoundationDetailScreenProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>Foundation Detail</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>
          Foundation detail screen — coming in Plan 03.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.accentPrimary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  title: {
    ...typography.pageTitle,
  },
  body: {
    ...typography.body,
  },
  backButton: {
    paddingVertical: spacing.sm,
  },
  backText: {
    ...typography.bodyStrong,
  },
});
