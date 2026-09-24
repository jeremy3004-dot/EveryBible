import { useCallback, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import {
  fetchChapterFeedbackReviewSummaryForTranslation,
  TRANSLATION_NOT_COVERED,
  type TranslatorFeedbackAggregateStatus,
  type TranslatorFeedbackChapterSummary,
} from '../../../services/feedback';
import { useTranslatorFeedbackFocusRefresh } from '../useTranslatorFeedbackFocusRefresh';
import { buildBookFeedbackStatusMap, buildChapterSummaryMap } from './bibleBrowserModel';

/** Set when the passcode does not open the current translation; holds what it does open. */
export interface TranslatorNotCovered {
  coveredTranslationIds?: string[];
}

export interface TranslatorFeedbackSummariesState {
  summaries: TranslatorFeedbackChapterSummary[];
  summaryByChapter: Map<string, TranslatorFeedbackChapterSummary>;
  statusByBook: Map<string, TranslatorFeedbackAggregateStatus>;
  isLoading: boolean;
  error: string | null;
  notCovered: TranslatorNotCovered | null;
  reload: () => void;
}

/**
 * Translator-review badges for the browser. Loads on focus (and whenever the
 * translation or passcode changes), clears everything when review is off, and
 * discards a response that a newer request or a lost focus has superseded.
 */
export function useTranslatorFeedbackSummaries(
  translationId: string,
  enabled: boolean,
  passcode: string | null,
  t: TFunction
): TranslatorFeedbackSummariesState {
  const [summaries, setSummaries] = useState<TranslatorFeedbackChapterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notCovered, setNotCovered] = useState<TranslatorNotCovered | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !passcode) {
      requestIdRef.current += 1;
      setSummaries([]);
      setError(null);
      setNotCovered(null);
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    setNotCovered(null);

    const result = await fetchChapterFeedbackReviewSummaryForTranslation({
      translationId,
      passcode,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    setIsLoading(false);

    if (!result.success) {
      setSummaries([]);
      setError(t('common.unexpectedError'));
      setNotCovered(
        result.code === TRANSLATION_NOT_COVERED
          ? { coveredTranslationIds: result.coveredTranslationIds }
          : null
      );
      return;
    }

    setSummaries(result.chapters);
  }, [translationId, t, enabled, passcode]);

  useTranslatorFeedbackFocusRefresh(load, requestIdRef);

  const reload = useCallback(() => {
    void load();
  }, [load]);
  const summaryByChapter = useMemo(() => buildChapterSummaryMap(summaries), [summaries]);
  const statusByBook = useMemo(() => buildBookFeedbackStatusMap(summaries), [summaries]);

  return { summaries, summaryByChapter, statusByBook, isLoading, error, notCovered, reload };
}
