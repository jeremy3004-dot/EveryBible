import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';

interface PlaybackOptionsDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Extra styles for the dialog surface (e.g. a `gap` between title and list). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Styles for the scrolling list's content container. */
  listStyle?: StyleProp<ViewStyle>;
}

// Clearance between the dialog and the safe-area edges, so a strip of backdrop
// always shows around a dialog that has grown to its cap.
const DIALOG_EDGE_MARGIN = 20;

// The centred option dialogs of the player (speed, sleep timer, music). Each one
// is bounded by the safe area and scrolls its options under a fixed title: at
// large text on a small phone the sleep-timer and music lists outgrew the
// screen and their first and last options were cut off.
export function PlaybackOptionsDialog({
  visible,
  onClose,
  title,
  children,
  contentStyle,
  listStyle,
}: PlaybackOptionsDialogProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = windowHeight - insets.top - insets.bottom - DIALOG_EDGE_MARGIN * 2;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* The backdrop sits behind the dialog rather than wrapping it, so a drag
            on the option list scrolls it instead of starting a backdrop press.
            It stays out of the accessibility tree: the dialog is modal to the
            screen reader and dismisses with the escape gesture. */}
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + DIALOG_EDGE_MARGIN,
              paddingBottom: insets.bottom + DIALOG_EDGE_MARGIN,
            },
          ]}
          pointerEvents="box-none"
        >
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={[
              styles.content,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider, maxHeight },
              contentStyle,
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.biblePrimaryText }]}
            >
              {title}
            </Text>
            <ScrollView
              style={styles.list}
              contentContainerStyle={listStyle}
              alwaysBounceVertical={false}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: DIALOG_EDGE_MARGIN,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    flexShrink: 1,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
});
