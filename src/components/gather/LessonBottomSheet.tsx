import { View, Text, StyleSheet, Share } from 'react-native';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Link,
  Volume2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { FOUNDATION_LESSON_TITLE_KEYS } from '../../data/gatherFoundations';
import { WISDOM_LESSON_TITLE_KEYS } from '../../data/gatherWisdom';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { spacing, typography } from '../../design/system';
import { AppButton, ListRow, Sheet } from '../ui';
import { getTranslatedBookName } from '../../constants';
import { formatBibleReferenceLabel } from '../../services/gather/gatherReferenceLabel';
import type { GatherLesson } from '../../types/gather';

const HEADER_ICON_SIZE = 20;
const ICON_STROKE = 2;
/** Rows that only advertise a future capability read as inert paper. */
const COMING_SOON_OPACITY = 0.4;

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
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const titleKey = FOUNDATION_LESSON_TITLE_KEYS[lesson.id] ?? WISDOM_LESSON_TITLE_KEYS[lesson.id];
  const lessonTitle = titleKey ? t(titleKey) : lesson.title;
  const resolveBookName = (bookId: string) => getTranslatedBookName(bookId, t);
  const referenceLabel = formatBibleReferenceLabel(lesson.references, resolveBookName);

  const handleShareAudio = async () => {
    try {
      await Share.share({ message: lessonTitle + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareText = async () => {
    try {
      await Share.share({ message: lessonTitle + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareLink = async () => {
    try {
      await Share.share({ message: lessonTitle + ' - ' + referenceLabel });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleToggle = () => {
    onToggleComplete();
    onClose();
  };

  const completeLabel = isComplete ? t('gather.markIncomplete') : t('gather.markComplete');

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('interface.close')}>
      {/* Header: the lesson names itself, the reference is its metadata line. */}
      <View style={styles.headerRow}>
        <BookOpen
          size={HEADER_ICON_SIZE}
          color={colors.secondaryText}
          strokeWidth={ICON_STROKE}
          style={styles.headerIcon}
        />
        <View style={styles.headerTextColumn}>
          <Text
            style={[typography.sectionHeading, displayFont.bold, { color: colors.primaryText }]}
            numberOfLines={2}
          >
            {lessonTitle}
          </Text>
          <Text
            style={[typography.eyebrowPlain, displayFont.regular, { color: colors.secondaryText }]}
            numberOfLines={1}
          >
            {referenceLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.borderStrong }]} />

      <ListRow
        title={t('gather.shareAudio')}
        leadingIcon={Volume2}
        onPress={() => {
          void handleShareAudio();
        }}
        accessibilityLabel={t('gather.shareAudio')}
      />

      <ListRow
        title={t('gather.shareText')}
        leadingIcon={FileText}
        onPress={() => {
          void handleShareText();
        }}
        accessibilityLabel={t('gather.shareText')}
      />

      <ListRow
        title={t('gather.shareLink')}
        leadingIcon={Link}
        onPress={() => {
          void handleShareLink();
        }}
        accessibilityLabel={t('gather.shareLink')}
      />

      {/* Not wired yet: the row states that plainly instead of failing on tap.
          Marking the wrapper disabled makes React Native swallow presses, which
          is exactly right here — these rows carry no handler. */}
      <View
        style={styles.comingSoonRow}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={t('gather.download')}
      >
        <ListRow
          title={t('gather.download')}
          leadingIcon={Download}
          value={t('common.comingSoon')}
        />
      </View>

      <ListRow
        title={completeLabel}
        leadingIcon={isComplete ? CheckCircle2 : Circle}
        onPress={handleToggle}
        accessibilityLabel={completeLabel}
      />

      <View
        style={styles.comingSoonRow}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={t('gather.manageBookmarks')}
      >
        <ListRow
          title={t('gather.manageBookmarks')}
          leadingIcon={Bookmark}
          value={t('common.comingSoon')}
          isLast
        />
      </View>

      <AppButton
        label={t('common.done')}
        variant="ghost"
        onPress={onClose}
        style={styles.doneButton}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerIcon: {
    marginTop: spacing.xs,
  },
  headerTextColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    marginBottom: spacing.xs,
  },
  comingSoonRow: {
    opacity: COMING_SOON_OPACITY,
  },
  doneButton: {
    marginTop: spacing.md,
  },
});
