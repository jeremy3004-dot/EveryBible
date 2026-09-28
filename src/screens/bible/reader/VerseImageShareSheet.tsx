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
import { useCallback, useState, type RefObject } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { SHARE_VERSE_BACKGROUND_SOURCES } from '../../../data/shareVerseBackgrounds';
import { Slider } from '../../../components/ui/Slider';
import { TabSwitch } from '../../../components/ui/TabSwitch';
import { VerseImageSharePreview } from './VerseImageSharePreview';
import { useVerseImageFonts } from './verseImage/verseImageFonts';
import {
  canVerseImageFontDraw,
  DEFAULT_VERSE_IMAGE_STYLE,
  getDrawableVerseImageFonts,
  getVerseImageFontSample,
  VERSE_IMAGE_COLORS,
  VERSE_IMAGE_SIZE,
  type VerseImageStyle,
} from './verseImage/verseImageStyle';

type EditorTab = 'picture' | 'font' | 'color' | 'size';

const toSliderValue = (size: number) =>
  (size - VERSE_IMAGE_SIZE.min) / (VERSE_IMAGE_SIZE.max - VERSE_IMAGE_SIZE.min);
const fromSliderValue = (value: number) =>
  Math.round(VERSE_IMAGE_SIZE.min + value * (VERSE_IMAGE_SIZE.max - VERSE_IMAGE_SIZE.min));

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
  handleCloseVerseImageSheet: () => void;
  showVerseImageSheet: boolean;
  verseImageBackgroundCount: number;
  verseImageSharePreviewRef: RefObject<View | null>;
}

/**
 * Shares the selected verses as a picture. Four tabs under the preview choose the
 * background, the face, the words' colour and their size; the words never run past
 * the picture, whatever size is asked for. The shared image is a capture of the
 * preview, so the choices live here and are kept while the reader stays open.
 */
