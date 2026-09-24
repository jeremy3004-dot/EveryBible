import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { useLargeText } from '../../../hooks/useLargeText';
import { layout, radius, spacing, typography } from '../../../design/system';
import { AppButton, AppCard, IconButton, PressableScale } from '../../../components/ui';
import { formatPlanPassageReference } from '../../../services/plans';
import type { PlanSessionKey, ReadingPlanEntry } from '../../../services/plans/types';
import { getTranslatedBookName } from '../../../constants';
import {
  getPlanDayRowAccessibility,
  getPlanSessionAccessibilityValue,
} from '../planDayRowAccessibility';
import type { PlanDaySessionAction } from './planDetailLedgerModel';

export const CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row';

/** The mono day column in a ledger row. */
const LEDGER_DAY_WIDTH = 56;
const NO_SESSION_ACTIONS: PlanDaySessionAction[] = [];
const SESSION_PILL_HIT_SLOP = { top: 6, bottom: 6 };
const SESSION_PILL_TICK_SIZE = 12;

function formatChapterRef(
  entry: ReadingPlanEntry,
  t: ReturnType<typeof useTranslation>['t']
): string {
  return formatPlanPassageReference(entry, getTranslatedBookName(entry.book, t));
}

interface DayRowProps {
  dayNumber: number;
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  isNext: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Today card only: "Today's target: 1/3 chapters" or the chapter count. */
  subtitle?: string | null;
  audioAvailable?: boolean;
  sessionActions?: PlanDaySessionAction[];
  onPress: (dayNumber: number, sessionKey?: PlanSessionKey) => void;
  onListen?: (dayNumber: number, sessionKey?: PlanSessionKey) => void;
}

