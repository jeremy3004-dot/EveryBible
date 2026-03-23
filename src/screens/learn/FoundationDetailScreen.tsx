import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { gatherFoundations } from '../../data/gatherFoundations';
import { gatherTopicCategories } from '../../data/gatherTopics';
import { gatherIconImages } from '../../data/gatherIcons';
import { useGatherStore } from '../../stores/gatherStore';
import { LessonBottomSheet } from '../../components/gather/LessonBottomSheet';
import type { GatherLesson } from '../../types/gather';
import type { FoundationDetailScreenProps } from '../../navigation/types';

export function FoundationDetailScreen({ route, navigation }: FoundationDetailScreenProps) {
  const { foundationId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<GatherLesson | null>(null);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);

  const markLessonComplete = useGatherStore((state) => state.markLessonComplete);
  const unmarkLessonComplete = useGatherStore((state) => state.unmarkLessonComplete);
  const isLessonComplete = useGatherStore((state) => state.isLessonComplete);
  const getCompletedCount = useGatherStore((state) => state.getCompletedCount);

  // Resolve foundation or topic by ID
  const foundation =
    gatherFoundations.find((f) => f.id === foundationId) ??
    gatherTopicCategories.flatMap((c) => c.topics).find((t) => t.id === foundationId);

  if (!foundation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.headerBar, { borderBottomColor: colors.cardBorder }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.notFoundContainer}>
          <Text style={[typography.body, { color: colors.secondaryText }]}>
            {t('common.error')}
          </Text>
        </View>
      </View>
    );
  }

  const isFoundation = foundationId.startsWith('foundation-');
  const completedCount = getCompletedCount(foundationId);
  const totalLessons = foundation.lessons.length;

  // Find the next foundation (only for foundations)
  const foundationNumber = isFoundation ? (foundation as typeof gatherFoundations[0]).number : 0;
  const nextFoundation = isFoundation
    ? gatherFoundations.find((f) => f.number === foundationNumber + 1)
    : null;

  const handleShareInvitation = async () => {
    try {
      await Share.share({
        message: t('gather.invitationDescription') + '\nhttps://everybible.app',
      });
    } catch {
      // Ignore share errors
    }
  };

  const handleThreeDotPress = (lesson: GatherLesson) => {
    setSelectedLesson(lesson);
    setBottomSheetVisible(true);
  };

  const handleToggleComplete = () => {
    if (!selectedLesson) return;
    if (isLessonComplete(foundationId, selectedLesson.id)) {
      unmarkLessonComplete(foundationId, selectedLesson.id);
    } else {
      markLessonComplete(foundationId, selectedLesson.id);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={[styles.headerBar, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>

        <Text
          style={[styles.headerTitle, { color: colors.primaryText }]}
          numberOfLines={1}
        >
          {foundation.title}
        </Text>

        <Ionicons name="download-outline" size={22} color={colors.secondaryText} />
      </View>

      {/* Scrollable body */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { padding: layout.screenPadding, paddingBottom: 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero section */}
        <View style={styles.heroSection}>
          {/* Circular icon */}
          <View
            style={[
              styles.heroIconContainer,
              foundation.iconImage && gatherIconImages[foundation.iconImage]
                ? undefined
                : { backgroundColor: colors.accentPrimary + '18' },
            ]}
          >
            {foundation.iconImage && gatherIconImages[foundation.iconImage] ? (
              <Image
                source={gatherIconImages[foundation.iconImage]}
                style={styles.heroIconImage}
              />
            ) : (
              <Ionicons
                name={
                  (foundation.iconName as React.ComponentProps<typeof Ionicons>['name']) ??
                  'book-outline'
                }
                size={40}
                color={colors.accentPrimary}
              />
            )}
          </View>

          {/* Progress text */}
          <Text style={[styles.progressText, { color: colors.secondaryText }]}>
            {`${completedCount}/${totalLessons}`}
          </Text>

          {/* Foundation label (only for foundations) */}
          {isFoundation && (
            <Text style={[styles.foundationLabel, { color: colors.secondaryText }]}>
              {t('gather.foundationLabel', {
                number: (foundation as typeof gatherFoundations[0]).number,
              })}
            </Text>
          )}

          {/* Title */}
          <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
            {foundation.title}
          </Text>
        </View>

        {/* Description (expandable) — GatherFoundation has description; GatherTopic does not */}
        {'description' in foundation && !!foundation.description && (
          <View style={styles.descriptionSection}>
            <Text
              style={[styles.descriptionText, { color: colors.secondaryText }]}
              numberOfLines={descriptionExpanded ? undefined : 3}
            >
              {foundation.description}
            </Text>
            <TouchableOpacity
              onPress={() => setDescriptionExpanded((prev) => !prev)}
              activeOpacity={0.7}
            >
              <Text style={[styles.showMoreText, { color: colors.accentPrimary }]}>
                {descriptionExpanded ? t('gather.showLess') : t('gather.showMore')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Send an invitation card */}
        <View
          style={[
            styles.invitationCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.invitationCardRow}>
            <Ionicons name="mail-outline" size={24} color={colors.accentPrimary} />
            <View style={styles.invitationCardText}>
              <Text style={[styles.invitationTitle, { color: colors.primaryText }]}>
                {t('gather.sendInvitation')}
              </Text>
              <Text style={[styles.invitationDescription, { color: colors.secondaryText }]}>
                {t('gather.invitationDescription')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.gatherButton, { backgroundColor: colors.accentPrimary }]}
            onPress={handleShareInvitation}
            activeOpacity={0.85}
          >
            <Text style={styles.gatherButtonText}>{t('gather.gatherWithOthers')}</Text>
          </TouchableOpacity>
        </View>

        {/* Lesson list */}
        {foundation.lessons.map((lesson) => {
          const complete = isLessonComplete(foundationId, lesson.id);
          return (
            <TouchableOpacity
              key={lesson.id}
              style={[
                styles.lessonRow,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
              onPress={() =>
                navigation.navigate('LessonDetail', {
                  parentId: foundationId,
                  lessonId: lesson.id,
                  parentType: isFoundation ? 'foundation' : 'topic',
                })
              }
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={lesson.title}
            >
              {/* Number badge */}
              <View
                style={[
                  styles.numberBadge,
                  complete
                    ? { backgroundColor: colors.accentPrimary }
                    : { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.cardBorder },
                ]}
              >
                <Text
                  style={[
                    styles.numberBadgeText,
                    { color: complete ? '#FFFFFF' : colors.secondaryText },
                  ]}
                >
                  {lesson.number}
                </Text>
              </View>

              {/* Lesson content */}
              <View style={styles.lessonContent}>
                <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>
                  {lesson.title}
                </Text>
                <Text style={[styles.lessonReference, { color: colors.secondaryText }]}>
                  {lesson.referenceLabel}
                </Text>
              </View>

              {/* Three-dot menu */}
              <TouchableOpacity
                onPress={() => handleThreeDotPress(lesson)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        {/* Up next card (foundations only, if there's a next one) */}
        {isFoundation && nextFoundation && (
          <TouchableOpacity
            style={[
              styles.upNextCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
            onPress={() => navigation.push('FoundationDetail', { foundationId: nextFoundation.id })}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.upNextIconContainer,
                nextFoundation.iconImage && gatherIconImages[nextFoundation.iconImage]
                  ? undefined
                  : { backgroundColor: colors.accentPrimary + '18' },
              ]}
            >
              {nextFoundation.iconImage && gatherIconImages[nextFoundation.iconImage] ? (
                <Image
                  source={gatherIconImages[nextFoundation.iconImage]}
                  style={styles.upNextIconImage}
                />
              ) : (
                <Ionicons
                  name={
                    (nextFoundation.iconName as React.ComponentProps<typeof Ionicons>['name']) ??
                    'book-outline'
                  }
                  size={20}
                  color={colors.accentPrimary}
                />
              )}
            </View>

            <View style={styles.upNextContent}>
              <Text style={[styles.upNextLabel, { color: colors.secondaryText }]}>
                {t('gather.upNext')}
              </Text>
              <Text style={[styles.upNextTitle, { color: colors.primaryText }]}>
                {nextFoundation.title}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Bottom sheet */}
      {bottomSheetVisible && selectedLesson && (
        <LessonBottomSheet
          visible={bottomSheetVisible}
          onClose={() => {
            setBottomSheetVisible(false);
            setSelectedLesson(null);
          }}
          lesson={selectedLesson}
          parentId={foundationId}
          isComplete={isLessonComplete(foundationId, selectedLesson.id)}
          onToggleComplete={handleToggleComplete}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header bar
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  headerTitle: {
    ...typography.bodyStrong,
    flex: 1,
    textAlign: 'center',
  },
  // Scroll body
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.xl,
  },
  // Hero section
  heroSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIconContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroIconImage: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
  },
  progressText: {
    ...typography.label,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  foundationLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  heroTitle: {
    ...typography.sectionTitle,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  // Description
  descriptionSection: {
    gap: spacing.xs,
  },
  descriptionText: {
    ...typography.body,
  },
  showMoreText: {
    ...typography.label,
  },
  // Invitation card
  invitationCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    gap: spacing.md,
  },
  invitationCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  invitationCardText: {
    flex: 1,
    gap: 2,
  },
  invitationTitle: {
    ...typography.bodyStrong,
  },
  invitationDescription: {
    ...typography.micro,
  },
  gatherButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  gatherButtonText: {
    ...typography.button,
    color: '#FFFFFF',
  },
  // Lesson rows
  lessonRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    ...typography.label,
  },
  lessonContent: {
    flex: 1,
    gap: 2,
  },
  lessonTitle: {
    ...typography.bodyStrong,
  },
  lessonReference: {
    ...typography.micro,
  },
  // Up next card
  upNextCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upNextIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  upNextIconImage: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
  },
  upNextContent: {
    flex: 1,
    gap: 2,
  },
  upNextLabel: {
    ...typography.micro,
  },
  upNextTitle: {
    ...typography.bodyStrong,
  },
  // Not found
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
