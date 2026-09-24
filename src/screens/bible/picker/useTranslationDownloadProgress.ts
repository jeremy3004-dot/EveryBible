import { useShallow } from 'zustand/react/shallow';
import { useBibleStore } from '../../../stores/bibleStore';
import {
  selectRowDownloadProgress,
  type TranslationRowDownloadProgress,
} from './translationDownloadStatusModel';

/**
 * The store's shared download banner, narrowed to one Bible. Other Bibles' ticks and byte
 * counts between whole percents do not re-render the caller.
 */
export function useTranslationDownloadProgress(
  translationId: string
): TranslationRowDownloadProgress | null {
  return useBibleStore(
    useShallow((state) => selectRowDownloadProgress(state.downloadProgress, translationId))
  );
}
