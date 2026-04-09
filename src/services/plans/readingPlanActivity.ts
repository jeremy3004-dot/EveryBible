import type { ListeningHistoryEntry } from '../../stores/libraryModel';
import type { AudioPlaybackSequenceEntry } from '../../types';
import type {
  ReadingPlanDayResume,
  ReadingPlanEntry,
  ReadingPlanRhythm,
  ReadingPlanRhythmSession,
  ReadingPlanRhythmSessionSegment,
  UserReadingPlanProgress,
} from './types';
import { formatLocalDateKey } from '../progress/readingActivity';

export type PlanChapterActivitySource = 'read' | 'listen';

export interface PlanChapterActivityRecord {
  chapterKey: string;
  timestamp: number;
  source: PlanChapterActivitySource;
  progress: number | null;
}

export interface MergeTodayChapterActivityInput {
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  now?: Date;
  listenCompletionThreshold?: number;
}

export interface PlanDayCompletionSummary {
  targetChapterKeys: string[];
  completedChapterKeys: string[];
  completedActivity: PlanChapterActivityRecord[];
  totalChapters: number;
  completedChapters: number;
  isComplete: boolean;
}

export interface CurrentPlanDaySummary {
  dayNumber: number;
  dateKey: string;
  targetChapterKeys: string[];
  completedChapterKeys: string[];
  targetChapterCount: number;
  completedChapterCount: number;
  remainingChapterCount: number;
  isComplete: boolean;
}

export interface PlanChapterListenStatus {
  currentChapterListenCountedAt: number | null;
  alreadyCountedForPlan: boolean;
}

export interface BuildRhythmReaderSessionInput {
  rhythm: ReadingPlanRhythm;
  planEntriesById: Record<string, ReadingPlanEntry[]>;
  progressByPlanId?: Record<string, UserReadingPlanProgress | null | undefined>;
  planTitlesById?: Record<string, string>;
  getPlanDayResume?: (planId: string, dayNumber: number) => ReadingPlanDayResume | null;
}

export interface BuildRhythmReaderSessionResult {
  sessionContext: ReadingPlanRhythmSession;
  playbackSequenceEntries: AudioPlaybackSequenceEntry[];
  startEntry: AudioPlaybackSequenceEntry | null;
  startSegment: ReadingPlanRhythmSessionSegment | null;
}

export interface ReadingPlanRhythmSummary {
  planCount: number;
  completedPlanCount: number;
  remainingPlanCount: number;
}

const DEFAULT_LISTEN_COMPLETION_THRESHOLD = 0.98;
export const PLAN_LISTEN_COMPLETION_THRESHOLD = DEFAULT_LISTEN_COMPLETION_THRESHOLD;

const buildChapterKey = (bookId: string, chapter: number): string => `${bookId}_${chapter}`;

const isSameLocalDay = (timestamp: number, dayKey: string): boolean =>
  formatLocalDateKey(new Date(timestamp)) === dayKey;

export function expandPlanDayChapterKeys(entries: ReadingPlanEntry[]): string[] {
  const chapterKeys: string[] = [];

  for (const entry of entries) {
    const end = entry.chapter_end ?? entry.chapter_start;

    for (let chapter = entry.chapter_start; chapter <= end; chapter += 1) {
      chapterKeys.push(buildChapterKey(entry.book, chapter));
    }
  }

  return chapterKeys;
}

export function buildPlanDayPlaybackSequenceEntries(
  entries: ReadingPlanEntry[]
): AudioPlaybackSequenceEntry[] {
  return entries.flatMap((entry) => {
    const endChapter = entry.chapter_end ?? entry.chapter_start;
    const chapterEntries: AudioPlaybackSequenceEntry[] = [];

    for (let chapter = entry.chapter_start; chapter <= endChapter; chapter += 1) {
      chapterEntries.push({
        bookId: entry.book,
        chapter,
      });
    }

    return chapterEntries;
  });
}

export function resolvePlanDayPlaybackStartEntry(
  entries: ReadingPlanEntry[],
  resumeTarget?: AudioPlaybackSequenceEntry | null
): AudioPlaybackSequenceEntry | null {
  const playbackEntries = buildPlanDayPlaybackSequenceEntries(entries);
  if (playbackEntries.length === 0) {
    return null;
  }

  if (!resumeTarget) {
    return playbackEntries[0] ?? null;
  }

  return (
    playbackEntries.find(
      (entry) => entry.bookId === resumeTarget.bookId && entry.chapter === resumeTarget.chapter
    ) ?? playbackEntries[0] ?? null
  );
}

