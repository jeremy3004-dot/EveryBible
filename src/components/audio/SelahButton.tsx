import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout } from '../../design/system';
import { useSelah } from '../../hooks/audioPlayer/useSelah';
import { selectionHaptic } from '../../utils/haptics';

const REGULAR_SIZE = 36;
const COMPACT_SIZE = 28;
const ICON_STROKE_WIDTH = 1.8;

interface SelahButtonProps {
  /** 'compact' is the icon-only form the collapsed player strip uses. */
  size?: 'regular' | 'compact';
  /** The reading surface's colours (default) or the app's, off the reader. */
  tone?: 'reader' | 'app';
}

/**
 * "Pause the reading, keep the music." A feather in a hairline accent circle, filled
 * with the accent while Selah is on. Only offered while a background sound other than
 * Off plays under a loaded chapter; otherwise it renders nothing, and callers keep its
 * slot so the controls around it do not move.
 */
export const SelahButton = memo(function SelahButton({
  size = 'regular',
  tone = 'reader',
}: SelahButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isSelahActive, canSelah, toggleSelah } = useSelah();

  if (!canSelah) {
    return null;
  }

  const accent = tone === 'reader' ? colors.bibleAccent : colors.accentPrimary;
  const diameter = size === 'compact' ? COMPACT_SIZE : REGULAR_SIZE;
  const iconSize = size === 'compact' ? 16 : 18;
  // Extends the touch target to 44pt whatever the drawn size.
  const slop = (layout.minTouchTarget - diameter) / 2;

  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        toggleSelah();
      }}
      hitSlop={slop}
      accessibilityRole="button"
      accessibilityLabel={t('audio.playerBar.selah')}
      accessibilityHint={t('audio.playerBar.selahHint')}
      accessibilityState={{ selected: isSelahActive }}
      testID="selah-button"
      style={({ pressed }) => [
        styles.button,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderColor: size === 'compact' && !isSelahActive ? 'transparent' : accent,
          backgroundColor: isSelahActive ? accent : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Feather
        size={iconSize}
        strokeWidth={ICON_STROKE_WIDTH}
        color={isSelahActive ? colors.onAccent : accent}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
