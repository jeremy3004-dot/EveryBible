import React, { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing } from '../../design/system';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import type { RhythmDetailScreenProps } from '../../navigation/types';
import { useAudioStore } from '../../stores/audioStore';
import { useBibleStore } from '../../stores/bibleStore';
import { lightHaptic } from '../../utils';
import {
  buildRhythmReaderParams,
  RhythmDetailHeader,
  RhythmSequenceSection,
  RhythmStatusView,
  RhythmSummaryCard,
  useRhythmSession,
} from './rhythmDetail';

export function RhythmDetailScreen({ navigation, route }: RhythmDetailScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rhythmId = route.params.rhythmId;
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const { rhythm, session, segments, planTally, hasActiveSegments, loading, error } =
    useRhythmSession(rhythmId);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleEdit = useCallback(() => {
    navigation.navigate('RhythmComposer', { rhythmId });
  }, [navigation, rhythmId]);

  const handleContinue = useCallback(() => {
    if (!rootNavigationRef.isReady()) {
      return;
    }
    const params = buildRhythmReaderParams(
      session,
      preferredChapterLaunchMode,
      useAudioStore.getState().status
    );
    if (!params) {
      return;
    }

    lightHaptic();
    rootNavigationRef.navigate('Bible', { screen: 'BibleReader', params });
  }, [preferredChapterLaunchMode, session]);

  if (loading) {
    return <RhythmStatusView status="loading" />;
  }

  if (error || !rhythm) {
    return (
      <RhythmStatusView
        status="error"
        message={error ?? t('common.error', { defaultValue: 'Error' })}
        onBack={handleBack}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <RhythmDetailHeader rhythm={rhythm} onBack={handleBack} onEdit={handleEdit} />
        <RhythmSummaryCard
          totalItemCount={rhythm.items.length}
          planTally={planTally}
          hasActiveSegments={hasActiveSegments}
          nextTitle={segments[0]?.title ?? null}
        />
        <RhythmSequenceSection
          segments={segments}
          hasActiveSegments={hasActiveSegments}
          onContinue={handleContinue}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
});
