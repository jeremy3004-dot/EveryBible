/**
 * How the guest (signed-out) bucket of each private store is merged into an
 * account's bucket at the first sign-in after signed-out use.
 *
 * Rules shared by every merge:
 * - Nothing from either side is dropped. Where only one version can be shown,
 *   the other is kept but hidden (annotations; a hidden note's text is also
 *   joined into the visible note) or the account's copy wins.
 * - Idempotent: merging the same guest state twice gives the same result. An
 *   adoption interrupted by an app kill is retried at the next sign-in.
 * - Deterministic: no clocks or random ids, so a retry cannot diverge.
 */
import type { UserAnnotation } from '../services/supabase/types';
import type { FieldType, Group, GroupProgress } from '../types/course';
import {
  HISTORY_LIMIT,
  type FavoriteChapter,
  type LibraryPlaylist,
  type ListeningHistoryEntry,
} from './libraryModel';

const byNumberDesc =
  <T>(pick: (item: T) => number) =>
  (left: T, right: T): number =>
    pick(right) - pick(left);

// Account entries first; guest entries only for ids the account lacks.
const unionById = <T extends { id: string }>(account: T[], guest: T[]): T[] => {
  const accountIds = new Set(account.map((item) => item.id));
  return [...account, ...guest.filter((item) => !accountIds.has(item.id))];
};

const unionStrings = (account: string[], guest: string[]): string[] => {
  const seen = new Set(account);
  return [...account, ...guest.filter((item) => !seen.has(item))];
};

const unionListsByKey = (
  account: Record<string, string[]>,
  guest: Record<string, string[]>
): Record<string, string[]> => {
  const merged: Record<string, string[]> = { ...account };
  for (const [key, items] of Object.entries(guest)) {
    merged[key] = unionStrings(account[key] ?? [], items);
  }
  return merged;
};

const unionFlagsByKey = (
  account: Record<string, boolean>,
  guest: Record<string, boolean>
): Record<string, boolean> => {
  const merged: Record<string, boolean> = { ...account };
  for (const [key, done] of Object.entries(guest)) {
    merged[key] = Boolean(account[key]) || done;
  }
  return merged;
};

// ---------------------------------------------------------------------------
// Annotations (highlights, notes, bookmarks)
// ---------------------------------------------------------------------------

const annotationKey = (annotation: UserAnnotation) =>
  `${annotation.book}|${annotation.chapter}|${annotation.verse_start}|${annotation.type}`;

// Same id on both sides: the newer edit wins; on a tie, the hidden (deleted)
// copy wins so a collision resolved by an earlier adoption stays resolved.
const pickVersion = (current: UserAnnotation, candidate: UserAnnotation): UserAnnotation => {
  if (candidate.updated_at !== current.updated_at) {
    return candidate.updated_at > current.updated_at ? candidate : current;
  }
  return candidate.deleted_at != null && current.deleted_at == null ? candidate : current;
};

const isNewerAnnotation = (left: UserAnnotation, right: UserAnnotation): boolean =>
  left.updated_at !== right.updated_at
    ? left.updated_at > right.updated_at
    : left.created_at !== right.created_at
      ? left.created_at > right.created_at
      : left.id > right.id;

// The texts of colliding notes, oldest edit first, so the joined note reads in
// the order it was written (as if the newer note had been appended). Each text
// is trimmed; an empty text and one that repeats a text already included are
// left out.
const joinNoteTexts = (notes: UserAnnotation[]): string | null => {
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const note of [...notes].sort((left, right) => (isNewerAnnotation(left, right) ? 1 : -1))) {
    const text = note.content?.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      texts.push(text);
    }
  }
  return texts.length > 0 ? texts.join('\n\n') : null;
};

/**
 * Unions by id. The reader shows one active annotation per verse and type
 * (upsertAnnotation relies on it), so where both sides have one, the most
 * recently edited stays visible and the other is soft-deleted: hidden, but
 * still stored with its content.
 *
 * Notes are joined rather than hidden away: the visible (most recently edited)
 * note takes the texts of every active note on its verse, oldest edit first,
 * separated by a blank line (see joinNoteTexts), and keeps its own id and
 * updated_at. Highlights keep the newer colour. Deleted records are never
 * joined. A second merge of the same guest state finds the other notes already
 * hidden (the hidden copy wins a same-updated_at tie in pickVersion, and the
 * account's joined copy wins over the guest's original), so nothing is joined
 * twice.
 *
 * Deliberately not mergeAnnotationLists: that keys by verse and type, which
 * would drop a re-created highlight sitting next to its deleted predecessor.
 */
