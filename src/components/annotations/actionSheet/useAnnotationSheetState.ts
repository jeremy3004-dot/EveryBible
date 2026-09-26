import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useLatestCallback } from '../../audio/playbackControlsParts/useLatestCallback';
import { getNoteToSave } from './annotationActionSheetModel';

interface AnnotationSheetStateOptions {
  canAnnotate: boolean;
  referenceLabel: string;
  selectedText: string;
  existingNote?: string;
  onHighlight: (color: string) => void;
  onRemoveHighlight: (color: string) => void;
  onNote: (text: string) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}

/**
 * The open sheet's state: which panel shows (actions or the note composer), the
 * note being written, and whether a highlight or note is saving. One save at a
 * time; the Android back button closes the sheet instead of leaving the reader.
 */
export function useAnnotationSheetState({
  canAnnotate,
  referenceLabel,
  selectedText,
  existingNote,
  onHighlight,
  onRemoveHighlight,
  onNote,
  onClose,
}: AnnotationSheetStateOptions) {
  const [noteText, setNoteText] = useState(existingNote ?? '');
  const [mode, setMode] = useState<'actions' | 'note'>('actions');
  const [isSaving, setIsSaving] = useState(false);
  // Keep a draft attached to the verses it was opened for. The Bible stays
  // tappable while composing, so newer selection props must not retarget its save.
  const [noteTarget, setNoteTarget] = useState({
    referenceLabel,
    selectedText,
    existingNote,
    onNote,
  });
  // The selection can change under an open sheet (the Bible stays tappable around
  // it), bringing a different existing note. Follow it unless a note is being written.
  const [seededNote, setSeededNote] = useState(existingNote);
  const [seededReferenceLabel, setSeededReferenceLabel] = useState(referenceLabel);
  if (
    mode === 'actions' &&
    (existingNote !== seededNote || referenceLabel !== seededReferenceLabel)
  ) {
    setSeededNote(existingNote);
    setSeededReferenceLabel(referenceLabel);
    setNoteText(existingNote ?? '');
  }

  const close = () => {
    setMode('actions');
    setNoteText(existingNote ?? '');
    onClose();
  };

  // Subscribed once per opening, but closes through the latest props: the reader
  // passes a new onClose on every render.
  const closeFromBackButton = useLatestCallback(close);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFromBackButton();
      return true;
    });

    return () => subscription.remove();
  }, [closeFromBackButton]);

  const toggleHighlight = async (color: string, isActive: boolean) => {
    if (!canAnnotate || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      if (isActive) {
        await onRemoveHighlight(color);
      } else {
        await onHighlight(color);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveNote = async () => {
    if (!canAnnotate || isSaving) {
      return;
    }

    // A cleared field over a saved note removes it (an empty save); a blank new note is
    // dropped, and an unchanged one is not saved again (that would mark it edited now).
    const savedNote = getNoteToSave(noteTarget.existingNote ?? '');
    const note = getNoteToSave(noteText) ?? (savedNote ? '' : null);
    if (note !== null && note !== savedNote) {
      setIsSaving(true);
      try {
        if ((await noteTarget.onNote(note)) === false) return;
      } finally {
        setIsSaving(false);
      }
    }

    close();
  };

  return {
    mode,
    noteText,
    setNoteText,
    isSaving,
    referenceLabel: mode === 'note' ? noteTarget.referenceLabel : referenceLabel,
    selectedText: mode === 'note' ? noteTarget.selectedText : selectedText,
    close,
    toggleHighlight,
    saveNote,
    openNote: () => {
      if (canAnnotate && !isSaving) {
        setNoteTarget({ referenceLabel, selectedText, existingNote, onNote });
        setMode('note');
      }
    },
    // Keeps the draft for the next Note.
    cancelNote: () => setMode('actions'),
  };
}
