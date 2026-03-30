import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, shadows, spacing, typography } from '../../design/system';

const HIGHLIGHT_COLORS = [
  { id: 'red', hex: '#D95B57' },
  { id: 'yellow', hex: '#F4E2A8' },
  { id: 'orange', hex: '#E6A24C' },
  { id: 'green', hex: '#6FBF7A' },
  { id: 'blue', hex: '#4A90E2' },
] as const;

const PRESSED_SCALE = 0.96;

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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
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
      hitSlop={6}
    >
      <Ionicons
        name={icon}
        size={18}
        color={disabled ? colors.bibleSecondaryText : colors.biblePrimaryText}
      />
      <Text style={[styles.actionLabel, { color: colors.biblePrimaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function AnnotationActionSheetContent({
  referenceLabel,
  selectedText,
  canAnnotate,
  onCopy,
  onShare,
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
  const [noteText, setNoteText] = useState(existingNote ?? '');
  const [mode, setMode] = useState<'actions' | 'note'>('actions');
  const [isSaving, setIsSaving] = useState(false);
  const activeHighlightColorSet = new Set(activeHighlightColors);

  const handleClose = () => {
    setMode('actions');
    setNoteText(existingNote ?? '');
    onClose();
  };

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
      style={[styles.overlay, { paddingBottom: bottomInset }]}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bibleSurface,
            borderColor: colors.bibleDivider,
            paddingBottom: spacing.xl + bottomInset,
          },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.bibleSecondaryText + '55' }]} />
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
          <View style={styles.actionsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.actionRail}
            >
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
                      styles.colorDotButton,
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
            </ScrollView>
          </View>
        ) : (
          <View style={styles.noteContainer}>
            <Text style={[styles.noteReference, { color: colors.bibleSecondaryText }]}>
              {referenceLabel}
            </Text>
            <Text style={[styles.notePreview, { color: colors.bibleSecondaryText }]} numberOfLines={3}>
              {selectedText}
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                {
                  color: colors.biblePrimaryText,
                  borderColor: colors.bibleDivider,
                  backgroundColor: colors.bibleElevatedSurface,
                },
              ]}
              placeholder={t('annotations.noteHint')}
              placeholderTextColor={colors.bibleSecondaryText}
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
                    transform: [{ scale: pressed && canAnnotate && !isSaving ? PRESSED_SCALE : 1 }],
                  },
                ]}
                onPress={() => {
                  void handleNote();
                }}
                disabled={!canAnnotate || isSaving}
                hitSlop={10}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.noteActionText,
                    { color: colors.bibleSurface },
                  ]}
                >
                  {t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>
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

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsContainer: {
    gap: spacing.sm,
  },
  actionRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-start',
    flexGrow: 0,
    paddingLeft: 2,
    paddingRight: layout.screenPadding,
  },
  colorDotButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
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
    flexShrink: 0,
    minWidth: 84,
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 4,
  },
  actionLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  noteContainer: {
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
    minHeight: 124,
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