/** Day row — the accent "today" card, or one slice of the ledger below it. */
export const DayRow = memo(function DayRow({
  dayNumber,
  dateLabel,
  entries,
  launchSessionKey,
  isCompleted,
  isCurrent,
  isFuture,
  isNext,
  isFirst = false,
  isLast = false,
  subtitle,
  audioAvailable = false,
  sessionActions = NO_SESSION_ACTIONS,
  onPress,
  onListen,
}: DayRowProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  // Today's references share the row with Read + Listen; at large text sizes
  // that left the references a word per line, so the actions drop beneath.
  const { rowDirection: todayRowDirection } = useLargeText();

  const { t } = useTranslation();
  const refs = entries.map((entry) => formatChapterRef(entry, t)).join(', ');
  const { label: accessibilityLabel, value: accessibilityValue } = getPlanDayRowAccessibility(t, {
    dayNumber,
    dateLabel,
    refs,
    isCurrent,
    isCompleted,
    isNext,
    subtitle,
  });
  const hasSessionActions = sessionActions.length > 0;

  const sessionActionRow = hasSessionActions ? (
    <View style={styles.sessionActionRow}>
      {sessionActions.map((action) => {
        const isDone = action.state === 'done';
        const isFilled = isDone || action.state === 'next';
        return (
          <PressableScale
            key={`${dayNumber}-${action.sessionKey}`}
            pressEffect="translate"
            haptic="light"
            onPress={() => onPress(dayNumber, action.sessionKey)}
            // The pill is 32pt tall; 6pt above and below reach the 44pt floor.
            hitSlop={SESSION_PILL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('interface.planSessionForDay', {
              session: action.label,
              day: dayNumber,
            })}
            accessibilityValue={getPlanSessionAccessibilityValue(t, action.state)}
            style={[
              styles.sessionActionButton,
              {
                backgroundColor: isFilled ? colors.accentSurface : colors.background,
                borderColor: isFilled ? colors.accentSurface : colors.borderStrong,
              },
            ]}
          >
            {/* Done and next share the accent fill; the tick tells them apart
                without colour (the value says "Completed" to screen readers). */}
            {isDone ? (
              <Check
                size={SESSION_PILL_TICK_SIZE}
                color={colors.onAccentSurface}
                strokeWidth={2.5}
              />
            ) : null}
            <Text
              style={[
                styles.sessionActionLabel,
                displayFont.regular,
                { color: isFilled ? colors.onAccentSurface : colors.secondaryText },
              ]}
            >
              {action.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  ) : null;

  // ---- Today: the one accent-ruled card on the screen ----------------------
  if (isCurrent) {
    return (
      <AppCard accentRule padding={spacing.lg} style={styles.todayCard}>
        <View style={[styles.todayRow, todayRowDirection === 'column' && styles.todayRowStacked]}>
          <PressableScale
            pressEffect="translate"
            haptic="light"
            onPress={() => onPress(dayNumber, launchSessionKey)}
            testID={isCurrent ? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={accessibilityValue}
            accessibilityRole="button"
            style={[
              styles.todayContent,
              todayRowDirection === 'column' && styles.todayContentStacked,
            ]}
          >
            <Text
              style={[typography.eyebrow, displayFont.regular, { color: colors.accentPrimary }]}
              numberOfLines={1}
            >
              {`${t('home.today')} · ${t('readingPlans.dayLabel', { day: dayNumber })}`}
            </Text>
            <Text style={[styles.todayTitle, { color: colors.primaryText }]} numberOfLines={2}>
              {refs}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.todaySubtitle, { color: colors.secondaryText }]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </PressableScale>

          <View style={styles.todayActions}>
            <AppButton
              label={t('bible.read')}
              size="md"
              fullWidth={false}
              onPress={() => onPress(dayNumber, launchSessionKey)}
              style={styles.todayReadButton}
            />
            {audioAvailable && onListen ? (
              <IconButton
                icon={Play}
                variant="paper"
                onPress={() => onListen(dayNumber, launchSessionKey)}
                accessibilityLabel={t('bible.listen')}
              />
            ) : null}
          </View>
        </View>
        {sessionActionRow}
      </AppCard>
    );
  }

  // ---- Ledger slice --------------------------------------------------------
  const trailing = isNext ? (
    <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
      {t('readingPlans.tomorrow')}
    </Text>
  ) : isCompleted ? (
    <View style={styles.ledgerTrailingGroup}>
      <Check size={12} color={colors.success} strokeWidth={2} />
      {dateLabel ? (
        <Text style={[typography.eyebrow, { color: colors.secondaryText }]}>{dateLabel}</Text>
      ) : null}
    </View>
  ) : dateLabel ? (
    <Text style={[typography.eyebrow, { color: colors.textTertiary }]}>{dateLabel}</Text>
  ) : null;

  return (
    <PressableScale
      pressEffect="translate"
      haptic="light"
      onPress={() => onPress(dayNumber, launchSessionKey)}
      testID={isCurrent ? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      // Completion is otherwise only a tick glyph.
      accessibilityValue={accessibilityValue}
      // The session buttons inside this row are not reachable by VoiceOver, so
      // each one is also offered as a custom action.
      accessibilityActions={
        hasSessionActions && !isFuture
          ? sessionActions.map((action) => ({
              name: `session:${action.sessionKey}`,
              label: t('interface.planSessionForDay', { session: action.label, day: dayNumber }),
            }))
          : undefined
      }
      onAccessibilityAction={(event) => {
        const action = sessionActions.find(
          (candidate) => `session:${candidate.sessionKey}` === event.nativeEvent.actionName
        );
        if (action) onPress(dayNumber, action.sessionKey);
      }}
      style={[
        styles.ledgerSlice,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        isFirst ? styles.ledgerSliceFirst : null,
        isLast ? styles.ledgerSliceLast : null,
      ]}
    >
      <View
        style={[
          styles.ledgerRow,
          isFirst ? null : { borderTopWidth: 1, borderTopColor: colors.borderStrong },
        ]}
      >
        <Text
          style={[
            styles.ledgerDay,
            { color: isFuture ? colors.textTertiary : colors.secondaryText },
          ]}
          numberOfLines={1}
        >
          {t('readingPlans.dayLabel', { day: dayNumber })}
        </Text>
        <Text
          style={[styles.ledgerRef, { color: isFuture ? colors.textTertiary : colors.primaryText }]}
          numberOfLines={2}
        >
          {refs}
        </Text>
        <View style={styles.ledgerTrailing}>{trailing}</View>
      </View>
      {hasSessionActions && !isFuture ? (
        <View style={styles.ledgerSessions}>{sessionActionRow}</View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  // Today card
  todayCard: {
    paddingVertical: 14,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  todayRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  todayContent: {
    flex: 1,
    gap: spacing.xs,
  },
  // In a content-sized column, flex: 1 would split a height that is itself
  // derived from the children; size to the text and take the full width.
  todayContentStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  todayTitle: {
    ...typography.cardTitle,
  },
  todaySubtitle: {
    ...typography.captionStrong,
    fontWeight: '400',
  },
  todayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  todayReadButton: {
    paddingHorizontal: spacing.lg,
  },

  // Ledger slice
  ledgerSlice: {
    marginHorizontal: layout.screenPadding,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  ledgerSliceFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  ledgerSliceLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    marginHorizontal: spacing.lg,
  },
  ledgerDay: {
    ...typography.mono,
    fontWeight: '600',
    // minWidth keeps the column aligned but lets "Day 12" grow with Dynamic Type
    // instead of truncating.
    minWidth: LEDGER_DAY_WIDTH,
  },
  ledgerRef: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    lineHeight: 20,
    flex: 1,
  },
  ledgerTrailing: {
    alignItems: 'flex-end',
  },
  ledgerTrailingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ledgerSessions: {
    marginHorizontal: spacing.lg,
  },

  // Session actions (multi-session plans)
  sessionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sessionActionButton: {
    minHeight: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  sessionActionLabel: {
    ...typography.monoSmall,
  },
});
