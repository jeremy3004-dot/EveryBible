import { useShallow } from 'zustand/react/shallow';
import { useBibleStore } from '../../../stores/bibleStore';
import type { BibleTranslation } from '../../../types';

/**
 * The reader's current translation row without its audio download job. The job carries
 * progress, byte counts and `updatedAt`, which change on every tick of a download, and
 * the reader reads none of them (the picker and Home own the progress UI). Every other
 * field keeps its identity across ticks, so the shallow compare holds the result steady
 * and the reader re-renders only when something it does use changes.
 */
export function useReaderTranslation(): BibleTranslation | undefined {
  return useBibleStore(
    useShallow((state) => {
      const row = state.translations.find(
        (translation) => translation.id === state.currentTranslation
      );
      if (!row) return undefined;
      return { ...row, activeDownloadJob: undefined };
    })
  );
}
