import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import type { RepeatMode } from '../../../types/audio';
import { playbackControlsStyles as styles } from './playbackControlsStyles';

/** The repeat arrows, outlined when off, with a "1" badge for repeat-chapter. */
export function RepeatModeIcon({ repeatMode }: { repeatMode: RepeatMode }) {
  const { colors } = useTheme();
  const color = repeatMode !== 'off' ? colors.bibleAccent : colors.bibleSecondaryText;

  return (
    <View style={styles.repeatIconWrapper}>
      <Ionicons name={repeatMode === 'off' ? 'repeat-outline' : 'repeat'} size={18} color={color} />
      {repeatMode === 'chapter' ? (
        <View style={[styles.repeatBadge, { backgroundColor: color }]}>
          <Text style={[styles.repeatBadgeText, { color: colors.bibleBackground }]}>1</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A speech bubble holding three lines of text: "show the chapter text". */
export function TextUtilityIcon() {
  const { colors } = useTheme();

  return (
    <View style={styles.textUtilityIcon}>
      <View style={[styles.textUtilityIconBubble, { borderColor: colors.biblePrimaryText }]}>
        <View
          style={[styles.textUtilityIconLineLong, { backgroundColor: colors.biblePrimaryText }]}
        />
        <View
          style={[styles.textUtilityIconLineMedium, { backgroundColor: colors.biblePrimaryText }]}
        />
        <View
          style={[styles.textUtilityIconLineShort, { backgroundColor: colors.biblePrimaryText }]}
        />
      </View>
      <View style={[styles.textUtilityIconTail, { borderBottomColor: colors.biblePrimaryText }]} />
    </View>
  );
}
