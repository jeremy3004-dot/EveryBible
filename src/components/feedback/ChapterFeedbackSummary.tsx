import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import {
  fetchChapterFeedbackReviewSummaryForTranslation,
  type TranslatorFeedbackChapterSummary,
} from '../../services/feedback';
import type { BibleStackParamList } from '../../navigation/types';

export function ChapterFeedbackSummary({
  translationId,
  bookId,
  chapter,
}: {
  translationId: string;
  bookId: string;
  chapter: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<BibleStackParamList>>();
  const enabled = useTranslatorReviewStore((state) => state.enabled);
  const passcode = useTranslatorReviewStore((state) => state.accessPasscode);
  const [summary, setSummary] = useState<TranslatorFeedbackChapterSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refresh;
      if (!enabled || !passcode) return;
      setLoading(true);
      setFailed(false);
      void fetchChapterFeedbackReviewSummaryForTranslation({
        translationId,
        bookId,
        passcode,
      }).then((result) => {
        if (!active) return;
        setLoading(false);
        setFailed(!result.success);
        setSummary(result.chapters.find((item) => item.chapter === chapter) ?? null);
      });
      return () => {
        active = false;
      };
    }, [translationId, bookId, chapter, enabled, passcode, refresh])
  );
  if (!enabled) return null;
  const pending = (summary?.unresolvedDown ?? 0) + (summary?.unresolvedUp ?? 0);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
      ]}
    >
      <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{t('feedback.title')}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accentPrimary} />
      ) : failed ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setRefresh((value) => value + 1)}
        >
          <Text style={{ color: colors.error }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={{ color: colors.bibleSecondaryText }}>
            {summary?.total
              ? t('bible.translatorReviewSummary', { count: summary.total, pending })
              : t('bible.translatorReviewEmpty')}
          </Text>
          {!!summary?.total && pending === 0 && (
            <Text style={{ color: colors.bibleSecondaryText }}>{t('feedback.complete')}</Text>
          )}
          {!!summary?.total && (
            <Text style={{ color: colors.bibleSecondaryText }}>
              {t('feedback.community')}: {summary.community ?? 0} · {t('feedback.council')}:{' '}
              {summary.council ?? 0}
            </Text>
          )}
        </>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.link}
        onPress={() =>
          navigation.navigate('ChapterFeedbackReview', { translationId, bookId, chapter })
        }
      >
        <Text style={[styles.title, { color: colors.accentPrimary }]}>
          {t('feedback.reviewFeedback')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  link: { minHeight: 44, justifyContent: 'center' },
});
