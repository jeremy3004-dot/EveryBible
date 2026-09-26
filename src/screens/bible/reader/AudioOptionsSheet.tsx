import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { layout, radius, shadows, spacing, typography } from '../../../design/system';
import { useTheme } from '../../../contexts/ThemeContext';
import { BackArrowIcon } from '../../../components/ui/IconButton';
import { useAudioStore } from '../../../stores/audioStore';
import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  RepeatPassage,
  SleepTimerOption,
} from '../../../types/audio';
import { AudioSheetMainPage, type ReaderAudioTrack } from './audioSheet/AudioSheetMainPage';
import { PassagePickerPage } from './audioSheet/PassagePickerPage';
import { SoundLibraryPage } from './audioSheet/SoundLibraryPage';
import type { AudioSheetPage } from './audioSheet/audioSheetModel';

export interface AudioOptionsSheetProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  changeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  changePlaybackRate: (rate: PlaybackRate) => Promise<void>;
  handleDownloadCurrentBookAudio: () => Promise<void>;
  handleOpenChapterAudioShareSheet: () => void;
  isCurrentAudioChapter: boolean;
  /** Opens Read Along for the chapter; the sheet closes first. */
  onOpenReadAlong: () => void;
  playbackRate: PlaybackRate;
  /** The chapter on screen, which the sheet describes and whose book a passage repeats in. */
  readerAudioTrack: ReaderAudioTrack;
  repeatMode: RepeatMode;
  setShowAudioOptionsSheet: Dispatch<SetStateAction<boolean>>;
  showAudioOptionsSheet: boolean;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: SleepTimerOption) => void;
}

// The sheet leaves this much of the screen above it, so the backdrop stays tappable.
const SHEET_TOP_GAP = spacing.xxl;

/**
 * The top audio button's sheet: playback settings on its first page, with the sound
 * library and the passage picker pushed inside it (back returns to the first page).
 */
export function AudioOptionsSheet({
  backgroundMusicChoice,
  changeBackgroundMusicChoice,
  changePlaybackRate,
  handleDownloadCurrentBookAudio,
  handleOpenChapterAudioShareSheet,
  isCurrentAudioChapter,
  onOpenReadAlong,
  playbackRate,
  readerAudioTrack,
  repeatMode,
  setShowAudioOptionsSheet,
  showAudioOptionsSheet,
  sleepTimerRemaining,
  startSleepTimer,
}: AudioOptionsSheetProps) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const [page, setPage] = useState<AudioSheetPage>('main');
  const repeatPassage = useAudioStore((state) => state.repeatPassage);
  const setRepeatPassage = useAudioStore((state) => state.setRepeatPassage);

  const closeSheet = () => {
    setPage('main');
    setShowAudioOptionsSheet(false);
  };
  // Back (Android's button, VoiceOver's escape) leaves a pushed page before the sheet.
  const goBack = () => {
    if (page === 'main') closeSheet();
    else setPage('main');
  };

  const handleConfirmPassage = (passage: RepeatPassage) => {
    setRepeatPassage(passage);
    setPage('main');
  };

  // An alert cannot show over this modal, so the sheet goes first.
  const handleDownload = () => {
    closeSheet();
    void handleDownloadCurrentBookAudio();
  };

  const handleOpenReadAlong = () => {
    closeSheet();
    onOpenReadAlong();
  };

  const title =
    page === 'library'
      ? t('audio.backgroundSound')
      : page === 'passage'
        ? t('audio.passagePickerTitle')
        : t('audio.sheetTitle');

  return (
    <Modal
      visible={showAudioOptionsSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={goBack}
    >
      {/* Gestures inside a Modal need their own root on Android. */}
      <GestureHandlerRootView style={styles.root}>
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={closeSheet}
          // The sheet has a visible Close; the backdrop would only repeat it.
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={goBack}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
              maxHeight: windowHeight - safeInsets.top - SHEET_TOP_GAP,
              paddingBottom: Math.max(safeInsets.bottom, spacing.md) + spacing.md,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.bibleDivider }]} />
          <View style={styles.header}>
            {page !== 'main' ? (
              <TouchableOpacity
                style={styles.headerButton}
                hitSlop={6}
                onPress={() => setPage('main')}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <BackArrowIcon size={20} color={colors.biblePrimaryText} />
              </TouchableOpacity>
            ) : null}
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.biblePrimaryText }]}
            >
              {title}
            </Text>
            <TouchableOpacity
              style={styles.headerButton}
              hitSlop={6}
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <X size={20} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            alwaysBounceVertical={false}
          >
            {page === 'library' ? (
              <SoundLibraryPage
                backgroundMusicChoice={backgroundMusicChoice}
                changeBackgroundMusicChoice={changeBackgroundMusicChoice}
              />
            ) : page === 'passage' ? (
              <PassagePickerPage
                bookId={readerAudioTrack.bookId}
                chapter={readerAudioTrack.chapter}
                translationId={readerAudioTrack.translationId}
                storedPassage={repeatPassage}
                onConfirm={handleConfirmPassage}
              />
            ) : (
              <AudioSheetMainPage
                backgroundMusicChoice={backgroundMusicChoice}
                changePlaybackRate={changePlaybackRate}
                isCurrentAudioChapter={isCurrentAudioChapter}
                onDownload={handleDownload}
                onOpenLibrary={() => setPage('library')}
                onOpenPassagePicker={() => setPage('passage')}
                onOpenReadAlong={handleOpenReadAlong}
                onShareClip={handleOpenChapterAudioShareSheet}
                playbackRate={playbackRate}
                repeatMode={repeatMode}
                sleepTimerRemaining={sleepTimerRemaining}
                startSleepTimer={startSleepTimer}
                track={readerAudioTrack}
              />
            )}
          </ScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadows.floating,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
    marginBottom: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.cardTitle,
    fontSize: 18,
    lineHeight: 22,
    flex: 1,
    flexShrink: 1,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: spacing.sm,
  },
});
