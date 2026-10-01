import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import { Alert, InteractionManager, Platform, Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  getVerseImageCaptureOptions,
  VERSE_IMAGE_SHARE_MIME_TYPE,
  VERSE_IMAGE_SHARE_UTI,
} from './verseImage/verseImageCapture';

// The picture handed to native sharing last. The recipient may keep reading it after the
// share returns, so it is deleted when the next picture is captured, which keeps one
// capture on disk instead of one per share for as long as the OS leaves the cache alone.
let lastSharedImageUri: string | null = null;

/** Test seam: forget the last shared picture so one test's file is not released in the next. */
export function forgetLastSharedVerseImage() {
  lastSharedImageUri = null;
}

export interface UseVerseImageShareInput {
  /** The words shared as text when a picture cannot be; empty means nothing to share. */
  shareText: string;
  isSharingVerseImage: boolean;
  setIsSharingVerseImage: Dispatch<SetStateAction<boolean>>;
  setShowVerseImageSheet: Dispatch<SetStateAction<boolean>>;
  verseImageSharePreviewRef: RefObject<View | null>;
  /** Any change closes the picker and abandons a share in flight (another chapter, verse or day). */
  resetKey: string;
  reportFailure: (error: unknown) => void;
}

/**
 * Shares the verse-image picker's preview as a JPEG, falling back to the words as text,
 * for the reader's selected verses and Home's verse of the day alike. The picker's
 * open/closed and busy state stay with the caller, which renders VerseImageShareSheet.
 */
export function useVerseImageShare({
  shareText,
  isSharingVerseImage,
  setIsSharingVerseImage,
  setShowVerseImageSheet,
  verseImageSharePreviewRef,
  resetKey,
  reportFailure,
}: UseVerseImageShareInput) {
  const { t } = useTranslation();
  const verseImageSheetDismissedRef = useRef<(() => void) | null>(null);
  const verseImageShareRequestRef = useRef<object | null>(null);
  useEffect(() => {
    verseImageShareRequestRef.current = null;
    setIsSharingVerseImage(false);
    setShowVerseImageSheet(false);
    return () => {
      verseImageShareRequestRef.current = null;
      verseImageSheetDismissedRef.current?.();
    };
  }, [resetKey, shareText, setIsSharingVerseImage, setShowVerseImageSheet]);

  /** The image picker Modal's onDismiss (iOS reports the end of its close animation). */
  const handleVerseImageSheetDismissed = () => {
    verseImageSheetDismissedRef.current?.();
  };

  const handleCloseVerseImageSheet = () => {
    verseImageShareRequestRef.current = null;
    verseImageSheetDismissedRef.current?.();
    setIsSharingVerseImage(false);
    setShowVerseImageSheet(false);
  };

  // iOS presents a share sheet from the top view controller, which is the picker Modal until its
  // fade-out ends. Presenting then fails ("… whose view is not in the window hierarchy") and the
  // share promise never settles, so the share waits for the picker to be gone: its onDismiss on
  // iOS (the only platform that reports one), the end of the close interaction on Android.
  const closeVerseImageSheetAndWait = () =>
    new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        interaction?.cancel();
        if (verseImageSheetDismissedRef.current === complete) {
          verseImageSheetDismissedRef.current = null;
        }
        resolve();
      };
      verseImageSheetDismissedRef.current = complete;
      if (Platform.OS !== 'ios') {
        timeoutId = setTimeout(complete, 300);
        interaction = InteractionManager.runAfterInteractions(complete);
      }
      setShowVerseImageSheet(false);
    });

  const shareVerseImage = async () => {
    if (!shareText || isSharingVerseImage || verseImageShareRequestRef.current) {
      return;
    }
    const request = {};
    verseImageShareRequestRef.current = request;
    const isCurrent = () => verseImageShareRequestRef.current === request;

    setIsSharingVerseImage(true);
    let releaseUnsharedImage: (() => void) | null = null;

    try {
      // The card is captured while the picker still shows it; the sheet is presented once it's gone.
      let shareImage: (() => Promise<void>) | null = null;
      try {
        const Sharing = await import('expo-sharing');
        if (!isCurrent()) return;

        const available = await Sharing.isAvailableAsync();
        if (!isCurrent()) return;
        if (available && verseImageSharePreviewRef.current) {
          const { captureRef, releaseCapture } = await import('react-native-view-shot');
          if (!isCurrent()) return;
          const previousImageUri = lastSharedImageUri;
          lastSharedImageUri = null;
          if (previousImageUri) {
            try {
              releaseCapture(previousImageUri);
            } catch {
              // A stale file that cannot be deleted must not block this share.
            }
          }
          const imageUri = await captureRef(
            verseImageSharePreviewRef,
            getVerseImageCaptureOptions()
          );
          releaseUnsharedImage = () => releaseCapture(imageUri);
          if (!isCurrent()) return;
          shareImage = () => {
            // The recipient may keep reading this file after native sharing returns.
            releaseUnsharedImage = null;
            lastSharedImageUri = imageUri;
            return Sharing.shareAsync(imageUri, {
              dialogTitle: t('groups.share'),
              mimeType: VERSE_IMAGE_SHARE_MIME_TYPE,
              UTI: VERSE_IMAGE_SHARE_UTI,
            });
          };
        }
      } catch (error) {
        if (!isCurrent()) return;
        reportFailure(error);
      }

      await closeVerseImageSheetAndWait();
      if (!isCurrent()) return;
      // The spinner lives in the closed picker. A native sheet that never reports back must not
      // leave it busy when the picker is opened again.
      setIsSharingVerseImage(false);

      if (shareImage) {
        try {
          // Both share sheets resolve when the user cancels; only a failure rejects.
          await shareImage();
          return;
        } catch (error) {
          if (!isCurrent()) return;
          reportFailure(error);
        }
      }

      await Share.share({ message: shareText });
    } catch (error) {
      if (!isCurrent()) return;
      reportFailure(error);
      // Neither the picture nor the text went out: say so rather than end silently.
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    } finally {
      if (!isCurrent()) {
        try {
          releaseUnsharedImage?.();
        } catch {
          // Best-effort cleanup must not disturb a newer share request.
        }
      }
      if (isCurrent()) {
        verseImageShareRequestRef.current = null;
        setIsSharingVerseImage(false);
      }
    }
  };

  return { handleCloseVerseImageSheet, handleVerseImageSheetDismissed, shareVerseImage };
}
