import type { Dispatch, SetStateAction } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { styles } from './readerStyles';

export interface ChapterAudioShareSheetProps {
  chapterShareTitle: string;
  handleShareAudioPortion: () => Promise<void>;
  handleShareFullChapterAudio: () => Promise<void>;
  setShowChapterAudioShareSheet: Dispatch<SetStateAction<boolean>>;
  showChapterAudioShareSheet: boolean;
}

/** Share the whole chapter audio or a clip of it. */
export function ChapterAudioShareSheet({
  chapterShareTitle,
  handleShareAudioPortion,
  handleShareFullChapterAudio,
  setShowChapterAudioShareSheet,
  showChapterAudioShareSheet,
}: ChapterAudioShareSheetProps) {
  const { colors } = useTheme();
  // The eyebrow is translated copy set in the Latin-only display face.
  const displayFont = useDisplayFont();
  const safeInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal
      visible={showChapterAudioShareSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setShowChapterAudioShareSheet(false)}
    >
      <TouchableOpacity
        style={[
          styles.audioShareBackdrop,
          {
            backgroundColor: colors.overlay,
            paddingBottom: Math.max(safeInsets.bottom, 12) + spacing.md,
          },
        ]}
        activeOpacity={1}
        onPress={() => setShowChapterAudioShareSheet(false)}
        // Left accessible, this wrapping backdrop folds the whole sheet into one
        // VoiceOver element whose only action is dismiss.
        accessible={false}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={() => setShowChapterAudioShareSheet(false)}
          style={[
            styles.audioShareSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <View style={[styles.audioShareGrabber, { backgroundColor: colors.bibleDivider }]} />

          <View style={styles.audioShareHeader}>
            <View style={styles.audioShareTitleWrap}>
              <Text
                style={[
                  styles.audioShareEyebrow,
                  displayFont.regular,
                  { color: colors.bibleSecondaryText },
                ]}
              >
                {t('groups.share')}
              </Text>
              <Text
                accessibilityRole="header"
                style={[styles.audioShareTitle, { color: colors.biblePrimaryText }]}
              >
                {chapterShareTitle}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={6}
              onPress={() => setShowChapterAudioShareSheet(false)}
              style={[
                styles.audioShareCloseButton,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
            >
              <Ionicons name="close" size={16} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>

          {[
            {
              key: 'full-audio',
              icon: 'musical-notes-outline',
              label: t('bible.shareChapterAudio'),
              onPress: () => {
                void handleShareFullChapterAudio();
              },
            },
            {
              key: 'audio-clip',
              icon: 'cut-outline',
              label: t('bible.shareAudioPortion'),
              onPress: () => {
                void handleShareAudioPortion();
              },
            },
          ].map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.audioShareOption,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
              activeOpacity={0.9}
              onPress={action.onPress}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.audioShareOptionIconWrap,
                  {
                    backgroundColor: colors.bibleSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
              >
                <Ionicons name={action.icon as never} size={18} color={colors.bibleAccent} />
              </View>
              <Text style={[styles.audioShareOptionLabel, { color: colors.biblePrimaryText }]}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
