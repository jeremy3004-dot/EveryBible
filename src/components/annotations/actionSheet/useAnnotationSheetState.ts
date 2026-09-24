import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useLatestCallback } from '../../audio/playbackControlsParts/useLatestCallback';
import { getNoteToSave } from './annotationActionSheetModel';

interface AnnotationSheetStateOptions {
  canAnnotate: boolean;
  existingNote?: string;
  onHighlight: (color: string) => void;
  onRemoveHighlight: (color: string) => void;
  onNote: (text: string) => void;
  onClose: () => void;
}

/**
 * The open sheet's state: which panel shows (actions or the note composer), the
 * note being written, and whether a highlight or note is saving. One save at a
 * time; the Android back button closes the sheet instead of leaving the reader.
 */
export function useAnnotationSheetState({
  canAnnotate,
  existingNote,
  onHighlight,
  onRemoveHighlight,
  onNote,
  onClose,
}: AnnotationSheetStateOptions) {
  const [noteText, setNoteText] = useState(existingNote ?? '');
  const [mode, setMode] = useState<'actions' | 'note'>('actions');
  const [isSaving, setIsSaving] = useState(false);
  // The selection can change under an open sheet (the Bible stays tappable around
  // it), bringing a different existing note. Follow it unless a note is being written.
  const [seededNote, setSeededNote] = useState(existingNote);
  if (mode === 'actions' && existingNote !== seededNote) {
    setSeededNote(existingNote);
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

    const note = getNoteToSave(noteText);
    if (note) {
      setIsSaving(true);
      try {
        await onNote(note);
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
    close,
    toggleHighlight,
    saveNote,
    openNote: () => {
      if (canAnnotate && !isSaving) {
        setMode('note');
      }
    },
    // Keeps the draft for the next Note.
    cancelNote: () => setMode('actions'),
  };
}
