import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Play } from 'lucide-react-native';
import { AppCard, IconButton, PressableScale, TabSwitch } from '../../components/ui';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { layout, spacing, typography } from '../../design/system';
import {
  gatherFoundations,
  FOUNDATION_TITLE_KEYS,
  FOUNDATION_LESSON_TITLE_KEYS,
} from '../../data/gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_CATEGORY_NAME_KEYS,
  WISDOM_TITLE_KEYS,
} from '../../data/gatherWisdom';
import { useGatherStore } from '../../stores/gatherStore';
import type { LearnStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<LearnStackParamList, 'GatherHome'>;

type ActiveTab = 'foundations' | 'wisdom';

/** The badge that closes each path row, and the artwork inside it. */
const ROW_BADGE = 30;
const ROW_BADGE_ICON = 22;

// Static content, so the headline count is resolved once at module load rather
// than recomputed on every render of the path.
const FOUNDATION_LESSON_TOTAL = gatherFoundations.reduce(
  (total, foundation) => total + foundation.lessons.length,
  0
);

// The path is linear, so "up next" is simply the first lesson nobody has ticked
// off yet. Once every lesson is complete there is nothing to resume and the
// caller drops the card rather than pointing back at finished work.
function findUpNext(completedLessons: Record<string, string[]>) {
  for (const foundation of gatherFoundations) {
    const done = completedLessons[foundation.id] ?? [];
    const lesson = foundation.lessons.find((candidate) => !done.includes(candidate.id));
    if (lesson) {
      return { foundation, lesson };
    }
  }
  return null;
}

// The lesson ledger: one 4pt cell per lesson, filled left to right as lessons
// complete. A row with nothing done collapses to a single unbroken bar — an
// empty ledger of eight identical grey cells reads as broken, not as "not
// started".
function LessonLedger({ total, completed }: { total: number; completed: number }) {
  const { colors } = useTheme();

  if (total <= 0 || completed <= 0) {
    return <View style={[styles.ledgerPlain, { backgroundColor: colors.borderStrong }]} />;
  }

  return (
    <View style={styles.ledgerTrack}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.ledgerCell,
            { backgroundColor: index < completed ? colors.accentPrimary : colors.borderStrong },
          ]}
        />
      ))}
    </View>
  );
}

interface PathRowProps {
  /** "01"–"07" for the numbered foundations path; omitted for unordered wisdom. */
  numeral?: string;
  title: string;
  artworkKey?: string;
  completed: number;
  total: number;
  progressLabel: string;
  onPress: () => void;
}

// One line of the path: numeral, title over its lesson ledger, count, artwork.
// Started rows light their numeral and artwork; untouched rows stay quiet, so
// scanning the column tells you how far in you are before you read a word.
function PathRow({
  numeral,
  title,
  artworkKey,
  completed,
  total,
  progressLabel,
  onPress,
}: PathRowProps) {
  const { colors } = useTheme();
  const started = completed > 0;

  return (
    <PressableScale
      pressEffect="translate"
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityValue={{ text: progressLabel }}
      style={styles.pathRow}
    >
      {numeral ? (
        <Text
          style={[
            styles.pathNumeral,
            { color: started ? colors.accentPrimary : colors.textTertiary },
          ]}
        >
          {numeral}
        </Text>
      ) : null}
      <View style={styles.pathBody}>
        <Text style={[styles.pathTitle, { color: colors.primaryText }]}>{title}</Text>
        <LessonLedger total={total} completed={completed} />
      </View>
      <Text numberOfLines={1} style={[styles.pathCount, { color: colors.secondaryText }]}>
        {progressLabel}
      </Text>
      <GatherIconBadge
        artworkKey={artworkKey}
        size={ROW_BADGE}
        iconSize={ROW_BADGE_ICON}
        iconColor={started ? colors.primaryText : colors.secondaryText}
      />
    </PressableScale>
  );
}