const getUniqueDayEntries = (entries: ReadingPlanEntry[], dayNumber: number): ReadingPlanEntry[] =>
  entries
    .filter((entry) => entry.day_number === dayNumber)
    .sort((a, b) => a.id.localeCompare(b.id));

export function getPlanDayTargetChapterKeys(
  entries: ReadingPlanEntry[],
  dayNumber: number
): string[] {
  return expandPlanDayChapterKeys(getUniqueDayEntries(entries, dayNumber));
}

function getPlanTotalDayCount(entries: ReadingPlanEntry[]): number {
  return entries.reduce((maxDay, entry) => Math.max(maxDay, entry.day_number), 0);
}

function getRhythmDayNumber(entries: ReadingPlanEntry[], progress?: UserReadingPlanProgress): number {
  const totalDays = getPlanTotalDayCount(entries);
  const currentDay = Math.max(progress?.current_day ?? 1, 1);

  if (progress?.is_completed) {
    return totalDays > 0 ? totalDays : currentDay;
  }

  return totalDays > 0 ? Math.min(currentDay, totalDays) : currentDay;
}

export function buildRhythmReaderSession({
  rhythm,
  planEntriesById,
  progressByPlanId = {},
  planTitlesById = {},
  getPlanDayResume,
}: BuildRhythmReaderSessionInput): BuildRhythmReaderSessionResult {
  const segments: ReadingPlanRhythmSessionSegment[] = [];
  const chapterKeys: string[] = [];
  const playbackSequenceEntries: AudioPlaybackSequenceEntry[] = [];

  for (const planId of rhythm.planIds) {
    const entries = planEntriesById[planId] ?? [];
    if (entries.length === 0) {
      continue;
    }

    const progress = progressByPlanId[planId] ?? null;
    if (progress?.is_completed) {
      continue;
    }

    const dayNumber = getRhythmDayNumber(entries, progress ?? undefined);
    const dayEntries = getUniqueDayEntries(entries, dayNumber);
    const segmentChapterKeys = expandPlanDayChapterKeys(dayEntries);
    if (segmentChapterKeys.length === 0) {
      continue;
    }

    const segmentPlaybackEntries = buildPlanDayPlaybackSequenceEntries(dayEntries);
    const startIndex = playbackSequenceEntries.length;
    playbackSequenceEntries.push(...segmentPlaybackEntries);
    chapterKeys.push(...segmentChapterKeys);
    const endIndex = playbackSequenceEntries.length;

    segments.push({
      planId,
      planTitle: planTitlesById[planId] ?? planId,
      dayNumber,
      startIndex,
      endIndex,
      chapterKeys: segmentChapterKeys,
      isComplete: false,
    });
  }

  const sessionContext: ReadingPlanRhythmSession = {
    type: 'rhythm',
    rhythmId: rhythm.id,
    title: rhythm.title,
    planIds: rhythm.planIds,
    chapterKeys,
    segments,
  };

  const startSegment = resolveFirstIncompleteRhythmSessionSegment(sessionContext, progressByPlanId);
  const startResume =
    startSegment && getPlanDayResume
      ? getPlanDayResume(startSegment.planId, startSegment.dayNumber)
      : null;
  const startEntry =
    startSegment && startSegment.startIndex < playbackSequenceEntries.length
      ? startResume
        ? playbackSequenceEntries
            .slice(startSegment.startIndex, startSegment.endIndex)
            .find(
              (entry) =>
                entry.bookId === startResume.bookId && entry.chapter === startResume.chapter
            ) ?? playbackSequenceEntries[startSegment.startIndex] ?? null
        : playbackSequenceEntries[startSegment.startIndex] ?? null
      : null;

  return {
    sessionContext,
    playbackSequenceEntries,
    startEntry,
    startSegment,
  };
}

export function resolveFirstIncompleteRhythmSessionSegment(
  session: ReadingPlanRhythmSession,
  progressByPlanId: Record<string, UserReadingPlanProgress | null | undefined>,
  resumePlanId?: string | null
): ReadingPlanRhythmSessionSegment | null {
  const isIncomplete = (segment: ReadingPlanRhythmSessionSegment): boolean =>
    !(progressByPlanId[segment.planId]?.is_completed ?? false);

  if (resumePlanId) {
    const preferredSegment = session.segments.find((segment) => segment.planId === resumePlanId);
    if (preferredSegment && isIncomplete(preferredSegment)) {
      return preferredSegment;
    }
  }

  return session.segments.find(isIncomplete) ?? null;
}

