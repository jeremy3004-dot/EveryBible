import { useCallback, useRef, useState } from 'react';
import {
  fetchChapterFeedbackForTranslatorReview,
  TRANSLATION_NOT_COVERED,
  type ChapterFeedbackReviewItem,
  type FeedbackCategoryFilter,
  type FeedbackPageCursor,
  type FeedbackStatusFilter,
  type TranslatorFeedbackChapterSummary,
} from '../../../services/feedback';
import { mergeFeedbackPage, type FeedbackReviewQuery } from './feedbackReviewScreenModel';

interface FeedbackReviewListOptions {
  translationId: string;
  bookId: string;
  chapter: number;
  passcode: string | null;
  enabled: boolean;
}

/**
 * One chapter's feedback under the translator's filters, loaded a page at a time.
 * A newer load (or `cancel`) makes any response still in flight stale.
 */
export function useFeedbackReviewList({
  translationId,
  bookId,
  chapter,
  passcode,
  enabled,
}: FeedbackReviewListOptions) {
  const [category, setCategory] = useState<FeedbackCategoryFilter>('all');
  const [status, setStatus] = useState<FeedbackStatusFilter>('pending');
  const [positiveOnly, setPositiveOnly] = useState(false);
  const [items, setItems] = useState<ChapterFeedbackReviewItem[]>([]);
  const [summary, setSummary] = useState<TranslatorFeedbackChapterSummary | null>(null);
  const [positiveCount, setPositiveCount] = useState(0);
  const [cursor, setCursor] = useState<FeedbackPageCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set when this passcode does not open the translation; holds what it does open.
  const [notCovered, setNotCovered] = useState<{ coveredTranslationIds?: string[] } | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);

  const input = useCallback(
    (): FeedbackReviewQuery => ({
      apiVersion: 2,
      translationId,
      bookId,
      chapter,
      passcode: passcode ?? '',
      category,
      status,
      positiveOnly,
    }),
    [translationId, bookId, chapter, passcode, category, status, positiveOnly]
  );

  const load = useCallback(
    async (page: FeedbackPageCursor | null = null) => {
      if (!enabled || !passcode || (page && busy.current)) return;
      const request = ++requestId.current;
      busy.current = true;
      setLoading(true);
      setFailed(false);
      setNotCovered(null);
      if (!page) {
        setItems([]);
        setCursor(null);
      }
      const result = await fetchChapterFeedbackForTranslatorReview({ ...input(), cursor: page });
      if (request !== requestId.current) return;
      busy.current = false;
      setLoading(false);
      if (!result.success) {
        setFailed(true);
        if (result.code === TRANSLATION_NOT_COVERED) {
          setNotCovered({ coveredTranslationIds: result.coveredTranslationIds });
        }
        return;
      }
      setItems((previous) => mergeFeedbackPage(previous, result.feedback, !!page));
      setSummary(result.summary ?? null);
      setPositiveCount(result.positiveCount ?? 0);
      setCursor(result.nextCursor ?? null);
    },
    [enabled, passcode, input]
  );

  const cancel = useCallback(() => {
    ++requestId.current;
    busy.current = false;
  }, []);

  return {
    category,
    setCategory,
    status,
    setStatus,
    positiveOnly,
    setPositiveOnly,
    items,
    summary,
    positiveCount,
    cursor,
    loading,
    failed,
    notCovered,
    input,
    load,
    cancel,
  };
}
