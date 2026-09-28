import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';

interface FeedbackDecisionsOptions {
  translationId: string;
  passcode: string | null;
  enabled: boolean;
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
  enabled,
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
  const [context, setContext] = useState({ query, translationId, passcode, enabled });
  if (
    context.query !== query ||
    context.translationId !== translationId ||
    context.passcode !== passcode ||
    context.enabled !== enabled
  ) {
    setContext({ query, translationId, passcode, enabled });
    setMutating(false);
    setResolving(null);
    setResolveFailed(false);
  }
  const mounted = useRef(false);
  const active = useRef(false);
  const currentQuery = useRef(query);
  const session = useRef(0);
  const busy = useRef(false);
  const resolvingTarget = useRef<ResolvingTarget | null>(null);
  const invalidate = useCallback(() => {
    active.current = false;
    session.current += 1;
    busy.current = false;
    resolvingTarget.current = null;
  }, []);
  const cancel = useCallback(() => {
    invalidate();
    if (mounted.current) {
      setMutating(false);
      setResolving(null);
      setResolveFailed(false);
    }
  }, [invalidate]);
  const activate = useCallback(() => {
    active.current = true;
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    currentQuery.current = query;
    invalidate();
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [query, translationId, passcode, enabled, invalidate]);

  const captureOwner = () => {
    const currentSession = session.current;
    return () => {
      const access = useTranslatorReviewStore.getState();
      return (
        mounted.current &&
        active.current &&
        query === currentQuery.current &&
        currentSession === session.current &&
        enabled &&
        Boolean(passcode) &&
        access.enabled &&
        access.accessPasscode === passcode
      );
    };
  };
  const setBusy = (value: boolean) => {
    busy.current = value;
    setMutating(value);
  };

  // Reports success so the list can alert while the focused review, where an Alert
  // cannot show over its modal, reports inline instead.
  const resolve = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ): Promise<boolean | null> => {
    const isCurrent = captureOwner();
    if (!passcode || !isCurrent() || busy.current) return null;
    const note = notes[item.id]?.trim() ?? '';
    if (resolution && item.sentiment === 'down' && !note) return false;
    setBusy(true);
    const args = { apiVersion: 2 as const, passcode, translationId, feedbackId: item.id };
    const result = resolution
      ? await resolveTranslatorFeedbackOnServer({ ...args, resolution, note })
      : await reopenTranslatorFeedbackOnServer(args);
    if (!isCurrent()) return null;
    setBusy(false);
    if (!result.success) return false;
    void reload();
    return true;
  };

  const resolveFromList = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ) => {
    const isCurrent = captureOwner();
    const saved = await resolve(item, resolution);
    if (saved === null || !isCurrent()) return;
    if (!saved) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      return;
    }
    // The card leaves this list for the other status tab without a sound otherwise.
    announceForAccessibility(feedbackDecisionAnnouncement(t, item, resolution));
  };

  const reviewPositive = async () => {
    const isCurrent = captureOwner();
    if (!isCurrent() || busy.current) return;
    const input = query();
    setBusy(true);
    const preview = await reviewPositiveFeedbackBatch(input);
    if (!isCurrent()) return;
    setBusy(false);
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
        onPress: async () => {
          if (!isCurrent() || busy.current) return;
          setBusy(true);
          const result = await reviewPositiveFeedbackBatch(input, ids);
          if (!isCurrent()) return;
          setBusy(false);
          if (!result.success) Alert.alert(t('common.error'), t('common.unexpectedError'));
          else announceForAccessibility(t('feedback.reviewed'));
          await reload();
        },
      },
    ]);
  };

  // A concern needs its reason written down, so it opens the sheet; praise settles at once.
  const chooseResolution = (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution
  ) => {
    const isCurrent = captureOwner();
    if (!isCurrent() || busy.current) return;
    if (requiresResolutionNote(item)) {
      setResolveFailed(false);
      const target = { item, resolution };
      resolvingTarget.current = target;
      setResolving(target);
      return;
    }
    void resolveFromList(item, resolution);
  };

  const confirmResolution = async () => {
    const target = resolving;
    if (!target || resolvingTarget.current !== target) return;
    const isCurrent = captureOwner();
    const { item, resolution } = target;
    const saved = await resolve(item, resolution);
    if (saved === null || !isCurrent() || resolvingTarget.current !== target) return;
    if (saved) {
      resolvingTarget.current = null;
      setResolving(null);
      announceForAccessibility(feedbackDecisionAnnouncement(t, item, resolution));
    } else {
      setResolveFailed(true);
    }
  };

  const setResolvingNote = (value: string) => {
    const isCurrent = captureOwner();
    if (resolving && resolvingTarget.current === resolving && isCurrent()) {
      setNotes((previous) => ({ ...previous, [resolving.item.id]: value }));
    }
  };

  return {
    mutating,
    resolving,
    resolvingNote: resolving ? (notes[resolving.item.id] ?? '') : '',
    resolveFailed,
    setResolvingNote,
    closeResolving: () => {
      if (resolvingTarget.current !== resolving) return;
      resolvingTarget.current = null;
      setResolving(null);
    },
    cancel,
    activate,
    chooseResolution,
    confirmResolution,
    reopen: (item: ChapterFeedbackReviewItem) => resolveFromList(item, null),
    reviewPositive,
  };
}
