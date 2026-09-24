import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '../../../hooks/useI18n';
import { useBibleStore } from '../../../stores/bibleStore';
import { announceForAccessibility } from '../../../utils';
import {
  getDownloadStatusAnnouncements,
  selectDownloadTarget,
  type TranslationRowDownloadStatus,
} from './translationDownloadStatusModel';
import type { TranslationPickerRow } from './translationPickerRowsModel';

/**
 * A download's only visible signal is a silently growing rule, so the picker speaks the status
 * words its rows show when a listed Bible's download starts, queues and settles. Kept here, by
 * Bible id, rather than in each row: the row of a finished download moves section and remounts.
 */
export function useDownloadStatusAnnouncements(
  rows: readonly TranslationPickerRow[],
  queuedId: string | null
) {
  const { t } = useI18n();
  // Whose download runs, not how far: percent and byte ticks do not re-render the list.
  const downloadTarget = useBibleStore(
    useShallow((state) => selectDownloadTarget(state.downloadProgress))
  );
  const statusesRef = useRef<ReadonlyMap<string, TranslationRowDownloadStatus>>(new Map());

  useEffect(() => {
    const translations = rows.flatMap((row) =>
      row.type === 'translation' ? [row.translation] : []
    );
    const { statuses, announcements } = getDownloadStatusAnnouncements(
      statusesRef.current,
      translations,
      downloadTarget,
      queuedId
    );
    statusesRef.current = statuses;
    announcements.forEach((key) => announceForAccessibility(t(key)));
  }, [downloadTarget, queuedId, rows, t]);
}
