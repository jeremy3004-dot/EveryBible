import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useMemo, useRef } from 'react';
import { Alert, InteractionManager, Platform, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  getAnnotationsForChapter,
  softDeleteAnnotation,
  upsertAnnotation,
} from '../../../services/annotations/annotationService';
import { selectionHaptic } from '../../../utils/haptics';
import { announceForAccessibility } from '../../../utils/a11y';
import type { Verse } from '../../../types';
import type { UserAnnotation } from '../../../services/supabase/types';
import {
  buildBibleSelectionShareText,
  buildBibleSelectionVerseRanges,
  extractBibleSelectionText,
  formatBibleSelectionReference,
} from '../bibleSelectionModel';
import { buildReaderHighlightIndex } from '../bibleReaderRenderModel';
import { getAnnotationsForDisplayedVerses } from '../bibleReaderModel';
import {
  applyReaderAnnotationEdits,
  planReaderHighlightApply,
  planReaderHighlightRemove,
  planReaderNoteSave,
  type ReaderAnnotationEdits,
} from '../readerAnnotationEdits';

/**
 * Longest wait for the image picker to report that it has closed. It covers a picker that was
 * already gone (so never reports) and is well past the Modal's fade-out.
 */
const VERSE_IMAGE_SHEET_DISMISS_TIMEOUT_MS = Platform.OS === 'ios' ? 1000 : 300;

