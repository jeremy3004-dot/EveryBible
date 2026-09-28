import { useCallback, useLayoutEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RhythmComposerScreenProps } from '../../../navigation/types';
import { getLocalizedRhythmTitle } from '../../../services/plans/rhythmLocalization';
import { buildPresetRhythmItems, type RhythmPreset } from '../../../services/plans/rhythmPresets';
import type { ReadingPlanRhythm } from '../../../services/plans/types';
import { useReadingPlansStore } from '../../../stores/readingPlansStore';
import { useAuthStore } from '../../../stores/authStore';
import { mediumHaptic, successHaptic } from '../../../utils';
import { resolveRhythmErrorMessage } from './rhythmComposerModel';

type ComposerNavigation = RhythmComposerScreenProps['navigation'];

/**
 * Saving a preset as a new rhythm (or over the one being edited) and deleting
 * the edited rhythm. `applyPreset` is stable for a given rhythm, so the memoised
 * preset cards do not re-render when a filter changes.
 */
export function useRhythmComposerActions(
  currentRhythm: ReadingPlanRhythm | null,
  navigation: ComposerNavigation
) {
  const { t } = useTranslation();
  const createRhythm = useReadingPlansStore((state) => state.createRhythm);
  const updateRhythm = useReadingPlansStore((state) => state.updateRhythm);
  const deleteRhythm = useReadingPlansStore((state) => state.deleteRhythm);
  // Set once a preset is saved: the composer stays mounted and tappable through the
  // replace transition, and a second tap would save a second rhythm.
  const savedRef = useRef(false);
  const mountedRef = useRef(false);
  const deleteRequestRef = useRef(0);
  // Clear ownership during commit, before a new route can receive a press;
  // a passive effect would leave the old confirmation current until it runs.
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deleteRequestRef.current += 1;
    };
  }, [currentRhythm?.id]);

  const applyPreset = useCallback(
    (preset: RhythmPreset) => {
      if (savedRef.current) {
        return;
      }

      const input = {
        title: preset.title,
        slot: preset.slot,
        items: buildPresetRhythmItems(preset),
      };
      const result = currentRhythm ? updateRhythm(currentRhythm.id, input) : createRhythm(input);

      if (!result.success || !result.rhythm) {
        Alert.alert(
          t('common.error', { defaultValue: 'Error' }),
          resolveRhythmErrorMessage(result.error, t)
        );
        return;
      }

      savedRef.current = true;
      successHaptic();
      navigation.replace('RhythmDetail', { rhythmId: result.rhythm.id });
    },
    [createRhythm, currentRhythm, navigation, t, updateRhythm]
  );

  const confirmDelete = useCallback(() => {
    if (!currentRhythm || !mountedRef.current) {
      return;
    }
    const request = ++deleteRequestRef.current;
    const { user, authGeneration } = useAuthStore.getState();
    const ownerId = user?.uid ?? null;
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        mountedRef.current &&
        request === deleteRequestRef.current &&
        (current.user?.uid ?? null) === ownerId &&
        current.authGeneration === authGeneration
      );
    };

    Alert.alert(
      t('readingPlans.deleteRhythmConfirmTitle'),
      t('readingPlans.deleteRhythmConfirmBody', {
        title: getLocalizedRhythmTitle(currentRhythm.title, t),
      }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            if (!isCurrent()) return;
            mediumHaptic();
            deleteRhythm(currentRhythm.id);
            navigation.popToTop();
          },
        },
      ]
    );
  }, [currentRhythm, deleteRhythm, navigation, t]);

  return { applyPreset, confirmDelete };
}
