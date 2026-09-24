import { StyleSheet, Modal, Text, TouchableOpacity, View } from 'react-native';
import { radius, shadows, spacing, typography } from '../../../design/system';
import type { Dispatch, SetStateAction } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { readerSharedStyles } from './readerSharedStyles';

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
          readerSharedStyles.audioShareBackdrop,
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

const styles = StyleSheet.create({
  audioShareSheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  audioShareGrabber: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    opacity: 0.9,
  },
  audioShareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  audioShareTitleWrap: {
    flex: 1,
    gap: 2,
  },
  audioShareEyebrow: {
    ...typography.eyebrow,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.1,
  },
  audioShareTitle: {
    ...typography.cardTitle,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.35,
  },
  audioShareCloseButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioShareOption: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  audioShareOptionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioShareOptionLabel: {
    ...typography.bodyStrong,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
});
