import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Share, Platform } from 'react-native';
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
import {
  getPassageText,
  LESSON_FALLBACK_TRANSLATION_ID,
  type PassageBlock,
} from '../../services/gather/gatherBibleService';
import {
  buildLessonLinkShare,
  buildLessonTextShareMessage,
  loadLessonAudioShareDeps,
  shareLessonAudio,
  toSharePayload,
  type LessonSharePayload,
} from '../../services/gather/lessonShareService';
import { getChapterAudioUrl } from '../../services/audio/audioService';
import { useBibleStore } from '../../stores/bibleStore';
import {
  lessonAudioTranslationCandidates,
  resolveLessonAudio,
  type LessonAudioSource,
} from '../../services/gather/lessonAudioSource';
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
  const resolveBookName = useCallback((bookId: string) => getTranslatedBookName(bookId, t), [t]);
  const referenceLabel = formatBibleReferenceLabel(lesson.references, resolveBookName);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const translationName = (translationId: string) =>
    translations.find((item) => item.id === translationId)?.name ?? translationId;

  // The passage (with the same BSB fallback the lesson screen uses) decides both
  // what "Share text" sends and which translation's recording "Share audio" can
  // offer. With no recording anywhere, the audio row is not shown.
  const [passageBlocks, setPassageBlocks] = useState<PassageBlock[] | null>(null);
  const [audioSource, setAudioSource] = useState<LessonAudioSource | null>(null);

  const loadPassage = useCallback(
    () =>
      getPassageText(lesson.references, currentTranslation, {
        bookNameResolver: resolveBookName,
        fallbackTranslationId: LESSON_FALLBACK_TRANSLATION_ID,
      }).catch((): PassageBlock[] => []),
    [currentTranslation, lesson.references, resolveBookName]
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const blocks = await loadPassage();
      if (cancelled) return;
      setPassageBlocks(blocks);
      const audio = await resolveLessonAudio(
        lesson.references,
        lessonAudioTranslationCandidates(blocks, currentTranslation),
        getChapterAudioUrl
      );
      if (!cancelled) setAudioSource(audio);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTranslation, lesson.references, loadPassage, visible]);

  const shareMessage = async (payload: LessonSharePayload) => {
    await Share.share(payload);
  };

  const handleShareAudio = async () => {
    if (!audioSource) return;
    try {
      const deps = await loadLessonAudioShareDeps(Platform.OS, shareMessage, t('groups.share'));
      await shareLessonAudio(audioSource, `${lessonTitle} · ${referenceLabel}`, deps);
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareText = async () => {
    try {
      const blocks = passageBlocks ?? (await loadPassage());
      await shareMessage({
        message: buildLessonTextShareMessage({
          lessonTitle,
          referenceLabel,
          blocks,
          translationName,
        }),
      });
    } catch {
      // Ignore share errors
    }
    onClose();
  };

  const handleShareLink = async () => {
    try {
      const { message, url } = buildLessonLinkShare({
        lessonTitle,
        referenceLabel,
        references: lesson.references,
      });
      await shareMessage(toSharePayload(Platform.OS, message, url));
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
            numberOfLines={2}
          >
            {referenceLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.borderStrong }]} />

      {audioSource ? (
        <ListRow
          title={t('gather.shareAudio')}
          leadingIcon={Volume2}
          onPress={() => {
            void handleShareAudio();
          }}
          accessibilityLabel={t('gather.shareAudio')}
        />
      ) : null}

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