/** Records a failed verse-image share. The crash queue is loaded only when something failed. */
function reportVerseImageShareFailure(error: unknown) {
  void import('../../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('reader.shareImage', error))
    .catch(() => undefined);
}

export interface UseVerseSelectionInput {
  annotations: UserAnnotation[];
  bookId: string;
  chapter: number;
  dismissSelectedVerseSelection: () => void;
  isSharingVerseImage: boolean;
  isShowingRouteChapter: boolean;
  selectedVerses: number[];
  setAnnotations: Dispatch<SetStateAction<UserAnnotation[]>>;
  setIsSharingVerseImage: Dispatch<SetStateAction<boolean>>;
  setSelectedVerseImageBackgroundIndex: Dispatch<SetStateAction<number>>;
  setSelectedVerses: Dispatch<SetStateAction<number[]>>;
  setShowVerseImageSheet: Dispatch<SetStateAction<boolean>>;
  translationShareLabel: string;
  verseImageSharePreviewRef: RefObject<View | null>;
  verses: Verse[];
}

/** The verses the reader has selected: their reference, text and share text, highlights and notes over them, and copying, sharing (as text or an image), highlighting and noting them. */
export function useVerseSelection({
  annotations,
  bookId,
  chapter,
  dismissSelectedVerseSelection,
  isSharingVerseImage,
  isShowingRouteChapter,
  selectedVerses,
  setAnnotations,
  setIsSharingVerseImage,
  setSelectedVerseImageBackgroundIndex,
  setSelectedVerses,
  setShowVerseImageSheet,
  translationShareLabel,
  verseImageSharePreviewRef,
  verses,
}: UseVerseSelectionInput) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const selectedVerseReferenceLabel =
    selectedVerses.length > 0
      ? formatBibleSelectionReference({
          bookName: getTranslatedBookName(bookId, t),
          chapter,
          verses: selectedVerses,
          translationLabel: translationShareLabel,
        })
      : '';
  const selectedVerseText =
    selectedVerses.length > 0 ? extractBibleSelectionText(verses, selectedVerses) : '';
  const selectedVerseShareText =
    selectedVerses.length > 0
      ? buildBibleSelectionShareText({
          referenceLabel: selectedVerseReferenceLabel,
          selectedText: selectedVerseText,
        })
      : '';
  const selectedVerseRanges = useMemo(
    () => buildBibleSelectionVerseRanges(selectedVerses),
    [selectedVerses]
  );

  const getAnnotationVerseEnd = (annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>) =>
    annotation.verse_end ?? annotation.verse_start;
  const annotationOverlapsSelectionRange = (
    annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>,
    range: (typeof selectedVerseRanges)[number]
  ) =>
    annotation.verse_start <= range.verse_end &&
    getAnnotationVerseEnd(annotation) >= range.verse_start;
  const selectedVerseDecorationStyle = useMemo(
    () =>
      ({
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationColor: colors.bibleAccent,
      }) as const,
    [colors.bibleAccent]
  );
  const selectedVerseSet = useMemo(() => new Set(selectedVerses), [selectedVerses]);

  const displayedAnnotations = getAnnotationsForDisplayedVerses({
    annotations,
    isShowingRouteChapter,
  });
  const highlightByVerse = useMemo(
    () =>
      buildReaderHighlightIndex(
        displayedAnnotations,
        verses.reduce((lastVerse, verse) => Math.max(lastVerse, verse.verse), 0)
      ),
    [displayedAnnotations, verses]
  );
  // One pass over the annotation list per selection change instead of three
  // chained filters on every render (this used to run on every position tick).
  const { selectedHighlightColors, selectedNoteAnnotation } = useMemo(() => {
    const matching =
      selectedVerseRanges.length > 0
        ? annotations.filter(
            (annotation) =>
              annotation.deleted_at == null &&
              selectedVerseRanges.some((range) =>
                annotationOverlapsSelectionRange(annotation, range)
              )
          )
        : [];
    const highlights = matching.filter((annotation) => annotation.type === 'highlight');
    return {
      selectedHighlightColors: Array.from(
        new Set(
          highlights
            .map((annotation) => annotation.color)
            .filter(
              (color): color is string => typeof color === 'string' && color.trim().length > 0
            )
        )
      ),
      selectedNoteAnnotation: matching.find((annotation) => annotation.type === 'note'),
    };
    // annotationOverlapsSelectionRange is a pure local helper over its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, selectedVerseRanges]);

  const reloadAnnotations = async () => {
    const result = await getAnnotationsForChapter(bookId, chapter);
    if (result.success && result.data) {
      setAnnotations(result.data);
    }
  };

  const handleCopySelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Clipboard.setStringAsync(selectedVerseShareText);
    selectionHaptic();
  };

  const handleCloseSelectedVerses = () => {
    dismissSelectedVerseSelection();
  };

  const handleShareSelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Share.share({ message: selectedVerseShareText });
  };

  const handleOpenVerseImageShare = () => {
    if (!selectedVerseShareText) {
      return;
    }

    setShowVerseImageSheet(true);
  };

  const handleSelectVerseImageBackground = (backgroundIndex: number) => {
    setSelectedVerseImageBackgroundIndex(backgroundIndex);
  };

  const verseImageSheetDismissedRef = useRef<(() => void) | null>(null);

  /** The image picker Modal's onDismiss (iOS reports the end of its close animation). */
  const handleVerseImageSheetDismissed = () => {
    verseImageSheetDismissedRef.current?.();
  };

  // iOS presents a share sheet from the top view controller, which is the picker Modal until its
  // fade-out ends. Presenting then fails ("… whose view is not in the window hierarchy") and the
  // share promise never settles, so the share waits for the picker to be gone: its onDismiss on
  // iOS (the only platform that reports one), the end of the close interaction on Android.
  const closeVerseImageSheetAndWait = () =>
    new Promise<void>((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        if (verseImageSheetDismissedRef.current === complete) {
          verseImageSheetDismissedRef.current = null;
        }
        resolve();
      };
      const timeoutId = setTimeout(complete, VERSE_IMAGE_SHEET_DISMISS_TIMEOUT_MS);
      if (Platform.OS === 'ios') {
        verseImageSheetDismissedRef.current = complete;
      } else {
        InteractionManager.runAfterInteractions(complete);
      }
      setShowVerseImageSheet(false);
    });

  const handleShareSelectedVerseImage = async () => {
    if (!selectedVerseShareText || isSharingVerseImage) {
      return;
    }

    setIsSharingVerseImage(true);

    try {
      // The card is captured while the picker still shows it; the sheet is presented once it's gone.
      let shareImage: (() => Promise<void>) | null = null;
      try {
        const Sharing = await import('expo-sharing');

        if ((await Sharing.isAvailableAsync()) && verseImageSharePreviewRef.current) {
          const { captureRef } = await import('react-native-view-shot');
          const imageUri = await captureRef(verseImageSharePreviewRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });
          shareImage = () =>
            Sharing.shareAsync(imageUri, {
              dialogTitle: t('groups.share'),
              mimeType: 'image/png',
            });
        }
      } catch (error) {
        reportVerseImageShareFailure(error);
      }

      await closeVerseImageSheetAndWait();
      // The spinner lives in the closed picker. A native sheet that never reports back must not
      // leave it busy when the picker is opened again.
      setIsSharingVerseImage(false);

      if (shareImage) {
        try {
          // Both share sheets resolve when the user cancels; only a failure rejects.
          await shareImage();
          return;
        } catch (error) {
          reportVerseImageShareFailure(error);
        }
      }

      await Share.share({ message: selectedVerseShareText });
    } catch (error) {
      reportVerseImageShareFailure(error);
    } finally {
      setIsSharingVerseImage(false);
    }
  };

  const commitAnnotationEdits = async (edits: ReaderAnnotationEdits) => {
    const succeeded = await applyReaderAnnotationEdits(edits, {
      softDelete: softDeleteAnnotation,
      upsert: upsertAnnotation,
    });
    if (!succeeded) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
    await reloadAnnotations();
    return succeeded;
  };

  const readerAnnotationEditInput = () => ({
    book: bookId,
    chapter,
    annotations,
    selectedVerses,
    createId: () => Math.random().toString(36).slice(2),
  });

  const handleHighlightSelectedVerses = async (color: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderHighlightApply({ ...readerAnnotationEditInput(), color })
      )
    ) {
      setSelectedVerses([]);
      announceForAccessibility(t('interface.highlightAdded'));
    }
  };

  const handleRemoveHighlightSelectedVerses = async (color: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderHighlightRemove({ ...readerAnnotationEditInput(), color })
      )
    ) {
      setSelectedVerses([]);
      announceForAccessibility(t('interface.highlightRemoved'));
    }
  };

  const handleNoteSelectedVerses = async (text: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderNoteSave({ ...readerAnnotationEditInput(), content: text })
      )
    ) {
      announceForAccessibility(t('annotations.saved'));
    }
  };

  return {
    displayedAnnotations,
    handleCloseSelectedVerses,
    handleCopySelectedVerses,
    handleHighlightSelectedVerses,
    handleNoteSelectedVerses,
    handleOpenVerseImageShare,
    handleRemoveHighlightSelectedVerses,
    handleSelectVerseImageBackground,
    handleShareSelectedVerseImage,
    handleShareSelectedVerses,
    handleVerseImageSheetDismissed,
    highlightByVerse,
    selectedHighlightColors,
    selectedNoteAnnotation,
    selectedVerseDecorationStyle,
    selectedVerseReferenceLabel,
    selectedVerseSet,
    selectedVerseText,
  };
}
