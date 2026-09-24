import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useMemo } from 'react';
import { Alert, Share, View } from 'react-native';
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

  const handleShareSelectedVerseImage = async () => {
    if (!selectedVerseShareText || isSharingVerseImage) {
      return;
    }

    setIsSharingVerseImage(true);

    try {
      const Sharing = await import('expo-sharing');

      if (await Sharing.isAvailableAsync()) {
        if (verseImageSharePreviewRef.current) {
          const { captureRef } = await import('react-native-view-shot');
          const imageUri = await captureRef(verseImageSharePreviewRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });

          setShowVerseImageSheet(false);

          await Sharing.shareAsync(imageUri, {
            dialogTitle: t('groups.share'),
            mimeType: 'image/png',
          });
          return;
        }
      }

      setShowVerseImageSheet(false);
      await Share.share({ message: selectedVerseShareText });
    } catch {
      try {
        setShowVerseImageSheet(false);
        await Share.share({ message: selectedVerseShareText });
      } catch {
        // Ignore share errors.
      }
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
    highlightByVerse,
    selectedHighlightColors,
    selectedNoteAnnotation,
    selectedVerseDecorationStyle,
    selectedVerseReferenceLabel,
    selectedVerseSet,
    selectedVerseText,
  };
}
