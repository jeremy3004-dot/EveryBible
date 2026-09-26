import { useState } from 'react';
import {
  type AccessibilityActionEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { getBookById, getTranslatedBookName } from '../../../../constants/books';
import { useTheme } from '../../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../../design/system';
import type { RepeatPassage } from '../../../../types/audio';
import { AudioSheetSection } from './AudioSheetParts';
import {
  clampPassageDraft,
  formatRepeatPassage,
  initialPassageDraft,
  passageFieldBounds,
  stepPassageDraft,
  type PassageDraft,
  type PassageField,
} from './audioSheetModel';
import { useChapterVerseCounts } from './useChapterVerseCounts';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onStep: (delta: number) => void;
}

/** One number with − and + around it; a single adjustable element for screen readers. */
function Stepper({ label, value, min, max, onStep }: StepperProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const canDecrease = value > min;
  const canIncrease = value < max;

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment' && canIncrease) onStep(1);
    else if (event.nativeEvent.actionName === 'decrement' && canDecrease) onStep(-1);
  };

  const buttonStyle = [
    styles.stepButton,
    { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
  ];

  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <Text style={[styles.stepperLabel, { color: colors.bibleSecondaryText }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[buttonStyle, !canDecrease && styles.stepButtonDisabled]}
          onPress={() => onStep(-1)}
          accessibilityRole="button"
          disabled={!canDecrease}
          accessibilityLabel={t('audio.passageDecrease', { name: label })}
        >
          <Minus size={16} color={colors.biblePrimaryText} />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: colors.biblePrimaryText }]}>{value}</Text>
        <TouchableOpacity
          style={[buttonStyle, !canIncrease && styles.stepButtonDisabled]}
          onPress={() => onStep(1)}
          accessibilityRole="button"
          disabled={!canIncrease}
          accessibilityLabel={t('audio.passageIncrease', { name: label })}
        >
          <Plus size={16} color={colors.biblePrimaryText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export interface PassagePickerPageProps {
  bookId: string;
  chapter: number;
  translationId: string;
  storedPassage: RepeatPassage | null;
  onConfirm: (passage: RepeatPassage) => void;
}

/** From and to, each a chapter and verse inside the book being read. */
export function PassagePickerPage({
  bookId,
  chapter,
  translationId,
  storedPassage,
  onConfirm,
}: PassagePickerPageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const chapterCount = getBookById(bookId)?.chapters ?? chapter;
  const [draft, setDraft] = useState<PassageDraft>(() =>
    initialPassageDraft(storedPassage, bookId, chapter, chapterCount)
  );
  const verseCount = useChapterVerseCounts(translationId, bookId, [
    draft.start.chapter,
    draft.end.chapter,
  ]);
  const passage = clampPassageDraft(draft, chapterCount, verseCount);
  const bookName = getTranslatedBookName(bookId, t);

  const renderStepper = (field: PassageField, label: string) => {
    const bounds = passageFieldBounds(draft, field, chapterCount, verseCount);
    return (
      <Stepper
        label={label}
        {...bounds}
        onStep={(delta) =>
          setDraft((current) => stepPassageDraft(current, field, delta, chapterCount, verseCount))
        }
      />
    );
  };

  return (
    <View style={styles.page}>
      <Text
        style={[styles.summary, { color: colors.biblePrimaryText }]}
        accessibilityLiveRegion="polite"
      >
        {formatRepeatPassage(passage, bookName, t)}
      </Text>

      <AudioSheetSection title={t('audio.passageFrom')}>
        <View style={styles.stepperRow}>
          {renderStepper('startChapter', t('audio.passageFromChapter'))}
          {renderStepper('startVerse', t('audio.passageFromVerse'))}
        </View>
      </AudioSheetSection>

      <AudioSheetSection title={t('audio.passageTo')}>
        <View style={styles.stepperRow}>
          {renderStepper('endChapter', t('audio.passageToChapter'))}
          {renderStepper('endVerse', t('audio.passageToVerse'))}
        </View>
      </AudioSheetSection>

      <TouchableOpacity
        style={[styles.confirmButton, { backgroundColor: colors.accentSurface }]}
        onPress={() => onConfirm({ bookId, start: passage.start, end: passage.end })}
        accessibilityRole="button"
      >
        <Text style={[styles.confirmLabel, { color: colors.onAccentSurface }]}>
          {t('audio.passageConfirm')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.xl,
  },
  summary: {
    ...typography.cardTitle,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepper: {
    flex: 1,
    gap: spacing.xs,
  },
  stepperLabel: {
    ...typography.caption,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stepButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    ...typography.cardTitle,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
  },
  confirmButton: {
    minHeight: layout.minTouchTarget,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmLabel: {
    ...typography.button,
  },
});
