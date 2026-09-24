import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';
import { spacing, typography } from '../../../design/system';
import { readerThemePreviews } from '../../../design/readerThemePreviews';
import { hexWithAlpha } from '../../../utils/color';
import { styles } from './readerStyles';

export interface ReaderFontSheetProps {
  canAdjustFontSize: boolean;
  canDecrease: boolean;
  canIncrease: boolean;
  decrease: () => void;
  handleCloseFontSizeSheet: () => void;
  handleOpenAllSettings: () => void;
  handleReaderThemeChange: (mode: ThemeMode) => void;
  increase: () => void;
  readingFontFamily: string | undefined;
  scaleValue: (baseSize: number) => number;
  showFontSizeSheet: boolean;
  themeMode: ThemeMode;
}

/** Font size steppers, reader themes and a way into all settings. */
export function ReaderFontSheet({
  canAdjustFontSize,
  canDecrease,
  canIncrease,
  decrease,
  handleCloseFontSizeSheet,
  handleOpenAllSettings,
  handleReaderThemeChange,
  increase,
  readingFontFamily,
  scaleValue,
  showFontSizeSheet,
  themeMode,
}: ReaderFontSheetProps) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  return showFontSizeSheet && canAdjustFontSize ? (
    <Modal
      visible={showFontSizeSheet && canAdjustFontSize}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={handleCloseFontSizeSheet}
    >
      <View style={[styles.fontSheetOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity
          style={styles.fontSheetBackdrop}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={t('interface.close')}
          onPress={handleCloseFontSizeSheet}
        />
        <View
          style={[
            styles.fontSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
              paddingBottom: safeInsets.bottom + spacing.lg,
            },
          ]}
        >
          <View
            style={[styles.fontSheetHandle, { backgroundColor: colors.bibleSecondaryText + '55' }]}
          />
          <Text
            accessibilityRole="header"
            style={[styles.fontSheetTitle, { color: colors.biblePrimaryText }]}
          >
            {t('bible.fontsAndSettings')}
          </Text>
          <View
            style={[styles.readerFontPreview, { backgroundColor: colors.bibleElevatedSurface }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              maxFontSizeMultiplier={1.4}
              style={[
                styles.readerFontPreviewSpecimen,
                {
                  color: colors.biblePrimaryText,
                  fontFamily: readingFontFamily,
                  fontSize: scaleValue(typography.readingBody.fontSize) * 1.7,
                  lineHeight: scaleValue(typography.readingBody.lineHeight) * 1.7,
                },
              ]}
            >
              Aa
            </Text>
          </View>
          <View style={styles.readerFontStepperRow}>
            <TouchableOpacity
              style={[
                styles.readerFontStepperButton,
                { backgroundColor: colors.bibleElevatedSurface },
                !canDecrease && styles.readerFontStepperDisabled,
              ]}
              onPress={decrease}
              disabled={!canDecrease}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={t('learn.decreaseTextSize')}
            >
              <Text
                style={[
                  styles.readerFontStepperText,
                  styles.readerFontStepperSmallText,
                  {
                    color: canDecrease ? colors.biblePrimaryText : colors.bibleSecondaryText + '88',
                  },
                ]}
              >
                A
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.readerFontStepperButton,
                styles.readerFontStepperButtonLarge,
                { backgroundColor: colors.bibleElevatedSurface },
                !canIncrease && styles.readerFontStepperDisabled,
              ]}
              onPress={increase}
              disabled={!canIncrease}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={t('learn.increaseTextSize')}
            >
              <Text
                style={[
                  styles.readerFontStepperText,
                  styles.readerFontStepperLargeText,
                  {
                    color: canIncrease ? colors.biblePrimaryText : colors.bibleSecondaryText + '88',
                  },
                ]}
              >
                A
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.readerThemeModeRail}
          >
            {readerThemePreviews.map((option) => {
              const isActive = themeMode === option.mode;
              return (
                <View key={option.mode} style={styles.readerThemeTileColumn}>
                  <TouchableOpacity
                    style={[
                      styles.readerThemeTile,
                      {
                        borderColor: isActive ? colors.accentPrimary : colors.bibleDivider,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t(option.labelKey)}
                    accessibilityState={{ selected: isActive }}
                    onPress={() => handleReaderThemeChange(option.mode)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={option.background}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View
                      style={[
                        styles.readerThemePaper,
                        {
                          backgroundColor: option.paper,
                          borderColor: hexWithAlpha(option.line, 0.14),
                        },
                      ]}
                    >
                      <View style={styles.readerThemeLineStack}>
                        <View style={[styles.readerThemeLine, { backgroundColor: option.line }]} />
                        <View
                          style={[
                            styles.readerThemeLine,
                            styles.readerThemeLineMedium,
                            { backgroundColor: option.line },
                          ]}
                        />
                        <View
                          style={[
                            styles.readerThemeLine,
                            styles.readerThemeLineShort,
                            { backgroundColor: option.line },
                          ]}
                        />
                      </View>
                    </View>
                    <View
                      style={[
                        styles.readerThemeCheckCircle,
                        {
                          borderColor: isActive ? colors.accentPrimary : colors.bibleDivider,
                          backgroundColor: isActive ? colors.accentPrimary : 'transparent',
                        },
                      ]}
                    >
                      {isActive ? (
                        <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <Text
                    // Duplicates the tile's own label for sighted users only.
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[
                      styles.readerThemeTileLabel,
                      { color: isActive ? colors.accentPrimary : colors.bibleSecondaryText },
                    ]}
                    // Two lines: longer languages cut the theme name under a 128pt tile.
                    numberOfLines={2}
                  >
                    {t(option.labelKey)}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.readerAllSettingsButton}
            onPress={handleOpenAllSettings}
            activeOpacity={0.82}
            accessibilityRole="button"
          >
            <Text style={[styles.readerAllSettingsLabel, { color: colors.biblePrimaryText }]}>
              {t('bible.allSettings')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  ) : null;
}
