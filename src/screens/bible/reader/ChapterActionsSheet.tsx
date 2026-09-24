import { StyleSheet, Modal, Text, TouchableOpacity, View } from 'react-native';
import { radius, spacing } from '../../../design/system';
import type { Dispatch, SetStateAction } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';

export interface ChapterActionsSheetProps {
  bookId: string;
  canAdjustFontSize: boolean;
  canShowTranslationSheet: boolean;
  chapter: number;
  chapterFeedbackEnabled: boolean;
  handleAddToPlaylist: () => void;
  handleAddToQueue: () => void;
  handleDownloadCurrentBookAudio: () => Promise<void>;
  handleOpenChapterAudioShareSheet: () => void;
  handleOpenChapterFeedback: () => void;
  handleOpenFontSizeOptions: () => void;
  handleOpenTranslationOptions: () => void;
  handleShareChapter: () => Promise<void>;
  handleToggleFavorite: () => void;
  isFavorite: boolean;
  setShowChapterActionsSheet: Dispatch<SetStateAction<boolean>>;
  showChapterActionsSheet: boolean;
  showInlineChapterFeedbackComposer: boolean;
}

/** The reader's overflow menu: chapter actions, fonts, translation and feedback. */
export function ChapterActionsSheet({
  bookId,
  canAdjustFontSize,
  canShowTranslationSheet,
  chapter,
  chapterFeedbackEnabled,
  handleAddToPlaylist,
  handleAddToQueue,
  handleDownloadCurrentBookAudio,
  handleOpenChapterAudioShareSheet,
  handleOpenChapterFeedback,
  handleOpenFontSizeOptions,
  handleOpenTranslationOptions,
  handleShareChapter,
  handleToggleFavorite,
  isFavorite,
  setShowChapterActionsSheet,
  showChapterActionsSheet,
  showInlineChapterFeedbackComposer,
}: ChapterActionsSheetProps) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal
      visible={showChapterActionsSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setShowChapterActionsSheet(false)}
    >
      <TouchableOpacity
        style={[
          styles.modalBackdropFill,
          { backgroundColor: colors.overlay, paddingTop: safeInsets.top + spacing.xxl },
        ]}
        activeOpacity={1}
        onPress={() => setShowChapterActionsSheet(false)}
        // Left accessible, this wrapping backdrop folds the whole sheet into one
        // VoiceOver element whose only action is dismiss.
        accessible={false}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={() => setShowChapterActionsSheet(false)}
          style={[
            styles.actionSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.actionSheetTitle, { color: colors.biblePrimaryText }]}
          >
            {getTranslatedBookName(bookId, t)} {chapter}
          </Text>

          {[
            ...(chapterFeedbackEnabled && !showInlineChapterFeedbackComposer
              ? [
                  {
                    key: 'chapter-feedback',
                    icon: 'checkmark-circle-outline',
                    label: t('bible.chapterFeedback'),
                    onPress: handleOpenChapterFeedback,
                  },
                ]
              : []),
            ...(canAdjustFontSize
              ? [
                  {
                    key: 'font-size',
                    icon: 'text-outline',
                    label: t('bible.readerFontsAndSettings'),
                    onPress: handleOpenFontSizeOptions,
                  },
                ]
              : []),
            ...(canShowTranslationSheet
              ? [
                  {
                    key: 'translation',
                    icon: 'book-outline',
                    label: t('bible.selectTranslation'),
                    onPress: handleOpenTranslationOptions,
                  },
                ]
              : []),
            {
              key: 'favorite',
              icon: isFavorite ? 'heart' : 'heart-outline',
              label: isFavorite ? t('bible.removeFromFavorites') : t('bible.addToFavorites'),
              onPress: handleToggleFavorite,
            },
            {
              key: 'playlist',
              icon: 'list-outline',
              label: t('bible.addToSavedPlaylist'),
              onPress: handleAddToPlaylist,
            },
            {
              key: 'queue',
              icon: 'play-forward-outline',
              label: t('bible.addToQueue'),
              onPress: handleAddToQueue,
            },
            {
              key: 'download',
              icon: 'download-outline',
              label: t('bible.downloadBookAudio'),
              onPress: handleDownloadCurrentBookAudio,
            },
            {
              key: 'share-audio',
              icon: 'musical-notes-outline',
              label: t('bible.shareChapterAudio'),
              onPress: handleOpenChapterAudioShareSheet,
            },
            {
              key: 'share',
              icon: 'share-social-outline',
              label: t('bible.shareChapterReference'),
              onPress: () => {
                void handleShareChapter();
              },
            },
          ].map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.actionRow, { borderColor: colors.bibleDivider }]}
              onPress={action.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon as never} size={20} color={colors.biblePrimaryText} />
              <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdropFill: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  actionSheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