export function getRhythmSessionSegmentAtIndex(
  session: ReadingPlanRhythmSession,
  playbackIndex: number
): ReadingPlanRhythmSessionSegment | null {
  if (playbackIndex < 0) {
    return null;
  }

  return (
    session.segments.find(
      (segment) => playbackIndex >= segment.startIndex && playbackIndex < segment.endIndex
    ) ?? null
  );
}

export function resolvePlaybackSequenceIndex({
  playbackSequenceEntries,
  bookId,
  chapter,
  session,
  preferredPlanId,
  preferredDayNumber,
}: {
  playbackSequenceEntries: AudioPlaybackSequenceEntry[];
  bookId: string;
  chapter: number;
  session?: ReadingPlanRhythmSession | null;
  preferredPlanId?: string | null;
  preferredDayNumber?: number | null;
}): number {
  if (session && preferredPlanId) {
    const preferredSegment = session.segments.find(
      (segment) =>
        segment.planId === preferredPlanId &&
        (preferredDayNumber == null || segment.dayNumber === preferredDayNumber)
    );

    if (preferredSegment) {
      for (let index = preferredSegment.startIndex; index < preferredSegment.endIndex; index += 1) {
        const entry = playbackSequenceEntries[index];
        if (entry?.bookId === bookId && entry.chapter === chapter) {
          return index;
        }
      }
    }
  }

  return playbackSequenceEntries.findIndex(
    (entry) => entry.bookId === bookId && entry.chapter === chapter
  );
}

export function getReadingPlanRhythmSummary({
  rhythm,
  progressByPlanId,
}: {
  rhythm: ReadingPlanRhythm;
  progressByPlanId: Record<string, UserReadingPlanProgress | null | undefined>;
}): ReadingPlanRhythmSummary {
  const completedPlanCount = rhythm.planIds.filter(
    (planId) => progressByPlanId[planId]?.is_completed === true
  ).length;

  return {
    planCount: rhythm.planIds.length,
    completedPlanCount,
    remainingPlanCount: Math.max(rhythm.planIds.length - completedPlanCount, 0),
  };
}

function mergeChapterActivityRecords(
  input: MergeTodayChapterActivityInput
): PlanChapterActivityRecord[] {
  const {
    chaptersRead,
    listeningHistory,
    now = new Date(),
    listenCompletionThreshold = DEFAULT_LISTEN_COMPLETION_THRESHOLD,
  } = input;
  const todayKey = formatLocalDateKey(now);
  const merged = new Map<string, PlanChapterActivityRecord>();

  for (const [chapterKey, timestamp] of Object.entries(chaptersRead)) {
    if (!Number.isFinite(timestamp) || !isSameLocalDay(timestamp, todayKey)) {
      continue;
    }

    merged.set(chapterKey, {
      chapterKey,
      timestamp,
      source: 'read',
      progress: null,
    });
  }

  for (const entry of listeningHistory) {
    if (
      !Number.isFinite(entry.listenedAt) ||
      !isSameLocalDay(entry.listenedAt, todayKey) ||
      entry.progress < listenCompletionThreshold
    ) {
      continue;
    }

    const chapterKey = buildChapterKey(entry.bookId, entry.chapter);
    const nextRecord: PlanChapterActivityRecord = {
      chapterKey,
      timestamp: entry.listenedAt,
      source: 'listen',
      progress: entry.progress,
    };

    const existing = merged.get(chapterKey);
    if (!existing || nextRecord.timestamp >= existing.timestamp) {
      merged.set(chapterKey, nextRecord);
    }
  }

  return Array.from(merged.values()).sort(
    (left, right) => left.timestamp - right.timestamp || left.chapterKey.localeCompare(right.chapterKey)
  );
}

export function mergeTodayCompletedChapterActivity(
  input: MergeTodayChapterActivityInput
): string[] {
  return mergeChapterActivityRecords(input).map((record) => record.chapterKey);
}

export function getTrackedChapterKeysForDate(
  input: MergeTodayChapterActivityInput
): Set<string> {
  return new Set(mergeTodayCompletedChapterActivity(input));
}

