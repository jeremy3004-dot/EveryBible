import type { AudioAvailability } from '../../../services/audio/audioAvailability';
import { useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { type ThemeMode } from '../../../contexts/ThemeContext';
import { trackBibleExperienceEvent } from '../../../services/analytics/bibleExperienceAnalytics';
import { buildBibleDeepLink } from '../../../services/bible/deepLinkParser';
import { describeAudioDownloadError } from '../../../services/audio/audioDownloadErrorMessage';
import { syncPreferences } from '../../../services/sync';
import type { ReaderAudioPositionSnapshot } from '../ReaderAudioPositionParts';
import type { BibleTranslation } from '../../../types';
import {
  getNextTranslationSheetVisibility,
  shouldReplayActiveAudioForTranslationChange,
} from '../bibleReaderModel';
import { rootNavigationRef } from '../../../navigation/rootNavigation';
import { useBibleStore } from '../../../stores/bibleStore';
import type { AudioPortionShareDraft } from './audioShareDependencies';
import { useChapterAudioShare } from './useChapterAudioShare';
import type { NavigationProp } from './readerConstants';

export interface UseReaderChapterActionsInput {
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
  activeAudioTranslationId: string | null;
  addChapterToDefaultPlaylist: (bookId: string, chapter: number) => string;
  addToQueue: (bookId: string, chapter: number) => void;
  audioEnabled: boolean;
  audioPositionRef: RefObject<ReaderAudioPositionSnapshot>;
  bookId: string;
  canAdjustFontSize: boolean;
  canShowTranslationSheet: true;
  chapter: number;
  chapterShareTitle: string;
  currentTranslation: string;
  currentTranslationInfo: BibleTranslation | undefined;
  downloadAudioForBook: (translationId: string, bookId: string) => Promise<void>;
  focusVerse: number | undefined;
  getTranslationAudioAvailability: (
    translation: Pick<BibleTranslation, 'id' | 'hasAudio' | 'downloadedAudioBooks'>,
    targetBookId?: string | undefined
  ) => AudioAvailability;
  isCurrentAudioChapter: boolean;
  isFavorite: boolean;
  navigateChapterForTranslation: (
    targetTranslationId: string,
    bookId: string,
    chapter: number,
    verse?: number | undefined
  ) => Promise<void>;
  navigation: NavigationProp;
  setAudioPortionEndMs: Dispatch<SetStateAction<number>>;
  setAudioPortionShareDraft: Dispatch<SetStateAction<AudioPortionShareDraft | null>>;
  setAudioPortionStartMs: Dispatch<SetStateAction<number>>;
  setChapterSessionMode: Dispatch<SetStateAction<'listen' | 'read'>>;
  setPreferredChapterLaunchMode: (mode: 'listen' | 'read') => void;
  setShowAudioOptionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowChapterActionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowFontSizeSheet: Dispatch<SetStateAction<boolean>>;
  setShowTranslationSheet: Dispatch<SetStateAction<boolean>>;
  setTheme: (mode: ThemeMode) => void;
  toggleFavorite: (bookId: string, chapter: number) => void;
}

/** The reader's sheet and chapter actions: fonts, themes and settings, the book picker and search, switching translation, favorites, playlist, queue, sharing and downloading the chapter's audio. */
export function useReaderChapterActions({
  activeAudioBookId,
  activeAudioChapter,
  activeAudioTranslationId,
  addChapterToDefaultPlaylist,
  addToQueue,
  audioEnabled,
  audioPositionRef,
  bookId,
  canAdjustFontSize,
  canShowTranslationSheet,
  chapter,
  chapterShareTitle,
  currentTranslation,
  currentTranslationInfo,
  downloadAudioForBook,
  focusVerse,
  getTranslationAudioAvailability,
  isCurrentAudioChapter,
  isFavorite,
  navigateChapterForTranslation,
  navigation,
  setAudioPortionEndMs,
  setAudioPortionShareDraft,
  setAudioPortionStartMs,
  setChapterSessionMode,
  setPreferredChapterLaunchMode,
  setShowAudioOptionsSheet,
  setShowChapterActionsSheet,
  setShowFontSizeSheet,
  setShowTranslationSheet,
  setTheme,
  toggleFavorite,
}: UseReaderChapterActionsInput) {
  const { t } = useTranslation();
  const downloadRequestRef = useRef(0);
  const downloadOwnerMountedRef = useRef(false);
  useLayoutEffect(() => {
    downloadOwnerMountedRef.current = true;
    return () => {
      downloadOwnerMountedRef.current = false;
      downloadRequestRef.current += 1;
    };
  }, [currentTranslation, bookId, chapter]);
  const handleCloseFontSizeSheet = () => {
    setShowFontSizeSheet(false);
  };
  const handleReaderThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    syncPreferences().catch(() => {});
  };
  const handleOpenAllSettings = () => {
    handleCloseFontSizeSheet();

    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('More', { screen: 'Settings' });
    }
  };
  const handleOpenBookPicker = () => {
    navigation.push('BiblePicker', {
      initialBookId: bookId,
    });
  };

  const handleOpenBibleSearch = () => {
    setShowAudioOptionsSheet(false);
    setShowFontSizeSheet(false);
    setShowTranslationSheet(false);
    setShowChapterActionsSheet(false);
    navigation.navigate('BibleBrowser', {
      initialBookId: bookId,
      focusSearch: true,
    });
  };

  const handleCloseTranslationSheet = () => {
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
  };

  const handleTranslationActivated = (translation: BibleTranslation) => {
    const audioAvailability = getTranslationAudioAvailability(translation, bookId);
    const shouldReplayAudio = shouldReplayActiveAudioForTranslationChange({
      currentTranslationId: currentTranslation,
      nextTranslationId: translation.id,
      audioEnabled: audioAvailability.canPlayAudio,
      bookId,
      chapter,
      activeAudioTranslationId,
      activeAudioBookId,
      activeAudioChapter,
    });

    // Keeps the listener's intent: a playing chapter continues in the new
    // translation, a paused one is re-targeted and stays paused until Play.
    if (shouldReplayAudio) {
      void navigateChapterForTranslation(
        translation.id,
        bookId,
        chapter,
        translation.audioGranularity === 'verse' ? focusVerse : undefined
      );
    }
  };

  const handleToggleFavorite = () => {
    toggleFavorite(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: isFavorite ? 'unfavorite' : 'favorite',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToPlaylist = () => {
    addChapterToDefaultPlaylist(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'playlist',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToQueue = () => {
    addToQueue(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'queue',
    });
    setShowChapterActionsSheet(false);
  };

  const handleShareChapter = async () => {
    setShowChapterActionsSheet(false);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'share',
    });
    const bookName = getTranslatedBookName(bookId, t);
    const url = buildBibleDeepLink(bookId, chapter);
    const text = `${bookName} ${chapter}`;
    await Share.share(
      Platform.OS === 'android'
        ? { message: url ? `${text}\n${url}` : text }
        : { message: text, url }
    );
  };

  const {
    chapterAudioShareActionLabel,
    handleChapterAudioShareSheetDismissed,
    handleOpenChapterAudioShareSheet,
    handleShareAudioPortion,
    handleShareFullChapterAudio,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  } = useChapterAudioShare({
    audioPositionRef,
    bookId,
    chapter,
    chapterShareTitle,
    currentTranslation,
    isCurrentAudioChapter,
    setAudioPortionEndMs,
    setAudioPortionShareDraft,
    setAudioPortionStartMs,
    setShowAudioOptionsSheet,
    setShowChapterActionsSheet,
  });

  const handleDownloadCurrentBookAudio = async () => {
    setShowChapterActionsSheet(false);
    const request = ++downloadRequestRef.current;
    const isCurrentRequest = () =>
      downloadOwnerMountedRef.current && request === downloadRequestRef.current;

    if (!currentTranslationInfo?.hasAudio || !audioEnabled) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    try {
      await downloadAudioForBook(currentTranslation, bookId);
      if (!isCurrentRequest()) return;
      // Cancellation resolves without throwing. Confirm the captured book is actually
      // present before claiming it was saved or recording a successful download.
      const saved = useBibleStore
        .getState()
        .translations.some(
          (translation) =>
            translation.id === currentTranslation &&
            translation.downloadedAudioBooks.includes(bookId)
        );
      if (!saved) return;
      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        detail: 'download',
      });
      Alert.alert(t('common.ok'), t('bible.audioSavedOffline'));
    } catch (downloadError) {
      if (isCurrentRequest()) {
        Alert.alert(t('common.error'), describeAudioDownloadError(downloadError, t));
      }
    }
  };

  const handleOpenFontSizeOptions = () => {
    setShowAudioOptionsSheet(false);
    setShowChapterActionsSheet(false);
    setShowTranslationSheet(false);

    if (!canAdjustFontSize) {
      return;
    }

    setChapterSessionMode('read');
    setPreferredChapterLaunchMode('read');
    navigation.setParams({ preferredMode: 'read', autoplayAudio: false });
    setShowFontSizeSheet(true);
  };

  const handleOpenTranslationOptions = () => {
    setShowAudioOptionsSheet(false);
    setShowChapterActionsSheet(false);
    setShowFontSizeSheet(false);

    if (!canShowTranslationSheet) {
      return;
    }

    setShowTranslationSheet(true);
  };

  return {
    chapterAudioShareActionLabel,
    handleChapterAudioShareSheetDismissed,
    handleAddToPlaylist,
    handleAddToQueue,
    handleCloseFontSizeSheet,
    handleCloseTranslationSheet,
    handleDownloadCurrentBookAudio,
    handleOpenAllSettings,
    handleOpenBibleSearch,
    handleOpenBookPicker,
    handleOpenChapterAudioShareSheet,
    handleOpenFontSizeOptions,
    handleOpenTranslationOptions,
    handleReaderThemeChange,
    handleShareAudioPortion,
    handleShareChapter,
    handleShareFullChapterAudio,
    handleToggleFavorite,
    handleTranslationActivated,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  };
}
