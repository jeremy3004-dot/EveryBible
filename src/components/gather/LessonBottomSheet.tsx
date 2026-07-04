import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { getTranslatedBookName } from '../../constants';
import { formatBibleReferenceLabel } from '../../services/gather/gatherReferenceLabel';
import type { GatherLesson } from '../../types/gather';

interface LessonBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  lesson: GatherLesson;
  parentId: string;
  isComplete: boolean;
  onToggleComplete: () => void;
}

export function LessonBottomSheet({
  visible,
  onClose,
  lesson,
  isComplete,
  onToggleComplete,
}: LessonBottomSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const resolveBookName = (bookId: string) => getTranslatedBookName(bookId, t);
  const referenceLabel = formatBibleReferenceLabel(lesson.references, resolveBookName);

  const handleShareAudio = async () => {
    try {
      await Share.share({ message: lesson.title + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareText = async () => {
    try {
      await Share.share({ message: lesson.title + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareLink = async () => {
    try {
      await Share.share({ message: lesson.title + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleToggle = () => {
    onToggleComplete();
    onClose();
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      {/* Backdrop overlay */}
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Inner sheet — prevent backdrop close from bubbling through the sheet */}
        <TouchableOpacity
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            },
          ]}
          activeOpacity={1}
          onPress={() => {
            // Intentionally empty — absorb tap to avoid closing on sheet tap
          }}
        >
          {/* Grab handle */}
          <View style={[styles.grabHandle, { backgroundColor: colors.cardBorder }]} />
          {/* Header row: icon + lesson title + reference */}
          <View style={styles.headerRow}>
            <View
              style={[styles.headerIconContainer, { backgroundColor: colors.accentPrimary + '18' }]}
            >
              <Ionicons name="book-outline" size={20} color={colors.accentPrimary} />
            </View>
            <View style={styles.headerTextColumn}>
              <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>
                {lesson.title}
              </Text>
              <Text style={[styles.lessonReference, { color: colors.secondaryText }]}>
                {referenceLabel}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

          {/* Action rows */}
          <TouchableOpacity style={styles.actionRow} onPress={handleShareAudio} activeOpacity={0.7}>
            <Ionicons name="volume-medium-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {t('gather.shareAudio')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleShareText} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {t('gather.shareText')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleShareLink} activeOpacity={0.7}>
            <Ionicons name="link-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {t('gather.shareLink')}
            </Text>
          </TouchableOpacity>

          <View style={[styles.actionRow, styles.actionRowDisabled]}>
            <Ionicons name="download-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {t('gather.download')}
            </Text>
            <Text style={[styles.comingSoonLabel, { color: colors.secondaryText }]}>
              {t('common.comingSoon')}
            </Text>
          </View>

          <TouchableOpacity style={styles.actionRow} onPress={handleToggle} activeOpacity={0.7}>
            <Ionicons
              name={isComplete ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={24}
              color={colors.secondaryText}
            />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {isComplete ? t('gather.markIncomplete') : t('gather.markComplete')}
            </Text>
          </TouchableOpacity>

          <View style={[styles.actionRow, styles.actionRowDisabled]}>
            <Ionicons name="bookmark-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.actionText, { color: colors.primaryText }]}>
              {t('gather.manageBookmarks')}
            </Text>
            <Text style={[styles.comingSoonLabel, { color: colors.secondaryText }]}>
              {t('common.comingSoon')}
            </Text>
          </View>

          {/* Close button */}
          <TouchableOpacity style={[styles.closeButton]} onPress={onClose} activeOpacity={0.7}>
            <Text style={[styles.closeButtonText, { color: colors.accentPrimary }]}>
              {t('common.done')}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  grabHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextColumn: {
    flex: 1,
    gap: 2,
  },
  lessonTitle: {
    ...typography.bodyStrong,
  },
  lessonReference: {
    ...typography.micro,
  },
  // Divider
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    gap: spacing.md,
  },
  actionRowDisabled: {
    opacity: 0.4,
  },
  actionText: {
    ...typography.body,
  },
  comingSoonLabel: {
    ...typography.micro,
    marginLeft: 'auto',
  },
  // Close button
  closeButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  closeButtonText: {
    ...typography.button,
  },
});