export function isPlanDaySatisfied(
  targetChapterKeys: Iterable<string>,
  completedChapterKeys: Iterable<string>
): boolean {
  const completed = new Set(completedChapterKeys);

  for (const targetKey of targetChapterKeys) {
    if (!completed.has(targetKey)) {
      return false;
    }
  }

  return true;
}

export function buildPlanDayCompletionSummary(
  entries: ReadingPlanEntry[],
  dayNumber: number,
  input: MergeTodayChapterActivityInput
): PlanDayCompletionSummary {
  const targetChapterKeys = getPlanDayTargetChapterKeys(entries, dayNumber);
  const completedActivity = mergeChapterActivityRecords(input);
  const completedChapterKeys = completedActivity.map((record) => record.chapterKey);

  return {
    targetChapterKeys,
    completedChapterKeys,
    completedActivity,
    totalChapters: targetChapterKeys.length,
    completedChapters: completedChapterKeys.length,
    isComplete: isPlanDaySatisfied(targetChapterKeys, completedChapterKeys),
  };
}

export function getScheduledPlanDayDate(startedAt: string, dayNumber: number): Date {
  const localStartDate = new Date(startedAt);
  const scheduledDate = new Date(
    localStartDate.getFullYear(),
    localStartDate.getMonth(),
    localStartDate.getDate()
  );
  scheduledDate.setDate(scheduledDate.getDate() + Math.max(dayNumber - 1, 0));
  return scheduledDate;
}

export function getScheduledPlanDayDateKey(startedAt: string, dayNumber: number): string {
  return formatLocalDateKey(getScheduledPlanDayDate(startedAt, dayNumber));
}

export function formatScheduledPlanDayLabel(startedAt: string, dayNumber: number): string {
  return getScheduledPlanDayDate(startedAt, dayNumber).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function getCurrentPlanDaySummary({
  entries,
  progress,
  chaptersRead,
  listeningHistory,
  dayNumber = progress.current_day,
  today = new Date(),
  listenCompletionThreshold = DEFAULT_LISTEN_COMPLETION_THRESHOLD,
}: {
  entries: ReadingPlanEntry[];
  progress: UserReadingPlanProgress;
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  dayNumber?: number;
  today?: Date;
  listenCompletionThreshold?: number;
}): CurrentPlanDaySummary {
  const summary = buildPlanDayCompletionSummary(entries, dayNumber, {
    chaptersRead,
    listeningHistory,
    now: today,
    listenCompletionThreshold,
  });

  const completedChapterCount = summary.completedActivity.filter((record) =>
    summary.targetChapterKeys.includes(record.chapterKey)
  ).length;

  return {
    dayNumber,
    dateKey: getScheduledPlanDayDateKey(progress.started_at, dayNumber),
    targetChapterKeys: summary.targetChapterKeys,
    completedChapterKeys: summary.completedChapterKeys.filter((chapterKey) =>
      summary.targetChapterKeys.includes(chapterKey)
    ),
    targetChapterCount: summary.targetChapterKeys.length,
    completedChapterCount,
    remainingChapterCount: Math.max(summary.targetChapterKeys.length - completedChapterCount, 0),
    isComplete: summary.isComplete,
  };
}

export function getPlanChapterListenStatus({
  chapterKey,
  bookId,
  chapter,
  targetChapterKeys,
  completedChapterKeys,
  listeningHistory,
  dateKey,
  listenCompletionThreshold = DEFAULT_LISTEN_COMPLETION_THRESHOLD,
}: {
  chapterKey: string;
  bookId: string;
  chapter: number;
  targetChapterKeys: string[];
  completedChapterKeys: string[];
  listeningHistory: ListeningHistoryEntry[];
  dateKey: string;
  listenCompletionThreshold?: number;
}): PlanChapterListenStatus {
  if (!targetChapterKeys.includes(chapterKey)) {
    return {
      currentChapterListenCountedAt: null,
      alreadyCountedForPlan: false,
    };
  }

  const matchingHistoryEntry = listeningHistory.find(
    (entry) =>
      entry.bookId === bookId &&
      entry.chapter === chapter &&
      entry.progress >= listenCompletionThreshold &&
      formatLocalDateKey(new Date(entry.listenedAt)) === dateKey
  );

  return {
    currentChapterListenCountedAt: matchingHistoryEntry?.listenedAt ?? null,
    alreadyCountedForPlan: completedChapterKeys.includes(chapterKey),
  };
}
