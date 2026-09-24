import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing, typography } from '../../../design/system';
import { NOTE_INPUT_MIN_HEIGHT, PRESSED_SCALE } from './annotationActionSheetModel';

interface NoteComposerProps {
  referenceLabel: string;
  selectedText: string;
  noteText: string;
  onChangeNoteText: (text: string) => void;
  noteInputMaxHeight: number;
  canAnnotate: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onDone: () => void;
}

/** The sheet's note panel: the verse preview above the note field, Cancel and Done. */
export function NoteComposer({
  referenceLabel,
  selectedText,
  noteText,
  onChangeNoteText,
  noteInputMaxHeight,
  canAnnotate,
  isSaving,
  onCancel,
  onDone,
}: NoteComposerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const canSave = canAnnotate && !isSaving;

  return (
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
        <Text style={[styles.notePreview, { color: colors.bibleSecondaryText }]} numberOfLines={3}>
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
          onChangeText={onChangeNoteText}
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
            onPress={onCancel}
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
                opacity: canSave ? 1 : 0.5,
                transform: [{ scale: pressed && canSave ? PRESSED_SCALE : 1 }],
              },
            ]}
            onPress={onDone}
            disabled={!canSave}
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
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 0,
    flexShrink: 1,
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
