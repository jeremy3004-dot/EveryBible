import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { getReadingFontFamily } from '../../design/fonts';
import { motion, radius, shadows, spacing } from '../../design/system';
import {
  getNoteInputMaxHeight,
  getSheetMaxHeight,
  SHEET_RISE_SPRING,
} from './actionSheet/annotationActionSheetModel';
import { NoteComposer } from './actionSheet/NoteComposer';
import { SheetActions } from './actionSheet/SheetActions';
import { useAnnotationSheetState } from './actionSheet/useAnnotationSheetState';

interface AnnotationActionSheetProps {
  visible: boolean;
  referenceLabel: string;
  selectedText: string;
  canAnnotate: boolean;
  bottomInset?: number;
  activeHighlightColors: string[];
  onCopy: () => void;
  onShare: () => void;
  onShareImage: () => void;
  onShareAudio: () => void;
  onHighlight: (color: string) => void;
  onNote: (text: string) => boolean | void | Promise<boolean | void>;
  onRemoveHighlight: (color: string) => void;
  onClose: () => void;
  existingNote?: string;
}

/**
 * The reader's tray for the selected verses: highlight colours and verse actions,
 * or the note composer. Drawn inline over the reader, not in a modal, so the
 * Bible stays tappable around it: a tap on the page, or on the only selected verse
 * again, closes it, so it carries no close button (VoiceOver's escape gesture and
 * Android back close it too). Panels and state live in ./actionSheet.
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
  bottomInset = 0,
  activeHighlightColors,
  existingNote,
}: AnnotationActionSheetProps) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = getSheetMaxHeight(windowHeight, insets.top);
  const sheet = useAnnotationSheetState({
    canAnnotate,
    referenceLabel,
    selectedText,
    existingNote,
    onHighlight,
    onRemoveHighlight,
    onNote,
    onClose,
  });
  // The reference is the title, set like a citation in the reading serif (the
  // platform serif for scripts Lora cannot draw).
  const titleFontFamily = getReadingFontFamily(i18n.language, 600);
  const entering = reduceMotion
    ? FadeIn.duration(motion.duration.base)
    : SlideInDown.springify()
        .damping(SHEET_RISE_SPRING.damping)
        .stiffness(SHEET_RISE_SPRING.stiffness);
  const exiting = reduceMotion
    ? FadeOut.duration(motion.duration.fast)
    : SlideOutDown.duration(motion.duration.base);

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
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
      {/* Fills the gap under the sheet while the rising spring overshoots. */}
      <View
        pointerEvents="none"
        style={[styles.overshootSkirt, { backgroundColor: colors.bibleSurface }]}
      />

      <Text
        accessibilityRole="header"
        // Sighted readers see the dashed underline; a screen reader hears what the
        // reference is.
        accessibilityLabel={`${t('annotations.selected')}: ${sheet.referenceLabel}`}
        style={[
          styles.title,
          titleFontFamily ? { fontFamily: titleFontFamily } : styles.titlePlatformWeight,
          { color: colors.biblePrimaryText },
        ]}
      >
        {sheet.referenceLabel}
      </Text>

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
          selectedText={sheet.selectedText}
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
    </Animated.View>
  );
}

export function AnnotationActionSheet(props: AnnotationActionSheetProps) {
  const insets = useSafeAreaInsets();

  // The overlay stays mounted and only the sheet comes and goes: Reanimated runs
  // an exiting animation only on the outermost view React removes, so a sheet
  // removed together with its overlay vanished instead of sliding away. The
  // empty overlay takes no touches. Each opening mounts a fresh sheet, so a
  // reopened sheet starts in the actions with no draft.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
      // The reader draws under the status bar, so the overlay starts below it;
      // the keyboard's padding then takes room from the sheet, which shrinks
      // and scrolls instead of pushing its title off the top.
      style={[styles.overlay, { paddingTop: insets.top }]}
    >
      {props.visible ? <AnnotationActionSheetContent {...props} /> : null}
    </KeyboardAvoidingView>
  );
}

// Deeper than the spring's few points of overshoot.
const OVERSHOOT_SKIRT_HEIGHT = 48;

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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    flexShrink: 1,
    ...shadows.floating,
  },
  overshootSkirt: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: OVERSHOOT_SKIRT_HEIGHT,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    marginBottom: spacing.lg,
  },
  titlePlatformWeight: {
    fontWeight: '600',
  },
});
