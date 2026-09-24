import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { getTranslatedBookName } from '../../constants';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import { getChapterReviewHeadline, type ChapterFeedbackReviewItem } from '../../services/feedback';
import { FeedbackResolveSheet, FeedbackResponseCard } from '../../components/feedback';
import { AppButton, BackArrowIcon, IconButton } from '../../components/ui';
import type { BibleStackParamList } from '../../navigation/types';
import { FeedbackReviewHeader } from './feedbackReview/FeedbackReviewHeader';
import { FeedbackSourceSheet } from './feedbackReview/FeedbackSourceSheet';
import {
  getSourceFilterLabelKey,
  shouldShowNoMatching,
} from './feedbackReview/feedbackReviewScreenModel';
import { useFeedbackDecisions } from './feedbackReview/useFeedbackDecisions';
import { useFeedbackReviewList } from './feedbackReview/useFeedbackReviewList';
import { useFeedbackVoiceNote } from './feedbackReview/useFeedbackVoiceNote';

type Props = NativeStackScreenProps<BibleStackParamList, 'ChapterFeedbackReview'>;

/**
 * A translator's reading list of one chapter's feedback in one translation: filter
 * it, listen to voice notes, and mark each item addressed or reviewed. Loading,
 * playback and decisions live in ./feedbackReview.
 */
export function ChapterFeedbackReviewScreen({ route, navigation }: Props) {
  const { translationId, bookId, chapter } = route.params;
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const passcode = useTranslatorReviewStore((state) => state.accessPasscode);
  const enabled = useTranslatorReviewStore((state) => state.enabled);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const list = useFeedbackReviewList({ translationId, bookId, chapter, passcode, enabled });
  const { load, cancel, input, items, cursor, loading } = list;
  const voiceNote = useFeedbackVoiceNote(input);
  const stopVoiceNote = voiceNote.stop;
  const decisions = useFeedbackDecisions({ translationId, passcode, query: input, reload: load });
  const chapterLabel = `${getTranslatedBookName(bookId, t)} ${chapter}`;

  // A filter change rebuilds `load`, so it also stops the voice note and refetches.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        cancel();
        stopVoiceNote();
      };
    }, [load, cancel, stopVoiceNote])
  );

  const headline = getChapterReviewHeadline(list.summary, loading);
  const reload = () => {
    void load();
  };

  const renderItem = ({ item }: { item: ChapterFeedbackReviewItem }) => (
    <FeedbackResponseCard
      item={item}
      language={i18n.language}
      isPlaying={voiceNote.playing === item.id}
      busy={decisions.mutating}
      onPlay={() => {
        void voiceNote.play(item);
      }}
      onResolve={(resolution) => decisions.chooseResolution(item, resolution)}
      onReopen={() => {
        void decisions.reopen(item);
      }}
    />
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <IconButton
          icon={BackArrowIcon}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.primaryText }]}
            numberOfLines={2}
          >
            {chapterLabel}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {t('feedback.title')}
          </Text>
        </View>
      </View>
      {enabled ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            <FeedbackReviewHeader
              translationId={translationId}
              headline={headline}
              status={list.status}
              onChangeStatus={list.setStatus}
              sourceLabelKey={getSourceFilterLabelKey(list.category)}
              onOpenSourcePicker={() => setSourcePickerOpen(true)}
              positiveOnly={list.positiveOnly}
              positiveCount={list.positiveCount}
              onChangePositiveOnly={list.setPositiveOnly}
              mutating={decisions.mutating}
              onReviewPositive={() => {
                void decisions.reviewPositive();
              }}
              notCovered={list.notCovered}
              failed={list.failed}
              onRetry={reload}
              onSwitchedTranslation={() => navigation.goBack()}
            />
          }
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
          refreshControl={
            <RefreshControl refreshing={loading && !items.length} onRefresh={reload} />
          }
          onEndReached={() => {
            if (cursor) void load(cursor);
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            shouldShowNoMatching({ ...list, headline }) ? (
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                {t('feedback.noMatching')}
              </Text>
            ) : null
          }
          ListFooterComponent={
            // The first load already shows the pull-to-refresh spinner; this one is for later pages.
            loading && items.length > 0 ? (
              <ActivityIndicator color={colors.accentPrimary} />
            ) : cursor ? (
              <AppButton
                label={t('common.continue')}
                variant="outline"
                size="md"
                onPress={() => {
                  void load(cursor);
                }}
              />
            ) : null
          }
        />
      ) : (
        <Text style={[styles.body, styles.content, { color: colors.secondaryText }]}>
          {t('settings.translatorAccessSummaryOff')}
        </Text>
      )}

      <FeedbackSourceSheet
        visible={sourcePickerOpen}
        category={list.category}
        onChoose={(category) => {
          list.setCategory(category);
          setSourcePickerOpen(false);
        }}
        onClose={() => setSourcePickerOpen(false)}
      />

      <FeedbackResolveSheet
        target={decisions.resolving}
        note={decisions.resolvingNote}
        onChangeNote={decisions.setResolvingNote}
        busy={decisions.mutating}
        failed={decisions.resolveFailed}
        onConfirm={() => {
          void decisions.confirmResolution();
        }}
        onClose={decisions.closeResolving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  titleBlock: { flexShrink: 1 },
  title: { ...typography.sectionTitle },
  subtitle: { ...typography.caption },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  body: { ...typography.body },
});
