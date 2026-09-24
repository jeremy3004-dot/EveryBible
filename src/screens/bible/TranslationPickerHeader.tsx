import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing } from '../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';

const CLOSE_GLYPH_SIZE = 22;
// The touch target grows to the 44pt floor around the 22pt glyph; the negative
// margins give the extra back, so the header keeps its height and the glyph
// stays at the header's trailing edge.
const CLOSE_TARGET_OUTSET = (layout.minTouchTarget - CLOSE_GLYPH_SIZE) / 2;

interface TranslationPickerHeaderProps {
  onClose: () => void;
  /** The host sheet's padding and spacing. */
  style?: StyleProp<ViewStyle>;
  /** The host sheet's title size. */
  titleStyle?: StyleProp<TextStyle>;
}

// "Select Translation" plus close, shared by the reader's and the Bible
// browser's translation sheets.
export function TranslationPickerHeader({
  onClose,
  style,
  titleStyle,
}: TranslationPickerHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.header, style]}>
      {/* Capped: uncapped at AX5 "Translation" alone is wider than the sheet
          and iOS broke it mid-word. */}
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
        style={[titleStyle, styles.title, { color: colors.biblePrimaryText }]}
      >
        {t('bible.selectTranslation')}
      </Text>
      <TouchableOpacity
        onPress={onClose}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel={t('interface.close')}
      >
        <Ionicons name="close" size={CLOSE_GLYPH_SIZE} color={colors.bibleSecondaryText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  close: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -CLOSE_TARGET_OUTSET,
    marginEnd: -CLOSE_TARGET_OUTSET,
  },
});
