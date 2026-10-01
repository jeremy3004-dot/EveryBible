import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Alert, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { getTranslatedPassageBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  getAnnotationsForChapter,
  softDeleteAnnotation,
  subscribeToAnnotationChanges,
  upsertAnnotation,
} from '../../../services/annotations/annotationService';
import { getPrivateDataOwner } from '../../../stores/privateDataScope';
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
import { reportReaderFailure } from './reportReaderFailure';
import { useVerseImageShare } from './useVerseImageShare';

export interface UseVerseSelectionInput {
  annotations: UserAnnotation[];
  bookId: string;
  chapter: number;
  currentTranslation: string;
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
  currentTranslation,
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
  const annotationOwner = getPrivateDataOwner();
  const isCurrentAnnotationOwner = () => getPrivateDataOwner() === annotationOwner;
  const annotationContext = `${bookId}:${chapter}:${currentTranslation}`;
  const annotationContextRef = useRef(annotationContext);
  annotationContextRef.current = annotationContext;
  const isCurrentAnnotationContext = () => annotationContextRef.current === annotationContext;
  // A new selection array also identifies closing and reopening the same verses.
  const selectedVersesRef = useRef(selectedVerses);
  selectedVersesRef.current = selectedVerses;
  const isCurrentSelection = () => selectedVersesRef.current === selectedVerses;
  useEffect(
    () =>
      subscribeToAnnotationChanges(() => {
        // A mounted reader can keep its private composer open while auth changes
        // elsewhere. Close the old draft rather than retargeting it to the new owner.
        if (getPrivateDataOwner() !== annotationOwner) dismissSelectedVerseSelection();
      }),
    [annotationOwner, dismissSelectedVerseSelection]
  );
  const selectedVerseReferenceLabel =
    selectedVerses.length > 0
      ? formatBibleSelectionReference({
          bookName: getTranslatedPassageBookName(bookId, t),
          chapter,
          verses: selectedVerses,
          translationLabel: translationShareLabel,
        })
      : '';
  // The shared picture names the passage alone; the translation stays in the caption.
  const selectedVerseImageReferenceLabel =
    selectedVerses.length > 0
      ? formatBibleSelectionReference({
          bookName: getTranslatedPassageBookName(bookId, t),
          chapter,
          verses: selectedVerses,
          translationLabel: '',
        })
      : '';
  // The action tray appears at the bottom of the screen, away from the verse that was
  // tapped; say what is now selected, once per tray opening rather than per extended verse.
  const isTrayOpen = selectedVerses.length > 0;
  const trayAnnouncementRef = useRef(selectedVerseImageReferenceLabel);
  trayAnnouncementRef.current = selectedVerseImageReferenceLabel;
  useEffect(() => {
    if (isTrayOpen) {
      announceForAccessibility(`${t('annotations.selected')}: ${trayAnnouncementRef.current}`);
    }
  }, [isTrayOpen, t]);
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
    if (
      isCurrentAnnotationOwner() &&
      isCurrentAnnotationContext() &&
      result.success &&
      result.data
    ) {
      setAnnotations(result.data);
    }
  };

  const handleCopySelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    try {
      await Clipboard.setStringAsync(selectedVerseShareText);
      selectionHaptic();
    } catch (error) {
      reportReaderFailure('reader.copyVerses', error);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
  };

  const handleCloseSelectedVerses = () => {
    dismissSelectedVerseSelection();
  };

  const handleShareSelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    try {
      await Share.share({ message: selectedVerseShareText });
    } catch (error) {
      reportReaderFailure('reader.shareVerses', error);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
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

  const { handleCloseVerseImageSheet, handleVerseImageSheetDismissed, shareVerseImage } =
    useVerseImageShare({
      shareText: selectedVerseShareText,
      isSharingVerseImage,
      setIsSharingVerseImage,
      setShowVerseImageSheet,
      verseImageSharePreviewRef,
      resetKey: `${currentTranslation}:${bookId}:${chapter}`,
      reportFailure: (error) => reportReaderFailure('reader.shareImage', error),
    });

  const handleShareSelectedVerseImage = async () => {
    await shareVerseImage();
  };

  const commitAnnotationEdits = async (edits: ReaderAnnotationEdits) => {
    if (!isCurrentAnnotationOwner() || !isCurrentAnnotationContext()) return false;
    const succeeded = await applyReaderAnnotationEdits(edits, {
      // Each awaited write yields. Auth can change between two edits, so checking
      // only when the operation starts would send the rest to the new owner's store.
      softDelete: (id) =>
        isCurrentAnnotationOwner() ? softDeleteAnnotation(id) : Promise.resolve({ success: false }),
      upsert: (annotation) =>
        isCurrentAnnotationOwner()
          ? upsertAnnotation(annotation)
          : Promise.resolve({ success: false }),
    });
    if (!isCurrentAnnotationOwner() || !isCurrentAnnotationContext()) return false;
    if (!succeeded) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
    await reloadAnnotations();
    return succeeded && isCurrentAnnotationOwner() && isCurrentAnnotationContext();
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
      (await commitAnnotationEdits(
        planReaderHighlightApply({ ...readerAnnotationEditInput(), color })
      )) &&
      isCurrentAnnotationOwner() &&
      isCurrentAnnotationContext() &&
      isCurrentSelection()
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
      (await commitAnnotationEdits(
        planReaderHighlightRemove({ ...readerAnnotationEditInput(), color })
      )) &&
      isCurrentAnnotationOwner() &&
      isCurrentAnnotationContext() &&
      isCurrentSelection()
    ) {
      setSelectedVerses([]);
      announceForAccessibility(t('interface.highlightRemoved'));
    }
  };

  const handleNoteSelectedVerses = async (text: string) => {
    if (selectedVerseRanges.length === 0) {
      return false;
    }

    const succeeded = await commitAnnotationEdits(
      planReaderNoteSave({ ...readerAnnotationEditInput(), content: text })
    );
    if (succeeded && isCurrentAnnotationOwner() && isCurrentAnnotationContext()) {
      announceForAccessibility(t('annotations.saved'));
    }
    return succeeded && isCurrentAnnotationOwner() && isCurrentAnnotationContext();
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
    handleCloseVerseImageSheet,
    highlightByVerse,
    selectedHighlightColors,
    selectedNoteAnnotation,
    selectedVerseDecorationStyle,
    selectedVerseReferenceLabel,
    selectedVerseImageReferenceLabel,
    selectedVerseSet,
    selectedVerseText,
  };
}
