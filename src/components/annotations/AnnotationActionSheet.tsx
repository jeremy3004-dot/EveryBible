import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';

const HIGHLIGHT_COLORS = [
  { id: 'yellow', hex: '#FFD700' },
  { id: 'green', hex: '#66BB6A' },
  { id: 'blue', hex: '#42A5F5' },
  { id: 'pink', hex: '#EC407A' },
  { id: 'orange', hex: '#FFA726' },
] as const;

interface AnnotationActionSheetProps {
  visible: boolean;
  verseNumber: number;
  bookId: string;
  chapter: number;
  onBookmark: () => void;
  onHighlight: (color: string) => void;
  onNote: (text: string) => void;
  onClose: () => void;
  existingNote?: string;
  isBookmarked?: boolean;
}

export function AnnotationActionSheet({
  visible,
  verseNumber,
  onBookmark,
  onHighlight,
  onNote,
  onClose,
  existingNote,
  isBookmarked,
}: AnnotationActionSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [noteText, setNoteText] = useState(existingNote ?? '');
  const [mode, setMode] = useState<'actions' | 'note'>('actions');

  const handleNote = () => {
    if (noteText.trim()) {
      onNote(noteText.trim());
    }
    setMode('actions');
    setNoteText('');
  };

  const handleClose = () => {
    setMode('actions');
    setNoteText(existingNote ?? '');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.cardBackground },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.secondaryText + '40' }]} />
          </View>

          <Text style={[styles.title, { color: colors.primaryText }]}>
            {t('bible.verse')} {verseNumber}
          </Text>

          {mode === 'actions' ? (
            <View style={styles.actionsContainer}>
              {/* Bookmark button */}
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.cardBorder }]}
                onPress={() => { onBookmark(); handleClose(); }}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={isBookmarked ? colors.accentPrimary : colors.primaryText}
                />
                <Text style={[styles.actionLabel, { color: colors.primaryText }]}>
                  {t('annotations.addBookmark')}
                </Text>
              </TouchableOpacity>

              {/* Highlight colors */}
              <View style={styles.colorRow}>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>
                  {t('annotations.highlight')}
                </Text>
                <View style={styles.colorPicker}>
                  {HIGHLIGHT_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.colorDot, { backgroundColor: c.hex }]}
                      onPress={() => { onHighlight(c.hex); handleClose(); }}
                    />
                  ))}
                </View>
              </View>

              {/* Note button */}
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.cardBorder }]}
                onPress={() => setMode('note')}
              >
                <Ionicons name="create-outline" size={22} color={colors.primaryText} />
                <Text style={[styles.actionLabel, { color: colors.primaryText }]}>
                  {t('annotations.addNote')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noteContainer}>
              <TextInput
                style={[
                  styles.noteInput,
                  {
                    color: colors.primaryText,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder={t('annotations.noteHint')}
                placeholderTextColor={colors.secondaryText}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={1000}
                autoFocus
              />
              <View style={styles.noteActions}>
                <TouchableOpacity onPress={() => setMode('actions')}>
                  <Text style={[styles.noteActionText, { color: colors.secondaryText }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNote}>
                  <Text style={[styles.noteActionText, { color: colors.accentPrimary }]}>
                    {t('common.save')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: layout.screenPadding,
  },
  handle: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
  },
  title: {
    ...typography.cardTitle,
    marginBottom: spacing.lg,
  },
  actionsContainer: {
    gap: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionLabel: {
    ...typography.body,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  colorRow: {
    paddingVertical: spacing.sm,
  },
  colorPicker: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  noteContainer: {
    gap: spacing.md,
  },
  noteInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  noteActionText: {
    ...typography.button,
  },
});
