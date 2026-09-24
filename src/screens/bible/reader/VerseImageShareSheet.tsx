import {
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { ImageSourcePropType } from 'react-native';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { SHARE_VERSE_BACKGROUND_SOURCES } from '../../../data/shareVerseBackgrounds';
import { VerseImageSharePreview } from './VerseImageSharePreview';

export interface VerseImageShareSheetProps {
  handleSelectVerseImageBackground: (backgroundIndex: number) => void;
  handleShareSelectedVerseImage: () => Promise<void>;
  /** Called once the picker has finished closing (iOS only), so a share sheet can present. */
  handleVerseImageSheetDismissed?: () => void;
  isSharingVerseImage: boolean;
  selectedVerseImageBackground: ImageSourcePropType;
  selectedVerseImageBackgroundIndex: number;
  selectedVerseReferenceLabel: string;
  selectedVerseText: string;
  setShowVerseImageSheet: Dispatch<SetStateAction<boolean>>;
  showVerseImageSheet: boolean;
  /** The current translation's language, so the card sets the verse in a face with its glyphs. */
  translationLanguage?: string;
  verseImageBackgroundCount: number;
  verseImageSharePreviewRef: RefObject<View | null>;
}

/** Shares the selected verses as an image over a chosen background. */
export function VerseImageShareSheet({
  handleSelectVerseImageBackground,
  handleShareSelectedVerseImage,
  handleVerseImageSheetDismissed,
  isSharingVerseImage,
  selectedVerseImageBackground,
  selectedVerseImageBackgroundIndex,
  selectedVerseReferenceLabel,
  selectedVerseText,
  setShowVerseImageSheet,
  showVerseImageSheet,
  translationLanguage,
  verseImageBackgroundCount,
  verseImageSharePreviewRef,
}: VerseImageShareSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={showVerseImageSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setShowVerseImageSheet(false)}
      onDismiss={handleVerseImageSheetDismissed}
    >
      <View
        style={[styles.verseImageSheetOverlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={() => setShowVerseImageSheet(false)}
      >
        <TouchableOpacity
          style={styles.verseImageSheetBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={() => setShowVerseImageSheet(false)}
        />
        <View
          style={[
            styles.verseImageSheetCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <View style={styles.verseImageSheetHeader}>
            <View style={styles.verseImageSheetHeaderCopy}>
              <Text
                accessibilityRole="header"
                style={[styles.verseImageSheetTitle, { color: colors.biblePrimaryText }]}
              >
                {t('bible.chooseVerseImageBackground')}
              </Text>
              <Text
                style={[styles.verseImageSheetReference, { color: colors.bibleSecondaryText }]}
                numberOfLines={2}
              >
                {selectedVerseReferenceLabel}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.verseImageSheetCloseButton,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
              onPress={() => setShowVerseImageSheet(false)}
            >
              <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>

          <VerseImageSharePreview
            previewRef={verseImageSharePreviewRef}
            backgroundSource={selectedVerseImageBackground}
            referenceLabel={selectedVerseReferenceLabel}
            selectedText={selectedVerseText}
            translationLanguage={translationLanguage}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.verseImageBackgroundRail}
          >
            {SHARE_VERSE_BACKGROUND_SOURCES.map((backgroundSource, index) => {
              const isSelected =
                verseImageBackgroundCount > 0 &&
                index === selectedVerseImageBackgroundIndex % verseImageBackgroundCount;

              return (
                <Pressable
                  key={`${index}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${t('bible.chooseVerseImageBackground')} ${index + 1}`}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.verseImageBackgroundButton,
                    {
                      opacity: pressed ? 0.92 : 1,
                      borderColor: isSelected ? colors.accentGreen : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => {
                    handleSelectVerseImageBackground(index);
                  }}
                >
                  <ImageBackground
                    source={backgroundSource}
                    style={styles.verseImageBackgroundTile}
                    imageStyle={styles.verseImageBackgroundTileImage}
                    resizeMode="cover"
                  >
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(12, 11, 9, 0.04)', 'rgba(12, 11, 9, 0.48)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {isSelected ? (
                      <View
                        style={[
                          styles.verseImageBackgroundSelectedBadge,
                          { backgroundColor: colors.accentGreen },
                        ]}
                      >
                        <Ionicons name="checkmark" size={13} color={colors.bibleBackground} />
                      </View>
                    ) : null}
                  </ImageBackground>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.verseImageSheetActions}>
            <TouchableOpacity
              style={[
                styles.verseImageSheetActionButton,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
              activeOpacity={0.88}
              onPress={() => setShowVerseImageSheet(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.verseImageSheetActionText, { color: colors.biblePrimaryText }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.verseImageSheetActionButton,
                styles.verseImageSheetShareButton,
                {
                  backgroundColor: colors.accentPrimary,
                  borderColor: colors.accentPrimary,
                },
              ]}
              activeOpacity={0.88}
              onPress={() => {
                void handleShareSelectedVerseImage();
              }}
              disabled={isSharingVerseImage}
              accessibilityRole="button"
              // The label text is swapped for a spinner while sharing.
              accessibilityLabel={t('groups.share')}
              accessibilityState={{ disabled: isSharingVerseImage, busy: isSharingVerseImage }}
            >
              {isSharingVerseImage ? (
                <ActivityIndicator size="small" color={colors.bibleBackground} />
              ) : (
                <Text style={[styles.verseImageSheetActionText, { color: colors.bibleBackground }]}>
                  {t('groups.share')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  verseImageSheetOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  verseImageSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  verseImageSheetCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  verseImageSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  verseImageSheetHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  verseImageSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  verseImageSheetReference: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  verseImageSheetCloseButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  verseImageBackgroundRail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  verseImageBackgroundButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  verseImageBackgroundTile: {
    width: 88,
    height: 118,
    justifyContent: 'flex-end',
  },
  verseImageBackgroundTileImage: {
    borderRadius: radius.lg,
  },
  verseImageBackgroundSelectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verseImageSheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  verseImageSheetActionButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  verseImageSheetShareButton: {
    minWidth: 132,
  },
  verseImageSheetActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