export function VerseImageShareSheet({
  handleSelectVerseImageBackground,
  handleShareSelectedVerseImage,
  handleVerseImageSheetDismissed,
  isSharingVerseImage,
  selectedVerseImageBackground,
  selectedVerseImageBackgroundIndex,
  selectedVerseReferenceLabel,
  selectedVerseText,
  handleCloseVerseImageSheet,
  showVerseImageSheet,
  verseImageBackgroundCount,
  verseImageSharePreviewRef,
}: VerseImageShareSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [tab, setTab] = useState<EditorTab>('picture');
  const [style, setStyle] = useState<VerseImageStyle>(DEFAULT_VERSE_IMAGE_STYLE);
  const [isSizeCapped, setIsSizeCapped] = useState(false);
  const handleFitChange = useCallback((capped: boolean) => setIsSizeCapped(capped), []);
  const fontsLoaded = useVerseImageFonts(showVerseImageSheet);
  // Only the faces with a glyph for every character of this verse are offered: all
  // eight for English, those with Cyrillic for Russian, none for Hindi or Arabic
  // (the verse keeps the platform font, so there is nothing to choose).
  const drawableFonts = getDrawableVerseImageFonts(selectedVerseText);
  const canChooseFont = drawableFonts.length > 1;
  const activeTab = !canChooseFont && tab === 'font' ? 'picture' : tab;
  const selectedFontId = canVerseImageFontDraw(style.fontId, selectedVerseText)
    ? style.fontId
    : 'classic';
  // Each chip shows a word from the verse, so the sample is in the verse's own script.
  const fontSample = getVerseImageFontSample(selectedVerseText);
  const tabs: { key: EditorTab; label: string }[] = [
    { key: 'picture', label: t('bible.verseImage.tabs.picture') },
    ...(canChooseFont ? [{ key: 'font' as const, label: t('bible.verseImage.tabs.font') }] : []),
    { key: 'color', label: t('bible.verseImage.tabs.color') },
    { key: 'size', label: t('bible.verseImage.tabs.size') },
  ];

  const renderPicturePanel = () => (
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
              // Android's automatic resize skips bundled resources, so
              // tiny rail thumbnails otherwise decode the full photograph.
              resizeMethod="resize"
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
  );

  const renderFontPanel = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.verseImageChoiceRail}
    >
      {drawableFonts.map((font) => {
        const isSelected = font.id === selectedFontId;
        const name = t(`bible.verseImage.fonts.${font.id}`);
        return (
          <Pressable
            key={font.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={name}
            style={({ pressed }) => [
              styles.verseImageFontChip,
              {
                opacity: pressed ? 0.9 : 1,
                borderColor: isSelected ? colors.biblePrimaryText : colors.bibleDivider,
                backgroundColor: isSelected ? colors.bibleElevatedSurface : colors.bibleSurface,
              },
            ]}
            onPress={() => setStyle((current) => ({ ...current, fontId: font.id }))}
          >
            <Text
              style={[
                styles.verseImageFontSample,
                {
                  // Until the extra faces load, the chips show the platform font.
                  fontFamily:
                    fontsLoaded || font.id === 'classic' || font.id === 'modern'
                      ? font.fontFamily
                      : undefined,
                  fontSize: Math.round(20 * font.scale),
                  textTransform: font.uppercase ? 'uppercase' : 'none',
                  color: colors.biblePrimaryText,
                },
              ]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {fontSample}
            </Text>
            <Text
              style={[styles.verseImageFontName, { color: colors.bibleSecondaryText }]}
              numberOfLines={1}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderColorPanel = () => (
    <View style={styles.verseImageSwatches}>
      {VERSE_IMAGE_COLORS.map((color) => {
        const isSelected = color.id === style.colorId;
        return (
          <Pressable
            key={color.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(`bible.verseImage.colors.${color.id}`)}
            style={styles.verseImageSwatchCell}
            onPress={() => setStyle((current) => ({ ...current, colorId: color.id }))}
          >
            <View
              style={[
                styles.verseImageSwatch,
                {
                  backgroundColor: color.hex,
                  borderColor: isSelected ? colors.biblePrimaryText : colors.bibleDivider,
                  borderWidth: isSelected ? 3 : 1,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );

  const renderSizePanel = () => (
    <View style={styles.verseImageSizePanel}>
      <View style={styles.verseImageSizeRow}>
        <Text
          style={[styles.verseImageSizeSmall, { color: colors.biblePrimaryText }]}
          // Decorative: the slider itself is named.
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          A
        </Text>
        <Slider
          testID="verse-image-size"
          value={toSliderValue(style.size)}
          onValueChange={(value) =>
            setStyle((current) => ({ ...current, size: fromSliderValue(value) }))
          }
          onSlidingComplete={(value) =>
            setStyle((current) => ({ ...current, size: fromSliderValue(value) }))
          }
          accessibilityLabel={t('bible.verseImage.size')}
          minimumTrackColor={colors.biblePrimaryText}
          maximumTrackColor={colors.bibleDivider}
          thumbColor={colors.biblePrimaryText}
          style={styles.verseImageSizeSlider}
        />
        <Text
          style={[styles.verseImageSizeLarge, { color: colors.biblePrimaryText }]}
          // Decorative: the slider itself is named.
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          A
        </Text>
      </View>
      <Text
        style={[styles.verseImageSizeHint, { color: colors.bibleSecondaryText }]}
        accessibilityLiveRegion="polite"
      >
        {isSizeCapped ? t('bible.verseImage.sizeMaxed') : ''}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={showVerseImageSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={handleCloseVerseImageSheet}
      onDismiss={handleVerseImageSheetDismissed}
    >
      <View
        style={[styles.verseImageSheetOverlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={handleCloseVerseImageSheet}
      >
        <TouchableOpacity
          style={styles.verseImageSheetBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={handleCloseVerseImageSheet}
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
          {/* The card stops at 88% of the screen; at the largest text sizes its header,
              preview and buttons outgrow that, so they scroll rather than being clipped. */}
          <ScrollView
            testID="verse-image-sheet-scroll"
            style={styles.verseImageSheetScroll}
            showsVerticalScrollIndicator={false}
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
                onPress={handleCloseVerseImageSheet}
              >
                <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            <VerseImageSharePreview
              previewRef={verseImageSharePreviewRef}
              backgroundSource={selectedVerseImageBackground}
              referenceLabel={selectedVerseReferenceLabel}
              selectedText={selectedVerseText}
              style={style}
              onFitChange={handleFitChange}
            />

            <TabSwitch
              segments={tabs}
              value={activeTab}
              onChange={(key) => setTab(key as EditorTab)}
              fullWidth
              size="md"
              accessibilityLabel={t('bible.verseImage.tabsLabel')}
              style={styles.verseImageTabs}
            />

            <View style={styles.verseImagePanel}>
              {activeTab === 'picture'
                ? renderPicturePanel()
                : activeTab === 'font'
                  ? renderFontPanel()
                  : activeTab === 'color'
                    ? renderColorPanel()
                    : renderSizePanel()}
            </View>

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
                onPress={handleCloseVerseImageSheet}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.verseImageSheetActionText, { color: colors.biblePrimaryText }]}
                >
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
                  <Text
                    style={[styles.verseImageSheetActionText, { color: colors.bibleBackground }]}
                  >
                    {t('groups.share')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  verseImageSheetScroll: {
    flexGrow: 0,
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
  verseImageTabs: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  // One height for every tab's panel, so the sheet does not jump as tabs change.
  verseImagePanel: {
    minHeight: 104,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  verseImageBackgroundRail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  verseImageChoiceRail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  verseImageFontChip: {
    width: 92,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  verseImageFontSample: {
    lineHeight: 30,
  },
  verseImageFontName: {
    ...typography.label,
    fontSize: 11,
  },
  // Sixteen swatches in two rows of eight; each cell is an eighth of the row, and taller
  // than the swatch, so every one keeps a 44pt-high touch target.
  verseImageSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },
  verseImageSwatchCell: {
    width: '12.5%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verseImageSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  verseImageSizePanel: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  verseImageSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  verseImageSizeSlider: {
    flex: 1,
  },
  verseImageSizeSmall: {
    fontSize: 13,
    fontWeight: '600',
  },
  verseImageSizeLarge: {
    fontSize: 24,
    fontWeight: '600',
  },
  verseImageSizeHint: {
    ...typography.label,
    fontSize: 12,
    textAlign: 'center',
    minHeight: 18,
  },
  verseImageBackgroundButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  verseImageBackgroundTile: {
    width: 72,
    height: 88,
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
