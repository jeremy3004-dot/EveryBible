import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalToday } from '../../../hooks/useLocalToday';
import { buildRhythmReaderSession } from '../../../services/plans/readingPlanActivity';
import { useLibraryStore } from '../../../stores/libraryStore';
import { useProgressStore } from '../../../stores/progressStore';
import { useReadingPlansStore } from '../../../stores/readingPlansStore';
import {
  buildPlanTitleById,
  buildRhythmSegmentViewModels,
  getRhythmPlanIds,
  hasActiveRhythmSegments,
  tallyRhythmPlans,
  type RhythmSegmentViewModel,
} from './rhythmDetailModel';
import { useRhythmDetailData } from './useRhythmDetailData';

/**
 * The rhythm on screen and the reading session it makes today: its sequence
 * cards, the plan tally and whether Continue Rhythm has anywhere to go.
 */
export function useRhythmSession(rhythmId: string) {
  const { t } = useTranslation();
  // A calendar plan's day in the rhythm follows the date, including overnight.
  const today = useLocalToday();

  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);
  const getPlanDayResume = useReadingPlansStore((state) => state.getPlanDayResume);
  // Subscribed, not read through getRhythm(): an edit made in the composer has to
  // reach this screen, which stays mounted underneath the detail the composer opens.
  const rhythm = useReadingPlansStore((state) => state.rhythmsById[rhythmId] ?? null);
  const planIds = useMemo(() => getRhythmPlanIds(rhythm), [rhythm]);

  const { allPlans, planEntriesById, loading, error } = useRhythmDetailData(planIds);

  const planTitleById = useMemo(() => buildPlanTitleById(allPlans, t), [allPlans, t]);

  const session = useMemo(
    () =>
      rhythm
        ? buildRhythmReaderSession({
            rhythm,
            planEntriesById,
            progressByPlanId,
            planTitlesById: planTitleById,
            getPlanDayResume,
            today,
          })
        : null,
    [getPlanDayResume, planEntriesById, planTitleById, progressByPlanId, rhythm, today]
  );

  const segments = useMemo<RhythmSegmentViewModel[]>(
    () =>
      session
        ? buildRhythmSegmentViewModels({
            session,
            allPlans,
            planEntriesById,
            progressByPlanId,
            planTitleById,
            chaptersRead,
            listeningHistory,
            today,
            t,
          })
        : [],
    [
      allPlans,
      chaptersRead,
      listeningHistory,
      planEntriesById,
      planTitleById,
      progressByPlanId,
      session,
      t,
      today,
    ]
  );

  return {
    rhythm,
    session,
    segments,
    planTally: tallyRhythmPlans(planIds, progressByPlanId),
    hasActiveSegments: hasActiveRhythmSegments(session),
    loading,
    error,
  };
}
