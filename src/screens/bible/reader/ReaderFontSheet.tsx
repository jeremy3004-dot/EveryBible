import { StyleSheet, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { layout, radius, spacing, typography } from '../../../design/system';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';
import { readerThemePreviews } from '../../../design/readerThemePreviews';
import { hexWithAlpha } from '../../../utils/color';

export interface ReaderFontSheetProps {
  canAdjustFontSize: boolean;
  canDecrease: boolean;
  canIncrease: boolean;
  decrease: () => void;
  /** The current size's name ("Medium"), spoken as the stepper's value. */
  fontSizeLabel: string;
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
  fontSizeLabel,
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
      <View
        style={[styles.fontSheetOverlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={handleCloseFontSizeSheet}
      >
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
          <View
            style={styles.readerFontStepperRow}
            // One adjustable element for screen readers: the size preview above
            // is hidden from them, so two plain buttons stepped the size silently.
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('settings.fontSize')}
            accessibilityValue={{ text: fontSizeLabel }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment' && canIncrease) increase();
              if (event.nativeEvent.actionName === 'decrement' && canDecrease) decrease();
            }}
          >
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

const styles = StyleSheet.create({
  fontSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fontSheetBackdrop: {
    flex: 1,
  },
  fontSheet: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 16,
    gap: 16,
  },
  fontSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
  },
  fontSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  readerFontStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readerFontStepperButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerFontStepperButtonLarge: {
    flex: 1.2,
  },
  readerFontStepperDisabled: {
    opacity: 0.48,
  },
  readerFontStepperText: {
    fontWeight: '500',
  },
  readerFontStepperSmallText: {
    fontSize: 26,
    lineHeight: 32,
  },
  readerFontStepperLargeText: {
    fontSize: 42,
    lineHeight: 48,
  },
  readerFontPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  readerFontPreviewSpecimen: {
    textAlign: 'center',
  },
  readerThemeModeRail: {
    gap: 10,
    paddingRight: 2,
  },
  readerThemeTileColumn: {
    width: 128,
    alignItems: 'center',
    gap: spacing.sm,
  },
  readerThemeTileLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  readerThemeTile: {
    width: 128,
    height: 112,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  readerThemePaper: {
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  readerThemeLineStack: {
    gap: 8,
  },
  readerThemeLine: {
    width: '82%',
    height: 4,
    borderRadius: radius.pill,
    opacity: 0.88,
  },
  readerThemeLineMedium: {
    width: '64%',
  },
  readerThemeLineShort: {
    width: '48%',
  },
  readerThemeCheckCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  readerAllSettingsButton: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerAllSettingsLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
