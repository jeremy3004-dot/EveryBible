export interface AudioQueueEntry {
  id: string;
  translationId: string;
  bookId: string;
  chapter: number;
  addedAt: number;
}

export function getAudioTrackId(translationId: string, bookId: string, chapter: number): string {
  return `${translationId}:${bookId}:${chapter}`;
}

export function syncAudioQueueToTrack(
  queue: AudioQueueEntry[],
  track: Omit<AudioQueueEntry, 'id'> & {
    translationId: string;
    bookId: string;
    chapter: number;
  }
) {
  const trackId = getAudioTrackId(track.translationId, track.bookId, track.chapter);
  const existingIndex = queue.findIndex((entry) => entry.id === trackId);

  if (existingIndex >= 0) {
    return {
      queue,
      queueIndex: existingIndex,
    };
  }

  return {
    queue: [{ ...track, id: trackId }],
    queueIndex: 0,
  };
}

export function advanceAudioQueue(queue: AudioQueueEntry[], queueIndex: number) {
  const nextEntry = queue[queueIndex + 1];
  if (!nextEntry) {
    return null;
  }

  return {
    queueIndex: queueIndex + 1,
    entry: nextEntry,
  };
}