export function GatherScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const displayFont = useDisplayFont();
  const { contentClearance } = useTabBarHeight();

  const [activeTab, setActiveTab] = useState<ActiveTab>('foundations');

  // Subscribing to the map itself (rather than to the getCompletedCount action,
  // which is a stable reference) is what makes the counts and the up-next card
  // re-render when a lesson is marked complete on another screen.
  const completedLessons = useGatherStore((state) => state.completedLessons);

  const completedIn = (parentId: string, total: number) =>
    Math.min(completedLessons[parentId]?.length ?? 0, total);

  const translate = (key: string | undefined, fallback: string) =>
    key ? t(key as Parameters<typeof t>[0]) : fallback;

  const upNext = findUpNext(completedLessons);

  const openFoundation = (foundationId: string) =>
    navigation.navigate('FoundationDetail', { foundationId });

  const openUpNextLesson = () => {
    if (!upNext) {
      return;
    }
    navigation.navigate('LessonDetail', {
      parentId: upNext.foundation.id,
      lessonId: upNext.lesson.id,
      parentType: 'foundation',
    });
  };

  const upNextTitle = upNext
    ? translate(FOUNDATION_LESSON_TITLE_KEYS[upNext.lesson.id], upNext.lesson.title)
    : '';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Screen header: identity on the left, path switch on the right. */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('gather.discoveryBibleStudy')}
          </Text>
          <Text style={[typography.displayHero, displayFont.bold, { color: colors.primaryText }]}>
            {t('gather.title')}
          </Text>
        </View>
        <TabSwitch
          size="sm"
          value={activeTab}
          onChange={(key) => setActiveTab(key as ActiveTab)}
          accessibilityLabel={t('gather.title')}
          segments={[
            { key: 'foundations', label: t('gather.foundations') },
            { key: 'wisdom', label: t('gather.wisdom') },
          ]}
        />
      </View>

      {activeTab === 'foundations' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentClearance }]}
          showsVerticalScrollIndicator={false}
        >
          {upNext && (
            <AppCard
              accentRule
              pressable
              haptic="light"
              onPress={openUpNextLesson}
              accessibilityLabel={upNextTitle}
              style={styles.upNextCard}
            >
              <View style={styles.upNextRow}>
                <GatherIconBadge
                  artworkKey={upNext.foundation.iconImage}
                  size={44}
                  iconSize={30}
                  iconColor={colors.accentPrimary}
                />
                <View style={styles.upNextBody}>
                  <Text
                    style={[
                      typography.eyebrow,
                      displayFont.regular,
                      { color: colors.accentPrimary },
                    ]}
                  >
                    {t('gather.upNextLesson', {
                      lesson: upNext.lesson.number,
                      total: upNext.foundation.lessons.length,
                    })}
                  </Text>
                  <Text style={[styles.upNextTitle, { color: colors.primaryText }]}>
                    {upNextTitle}
                  </Text>
                  <Text style={[styles.upNextMeta, { color: colors.secondaryText }]}>
                    {t('gather.upNextSubtitle', {
                      reference: upNext.lesson.referenceLabel,
                      parent: translate(
                        FOUNDATION_TITLE_KEYS[upNext.foundation.id],
                        upNext.foundation.title
                      ),
                    })}
                  </Text>
                </View>
                <IconButton
                  icon={Play}
                  variant="accent"
                  size={40}
                  iconSize={16}
                  onPress={openUpNextLesson}
                  accessibilityLabel={t('gather.getStarted')}
                />
              </View>
            </AppCard>
          )}

          <Text
            style={[
              typography.eyebrow,
              displayFont.regular,
              styles.listEyebrow,
              { color: colors.secondaryText },
            ]}
          >
            {t('gather.foundationsSummary', {
              foundations: gatherFoundations.length,
              lessons: FOUNDATION_LESSON_TOTAL,
            })}
          </Text>

          <View style={[styles.listRule, { backgroundColor: colors.primaryText }]} />

          {gatherFoundations.map((foundation, index) => {
            const total = foundation.lessons.length;
            const completed = completedIn(foundation.id, total);
            return (
              <View key={foundation.id}>
                {index > 0 && (
                  <View style={[styles.listDivider, { backgroundColor: colors.borderStrong }]} />
                )}
                <PathRow
                  numeral={String(foundation.number).padStart(2, '0')}
                  title={translate(FOUNDATION_TITLE_KEYS[foundation.id], foundation.title)}
                  artworkKey={foundation.iconImage}
                  completed={completed}
                  total={total}
                  progressLabel={t('gather.lessonsProgress', { completed, total })}
                  onPress={() => openFoundation(foundation.id)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      {activeTab === 'wisdom' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentClearance }]}
          showsVerticalScrollIndicator={false}
        >
          {gatherWisdomCategories.map((category) => {
            const categoryLessons = category.wisdoms.reduce(
              (total, wisdom) => total + wisdom.lessonCount,
              0
            );
            const categoryCompleted = category.wisdoms.reduce(
              (total, wisdom) => total + completedIn(wisdom.id, wisdom.lessonCount),
              0
            );
            return (
              <View key={category.id} style={styles.wisdomSection}>
                <View style={styles.wisdomHeaderRow}>
                  <GatherIconBadge
                    artworkKey={category.iconImage}
                    size={20}
                    iconSize={18}
                    iconColor={colors.secondaryText}
                  />
                  <Text
                    style={[
                      typography.eyebrow,
                      displayFont.regular,
                      styles.wisdomHeaderLabel,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {translate(WISDOM_CATEGORY_NAME_KEYS[category.id], category.name)}
                  </Text>
                  <Text style={[styles.wisdomHeaderCount, { color: colors.secondaryText }]}>
                    {t('gather.lessonsProgress', {
                      completed: categoryCompleted,
                      total: categoryLessons,
                    })}
                  </Text>
                </View>

                <View style={[styles.listRule, { backgroundColor: colors.primaryText }]} />

                {category.wisdoms.map((wisdom, index) => {
                  const completed = completedIn(wisdom.id, wisdom.lessonCount);
                  return (
                    <View key={wisdom.id}>
                      {index > 0 && (
                        <View
                          style={[styles.listDivider, { backgroundColor: colors.borderStrong }]}
                        />
                      )}
                      <PathRow
                        title={translate(WISDOM_TITLE_KEYS[wisdom.id], wisdom.title)}
                        artworkKey={wisdom.iconImage}
                        completed={completed}
                        total={wisdom.lessonCount}
                        progressLabel={t('gather.lessonsProgress', {
                          completed,
                          total: wisdom.lessonCount,
                        })}
                        onPress={() =>
                          navigation.navigate('FoundationDetail', { foundationId: wisdom.id })
                        }
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingTop: 14,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
  },
  // Up-next card
  upNextCard: {
    paddingVertical: layout.cardPadding,
    paddingHorizontal: layout.cardPaddingWide,
    marginBottom: spacing.xl,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  upNextBody: {
    flex: 1,
    gap: spacing.xs,
  },
  upNextTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 21,
  },
  upNextMeta: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
  },
  // The numbered path
  listEyebrow: {
    marginBottom: spacing.md,
  },
  // The ink rule that opens a list: heavier than a divider so the column reads
  // as one ledger rather than a stack of separate rows.
  listRule: {
    height: 1.5,
    opacity: 0.8,
  },
  listDivider: {
    height: 1,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  pathNumeral: {
    ...typography.numeralRow,
    width: 34,
  },
  pathBody: {
    flex: 1,
    gap: spacing.sm,
  },
  pathTitle: {
    ...typography.rowTitle,
  },
  pathCount: {
    ...typography.mono,
    width: 30,
    textAlign: 'right',
  },
  ledgerTrack: {
    flexDirection: 'row',
    gap: 3,
  },
  ledgerCell: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  ledgerPlain: {
    height: 4,
    borderRadius: 2,
  },
  // Wisdom
  wisdomSection: {
    marginBottom: spacing.xl,
  },
  wisdomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  wisdomHeaderLabel: {
    flex: 1,
  },
  // The category tally counts every lesson in the category, so it needs more
  // room than the fixed 30pt slot the per-row counts sit in.
  wisdomHeaderCount: {
    ...typography.mono,
  },
});