export const mergeGuestAnnotations = (
  account: UserAnnotation[],
  guest: UserAnnotation[]
): UserAnnotation[] => {
  const byId = new Map<string, UserAnnotation>();
  for (const annotation of [...account, ...guest]) {
    const current = byId.get(annotation.id);
    byId.set(annotation.id, current ? pickVersion(current, annotation) : annotation);
  }

  const activeByKey = new Map<string, UserAnnotation[]>();
  for (const annotation of byId.values()) {
    if (annotation.deleted_at != null) {
      continue;
    }
    const key = annotationKey(annotation);
    const group = activeByKey.get(key);
    if (group) {
      group.push(annotation);
    } else {
      activeByKey.set(key, [annotation]);
    }
  }

  const visibleByKey = new Map<string, UserAnnotation>();
  for (const [key, group] of activeByKey) {
    let visible = group[0] as UserAnnotation;
    for (const annotation of group) {
      if (isNewerAnnotation(annotation, visible)) {
        visible = annotation;
      }
    }
    visibleByKey.set(
      key,
      visible.type === 'note' && group.length > 1
        ? { ...visible, content: joinNoteTexts(group) ?? visible.content }
        : visible
    );
  }

  return Array.from(byId.values(), (annotation) => {
    if (annotation.deleted_at != null) {
      return annotation;
    }
    const visible = visibleByKey.get(annotationKey(annotation));
    if (!visible) {
      return annotation;
    }
    return visible.id !== annotation.id
      ? { ...annotation, deleted_at: visible.updated_at }
      : visible;
  });
};

// ---------------------------------------------------------------------------
// Library (favourites, playlists, listening history)
// ---------------------------------------------------------------------------

export interface LibraryData {
  favorites: FavoriteChapter[];
  playlists: LibraryPlaylist[];
  history: ListeningHistoryEntry[];
}

const mergePlaylist = (account: LibraryPlaylist, guest: LibraryPlaylist): LibraryPlaylist => ({
  ...account,
  createdAt: Math.min(account.createdAt, guest.createdAt),
  updatedAt: Math.max(account.updatedAt, guest.updatedAt),
  entries: unionById(account.entries, guest.entries).sort(byNumberDesc((entry) => entry.addedAt)),
});

export const mergeGuestLibrary = (account: LibraryData, guest: LibraryData): LibraryData => {
  const guestPlaylists = new Map(guest.playlists.map((playlist) => [playlist.id, playlist]));
  const accountPlaylistIds = new Set(account.playlists.map((playlist) => playlist.id));

  const history = new Map<string, ListeningHistoryEntry>();
  for (const entry of [...account.history, ...guest.history]) {
    const current = history.get(entry.id);
    if (!current || entry.listenedAt > current.listenedAt) {
      history.set(entry.id, entry);
    }
  }

  return {
    favorites: unionById(account.favorites, guest.favorites).sort(
      byNumberDesc((favorite) => favorite.addedAt)
    ),
    playlists: [
      ...account.playlists.map((playlist) => {
        const guestPlaylist = guestPlaylists.get(playlist.id);
        return guestPlaylist ? mergePlaylist(playlist, guestPlaylist) : playlist;
      }),
      ...guest.playlists.filter((playlist) => !accountPlaylistIds.has(playlist.id)),
    ],
    history: Array.from(history.values())
      .sort(byNumberDesc((entry) => entry.listenedAt))
      .slice(0, HISTORY_LIMIT),
  };
};

// ---------------------------------------------------------------------------
// Gather lesson marks
// ---------------------------------------------------------------------------

export interface GatherData {
  completedLessons: Record<string, string[]>;
  infoBannerDismissed: boolean;
}

export const mergeGuestGather = (account: GatherData, guest: GatherData): GatherData => ({
  completedLessons: unionListsByKey(account.completedLessons, guest.completedLessons),
  infoBannerDismissed: account.infoBannerDismissed || guest.infoBannerDismissed,
});

// ---------------------------------------------------------------------------
// Four Fields progress and local groups
// ---------------------------------------------------------------------------

export interface FourFieldsData {
  completedLessons: Record<string, string[]>;
  practiceCompleted: Record<string, boolean>;
  taughtCompleted: Record<string, boolean>;
  currentField: FieldType;
  currentCourseId: string | null;
  currentLessonId: string | null;
  groups: Group[];
  activeGroupId: string | null;
  groupProgress: Record<string, GroupProgress>;
}

export const mergeGuestFourFields = (
  account: FourFieldsData,
  guest: FourFieldsData
): Partial<FourFieldsData> => {
  // The guest session is the most recent activity on this device, so the
  // reader continues where they just were if they had opened a course.
  const position =
    guest.currentCourseId !== null
      ? {
          currentField: guest.currentField,
          currentCourseId: guest.currentCourseId,
          currentLessonId: guest.currentLessonId,
        }
      : {
          currentField: account.currentField,
          currentCourseId: account.currentCourseId,
          currentLessonId: account.currentLessonId,
        };

  return {
    completedLessons: unionListsByKey(account.completedLessons, guest.completedLessons),
    practiceCompleted: unionFlagsByKey(account.practiceCompleted, guest.practiceCompleted),
    taughtCompleted: unionFlagsByKey(account.taughtCompleted, guest.taughtCompleted),
    ...position,
    groups: unionById(account.groups, guest.groups),
    activeGroupId: guest.activeGroupId ?? account.activeGroupId,
    groupProgress: { ...guest.groupProgress, ...account.groupProgress },
  };
};
