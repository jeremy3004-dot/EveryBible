import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  requiresResolutionNote,
  resolveTranslatorFeedbackOnServer,
  reopenTranslatorFeedbackOnServer,
  reviewPositiveFeedbackBatch,
  type ChapterFeedbackReviewItem,
  type TranslatorFeedbackResolution,
} from '../../../services/feedback';
import { feedbackDecisionAnnouncement } from '../../../components/feedback/feedbackResponseAccessibility';
import { announceForAccessibility } from '../../../utils/a11y';
import type { FeedbackReviewQuery } from './feedbackReviewScreenModel';

interface FeedbackDecisionsOptions {
  translationId: string;
  passcode: string | null;
  query: () => FeedbackReviewQuery;
  reload: () => Promise<void>;
}

export interface ResolvingTarget {
  item: ChapterFeedbackReviewItem;
  resolution: TranslatorFeedbackResolution;
}

/**
 * The translator's decisions on feedback: settle or reopen one item (a concern needs
 * a written reason, collected in the resolve sheet), or mark every accurate-without-
 * comment item reviewed at once. Each saved decision reloads the list.
 */
export function useFeedbackDecisions({
  translationId,
  passcode,
  query,
  reload,
}: FeedbackDecisionsOptions) {
  const { t } = useTranslation();
  const [mutating, setMutating] = useState(false);
  // Reasons typed per item, kept while the sheet is closed and reopened.
  const [notes, setNotes] = useState<Record<string, string>>({});
  // The item a translator is settling while the reason sheet is open.
  const [resolving, setResolving] = useState<ResolvingTarget | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);

  // Reports success so the list can alert while the focused review, where an Alert
  // cannot show over its modal, reports inline instead.
  const resolve = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ): Promise<boolean> => {
    if (!passcode || mutating) return false;
    const note = notes[item.id]?.trim() ?? '';
    if (resolution && item.sentiment === 'down' && !note) return false;
    setMutating(true);
    const args = { apiVersion: 2 as const, passcode, translationId, feedbackId: item.id };
    const result = resolution
      ? await resolveTranslatorFeedbackOnServer({ ...args, resolution, note })
      : await reopenTranslatorFeedbackOnServer(args);
    setMutating(false);
    if (!result.success) return false;
    void reload();
    return true;
  };

  const resolveFromList = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ) => {
    if (!(await resolve(item, resolution))) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      return;
    }
    // The card leaves this list for the other status tab without a sound otherwise.
    announceForAccessibility(feedbackDecisionAnnouncement(t, item, resolution));
  };

  const reviewPositive = async () => {
    if (mutating) return;
    setMutating(true);
    const preview = await reviewPositiveFeedbackBatch(query());
    setMutating(false);
    if (!preview.success) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      return;
    }
    const ids = preview.feedbackIds ?? [];
    if (!ids.length) {
      await reload();
      return;
    }
    // Freeze the preview's exact IDs. New feedback is never silently included.
    Alert.alert(t('feedback.markReviewed'), t('feedback.bulkConfirm', { count: ids.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('feedback.markReviewed'),
        onPress: () => {
          setMutating(true);
          void reviewPositiveFeedbackBatch(query(), ids).then(async (result) => {
            setMutating(false);
            if (!result.success) Alert.alert(t('common.error'), t('common.unexpectedError'));
            else announceForAccessibility(t('feedback.reviewed'));
            await reload();
          });
        },
      },
    ]);
  };

  // A concern needs its reason written down, so it opens the sheet; praise settles at once.
  const chooseResolution = (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution
  ) => {
    if (requiresResolutionNote(item)) {
      setResolveFailed(false);
      setResolving({ item, resolution });
      return;
    }
    void resolveFromList(item, resolution);
  };

  const confirmResolution = async () => {
    if (!resolving) return;
    const { item, resolution } = resolving;
    if (await resolve(item, resolution)) {
      setResolving(null);
      announceForAccessibility(feedbackDecisionAnnouncement(t, item, resolution));
    } else {
      setResolveFailed(true);
    }
  };

  const setResolvingNote = (value: string) => {
    if (resolving) {
      setNotes((previous) => ({ ...previous, [resolving.item.id]: value }));
    }
  };

  return {
    mutating,
    resolving,
    resolvingNote: resolving ? (notes[resolving.item.id] ?? '') : '',
    resolveFailed,
    setResolvingNote,
    closeResolving: () => setResolving(null),
    chooseResolution,
    confirmResolution,
    reopen: (item: ChapterFeedbackReviewItem) => resolveFromList(item, null),
    reviewPositive,
  };
}
