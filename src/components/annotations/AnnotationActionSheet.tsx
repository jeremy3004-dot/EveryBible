import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, shadows, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';
import {
  getNoteInputMaxHeight,
  getSheetMaxHeight,
  PRESSED_SCALE,
} from './actionSheet/annotationActionSheetModel';
import { NoteComposer } from './actionSheet/NoteComposer';
import { SheetActions } from './actionSheet/SheetActions';
import { useAnnotationSheetState } from './actionSheet/useAnnotationSheetState';

interface AnnotationActionSheetProps {
  visible: boolean;
  referenceLabel: string;
  selectedText: string;
  canAnnotate: boolean;
  closeButtonAccessibilityLabel: string;
  bottomInset?: number;
  activeHighlightColors: string[];
  onCopy: () => void;
  onShare: () => void;
  onShareImage: () => void;
  onShareAudio: () => void;
  onHighlight: (color: string) => void;
  onNote: (text: string) => void;
  onRemoveHighlight: (color: string) => void;
  onClose: () => void;
  existingNote?: string;
}

/**
 * The reader's tray for the selected verses: highlight colours and verse actions,
 * or the note composer. Drawn inline over the reader, not in a modal, so the
 * Bible stays tappable around it. Panels and state live in ./actionSheet.
 */
function AnnotationActionSheetContent({
  referenceLabel,
  selectedText,
  canAnnotate,
  onCopy,
  onShare,
  onShareImage,
  onShareAudio,
  onHighlight,
  onNote,
  onRemoveHighlight,
  onClose,
  closeButtonAccessibilityLabel,
  bottomInset = 0,
  activeHighlightColors,
  existingNote,
}: AnnotationActionSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = getSheetMaxHeight(windowHeight, insets.top);
  const sheet = useAnnotationSheetState({
    canAnnotate,
    existingNote,
    onHighlight,
    onRemoveHighlight,
    onNote,
    onClose,
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
      // The reader draws under the status bar, so the overlay starts below it;
      // the keyboard's padding then takes room from the sheet, which shrinks
      // and scrolls instead of pushing its title off the top.
      style={[styles.overlay, { paddingTop: insets.top }]}
    >
      <View
        // VoiceOver's escape gesture closes the sheet, as Android back does.
        onAccessibilityEscape={sheet.close}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bibleSurface,
            borderColor: colors.bibleDivider,
            paddingBottom: spacing.xl + bottomInset,
            maxHeight,
          },
        ]}
      >
        <View style={styles.handle}>
          <View
            style={[
              styles.handleBar,
              { backgroundColor: hexWithAlpha(colors.bibleSecondaryText, 0.333) },
            ]}
          />
        </View>

        <View style={styles.titleRow}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.biblePrimaryText }]}
          >
            {t('annotations.selected')}: {referenceLabel}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: colors.bibleElevatedSurface,
                borderColor: colors.bibleDivider,
                transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
              },
            ]}
            onPress={sheet.close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={closeButtonAccessibilityLabel}
          >
            <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
          </Pressable>
        </View>

        {sheet.mode === 'actions' ? (
          <SheetActions
            canAnnotate={canAnnotate}
            isSaving={sheet.isSaving}
            activeHighlightColors={activeHighlightColors}
            onToggleHighlight={(color, isActive) => {
              void sheet.toggleHighlight(color, isActive);
            }}
            onOpenNote={sheet.openNote}
            onCopy={onCopy}
            onShare={onShare}
            onShareImage={onShareImage}
            onShareAudio={onShareAudio}
          />
        ) : (
          <NoteComposer
            referenceLabel={referenceLabel}
            selectedText={selectedText}
            noteText={sheet.noteText}
            onChangeNoteText={sheet.setNoteText}
            noteInputMaxHeight={getNoteInputMaxHeight(windowHeight)}
            canAnnotate={canAnnotate}
            isSaving={sheet.isSaving}
            onCancel={sheet.cancelNote}
            onDone={() => {
              void sheet.saveNote();
            }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export function AnnotationActionSheet(props: AnnotationActionSheetProps) {
  const resetKey = props.visible ? 'open' : 'closed';

  if (!props.visible) {
    return null;
  }

  return <AnnotationActionSheetContent key={resetKey} {...props} />;
}

const CLOSE_BUTTON_SIZE = 32;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    flexShrink: 1,
    ...shadows.floating,
  },
  handle: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
  },
  titleRow: {
    minHeight: 30,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  title: {
    ...typography.label,
    textAlign: 'center',
    // Clears the close button pinned to the right (and mirrors it on the left so
    // the text stays centred): a title that wraps at large text ran under it.
    paddingHorizontal: CLOSE_BUTTON_SIZE + spacing.sm,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    width: CLOSE_BUTTON_SIZE,
    height: CLOSE_BUTTON_SIZE,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
