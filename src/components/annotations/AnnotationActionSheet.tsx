import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useLargeText } from '../../hooks/useLargeText';
import { radius, shadows, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';
import { useLatestCallback } from '../audio/playbackControlsParts/useLatestCallback';

const HIGHLIGHT_COLORS = [
  { id: 'red', hex: '#D95B57' },
  { id: 'yellow', hex: '#F4E2A8' },
  { id: 'orange', hex: '#E6A24C' },
  { id: 'green', hex: '#6FBF7A' },
  { id: 'blue', hex: '#4A90E2' },
] as const;

const PRESSED_SCALE = 0.96;

// Height: the sheet grows with its content up to a share of the reader below
// the status bar, then everything under the title scrolls. At large text on a
// small phone (and in note mode with the keyboard up) the unbounded sheet was
// pushed past the top of the screen. The share leaves a strip of verses showing.
const SHEET_MAX_HEIGHT_SHARE = 0.9;
// The note field grows with the note up to this share of the window, then
// scrolls inside itself, so a long note never pushes Done under the keyboard.
const NOTE_INPUT_MIN_HEIGHT = 124;
const NOTE_INPUT_MAX_HEIGHT_SHARE = 0.2;

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

interface ActionPillProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function ActionPill({ icon, label, onPress, disabled = false }: ActionPillProps) {
  const { colors } = useTheme();
  // Past the shared large-text threshold five pills no longer fit one row with
  // readable labels, so the rail wraps to three per row instead of shrinking.
  const { isLargeText } = useLargeText();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        isLargeText ? styles.actionButtonLargeText : null,
        {
          backgroundColor: colors.bibleElevatedSurface,
          borderColor: colors.bibleDivider,
          opacity: disabled ? 0.44 : 1,
          transform: [{ scale: pressed && !disabled ? PRESSED_SCALE : 1 }],
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Named explicitly: Android otherwise folds the icon-font glyph into the
      // name it derives from the pill's children.
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Ionicons
        name={icon}
        size={16}
        color={disabled ? colors.bibleSecondaryText : colors.biblePrimaryText}
      />
      <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]}>{label}</Text>
    </Pressable>
  );
}

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
  const maxHeight = Math.round((windowHeight - insets.top) * SHEET_MAX_HEIGHT_SHARE);
  const noteInputMaxHeight = Math.max(
    NOTE_INPUT_MIN_HEIGHT,
    Math.round(windowHeight * NOTE_INPUT_MAX_HEIGHT_SHARE)
  );
  const [noteText, setNoteText] = useState(existingNote ?? '');
  const [mode, setMode] = useState<'actions' | 'note'>('actions');
  const [isSaving, setIsSaving] = useState(false);
  // The selection can change under an open sheet (the Bible stays tappable around
  // it), bringing a different existing note. Follow it unless a note is being written.
  const [seededNote, setSeededNote] = useState(existingNote);
  if (mode === 'actions' && existingNote !== seededNote) {
    setSeededNote(existingNote);
    setNoteText(existingNote ?? '');
  }
  const activeHighlightColorSet = new Set(activeHighlightColors);

  const handleClose = () => {
    setMode('actions');
    setNoteText(existingNote ?? '');
    onClose();
  };

  // Subscribed once per opening, but closes through the latest props: the reader
  // passes a new onClose on every render.
  const closeFromBackButton = useLatestCallback(handleClose);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFromBackButton();
      return true;
    });

    return () => subscription.remove();
  }, [closeFromBackButton]);

  const handleHighlightColor = async (color: string, isActive: boolean) => {
    if (!canAnnotate || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      if (isActive) {
        await onRemoveHighlight(color);
      } else {
        await onHighlight(color);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleNote = async () => {
    if (!canAnnotate || isSaving) {
      return;
    }

    const trimmedNote = noteText.trim();

    if (trimmedNote.length > 0) {
      setIsSaving(true);
      try {
        await onNote(trimmedNote);
      } finally {
        setIsSaving(false);
      }
    }

    handleClose();
  };

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
          <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
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
            onPress={handleClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={closeButtonAccessibilityLabel}
          >
            <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
          </Pressable>
        </View>

        {mode === 'actions' ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.actionsContainer}
            // A tap on a pill should press it, not only dismiss a keyboard.
            keyboardShouldPersistTaps="handled"
            alwaysBounceVertical={false}
          >
            <View style={styles.selectionControlsRow}>
              <View style={styles.highlightRow}>
                {HIGHLIGHT_COLORS.map((color) => {
                  const isActive = activeHighlightColorSet.has(color.hex);

                  return (
                    <Pressable
                      key={color.id}
                      accessibilityLabel={t(`annotations.colors.${color.id}`)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive, disabled: !canAnnotate }}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.colorDot,
                        {
                          backgroundColor: color.hex,
                          borderColor: isActive ? colors.biblePrimaryText : 'transparent',
                          opacity: canAnnotate ? 1 : 0.46,
                          transform: [{ scale: pressed && canAnnotate ? PRESSED_SCALE : 1 }],
                        },
                      ]}
                      onPress={() => {
                        if (!canAnnotate) {
                          return;
                        }

                        void handleHighlightColor(color.hex, isActive);
                      }}
                      disabled={!canAnnotate}
                    >
                      {isActive ? (
                        <View style={styles.colorDotRemoveOverlay} pointerEvents="none">
                          <Ionicons name="close" size={13} color={colors.bibleSurface} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.actionButtonRail}>
                <ActionPill
                  icon="create-outline"
                  label={t('annotations.note')}
                  onPress={() => {
                    if (canAnnotate && !isSaving) {
                      setMode('note');
                    }
                  }}
                  disabled={!canAnnotate || isSaving}
                />
                <ActionPill icon="copy-outline" label={t('annotations.copy')} onPress={onCopy} />
                <ActionPill
                  icon="share-social-outline"
                  label={t('groups.share')}
                  onPress={onShare}
                />
                <ActionPill
                  icon="image-outline"
                  label={t('bible.shareVerseImage')}
                  onPress={onShareImage}
                />
                <ActionPill
                  icon="headset-outline"
                  label={t('bible.shareChapterAudio')}
                  onPress={onShareAudio}
                />
              </View>
            </View>
          </ScrollView>
        ) : (
          <>
            {/* Only the reference and verse preview scroll. The field and its
                buttons stay pinned at the bottom of the sheet, directly above
                the keyboard, so what the user is typing and Done are always in
                reach however little room the keyboard leaves. */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.notePreviewContainer}
              keyboardShouldPersistTaps="handled"
              alwaysBounceVertical={false}
            >
              <Text style={[styles.noteReference, { color: colors.bibleSecondaryText }]}>
                {referenceLabel}
              </Text>
              <Text
                style={[styles.notePreview, { color: colors.bibleSecondaryText }]}
                numberOfLines={3}
              >
                {selectedText}
              </Text>
            </ScrollView>
            <View style={styles.noteComposer}>
              <TextInput
                style={[
                  styles.noteInput,
                  {
                    maxHeight: noteInputMaxHeight,
                    color: colors.biblePrimaryText,
                    borderColor: colors.controlBorder,
                    backgroundColor: colors.bibleElevatedSurface,
                  },
                ]}
                placeholder={t('annotations.noteHint')}
                placeholderTextColor={colors.bibleSecondaryText}
                accessibilityLabel={t('annotations.noteHint')}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={1000}
                autoFocus
                editable={canAnnotate}
              />
              <View style={styles.noteActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.noteActionButton,
                    {
                      backgroundColor: colors.bibleElevatedSurface,
                      borderColor: colors.bibleDivider,
                      transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
                    },
                  ]}
                  onPress={() => setMode('actions')}
                  hitSlop={10}
                  accessibilityRole="button"
                >
                  <Text style={[styles.noteActionText, { color: colors.bibleSecondaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.noteActionButton,
                    {
                      backgroundColor: colors.accentPrimary,
                      opacity: canAnnotate && !isSaving ? 1 : 0.5,
                      transform: [
                        { scale: pressed && canAnnotate && !isSaving ? PRESSED_SCALE : 1 },
                      ],
                    },
                  ]}
                  onPress={() => {
                    void handleNote();
                  }}
                  disabled={!canAnnotate || isSaving}
                  hitSlop={10}
                  accessibilityRole="button"
                >
                  <Text style={[styles.noteActionText, { color: colors.onAccent }]}>
                    {t('common.done')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
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
  body: {
    flexGrow: 0,
    flexShrink: 1,
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
  actionsContainer: {
    gap: spacing.md,
  },
  selectionControlsRow: {
    flexDirection: 'column',
    gap: 10,
    minWidth: 0,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  colorDot: {
    position: 'relative',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  colorDotRemoveOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 3,
  },
  actionButtonLargeText: {
    flexBasis: '30%',
  },
  actionLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  actionButtonRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 8,
  },
  notePreviewContainer: {
    gap: spacing.md,
  },
  noteComposer: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  noteReference: {
    ...typography.micro,
    textAlign: 'center',
  },
  notePreview: {
    ...typography.body,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  noteInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: NOTE_INPUT_MIN_HEIGHT,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  noteActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  noteActionText: {
    ...typography.button,
  },
});
