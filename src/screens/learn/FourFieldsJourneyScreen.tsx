import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { FIELD_ORDER, fieldInfo, fourFieldsCourses } from '../../data/fourFieldsCourses';
import { JourneyPath } from '../../components/fourfields';
import { isSupabaseConfigured } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import type { FieldType } from '../../types/course';
import { getGroupRolloutModel } from './groupRolloutModel';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;

export function FourFieldsJourneyScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const {
    getCompletedLessonsCount,
    getTotalLessonsCount,
    getFieldProgress,
    isFieldUnlocked,
    getNextLesson,
  } = useFourFieldsStore();
  const localGroupCount = useFourFieldsStore((state) => state.groups.length);
  const groupRollout = getGroupRolloutModel({
    isSignedIn: Boolean(user),
    localGroupCount,
    syncFeatureEnabled: config.features.studyGroupsSync,
    backendConfigured: isSupabaseConfigured(),
  });

  const completedCount = getCompletedLessonsCount();
  const totalCount = getTotalLessonsCount();
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextLesson = getNextLesson();
  const nextCourse = nextLesson
    ? fourFieldsCourses.find((course) => course.id === nextLesson.courseId)
    : null;
  const nextLessonMeta = nextCourse?.lessons.find((lesson) => lesson.id === nextLesson?.lessonId);
  const currentField: FieldType = nextCourse?.field ?? 'multiplication';
  const fieldProgress = FIELD_ORDER.reduce(
    (progress, field) => ({
      ...progress,
      [field]: getFieldProgress(field),
    }),
    {} as Record<FieldType, number>
  );

  const handleContinue = () => {
    if (!nextLesson) {
      return;
    }

    navigation.navigate('FourFieldsLessonView', {
      courseId: nextLesson.courseId,
      lessonId: nextLesson.lessonId,
    });
  };

  const handleFieldPress = (field: FieldType) => {
    navigation.navigate('FieldOverview', { field });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('harvest.fourFieldsJourney')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
            {t('harvest.heroTitle')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.secondaryText }]}>
            {t('harvest.trainingOverviewBody')}
          </Text>

          <View style={styles.summaryRow}>
            <View
              style={[
                styles.summaryChip,
                { backgroundColor: colors.accentPrimary + '18', borderColor: colors.accentPrimary + '28' },
              ]}
            >
              <Text style={[styles.summaryValue, { color: colors.accentPrimary }]}>{overallProgress}%</Text>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>
                {t('harvest.fieldProgress', { progress: overallProgress })}
              </Text>
            </View>
            <View
              style={[
                styles.summaryChip,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.summaryValue, { color: colors.primaryText }]}>
                {completedCount}/{totalCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>
                {t('harvest.lessonsCompleted', { completed: completedCount, total: totalCount })}
              </Text>
            </View>
          </View>
        </View>

        <JourneyPath
          currentField={currentField}
          fieldProgress={fieldProgress}
          isFieldUnlocked={isFieldUnlocked}
          onFieldPress={handleFieldPress}
        />

        {nextLessonMeta && nextCourse ? (
          <View
            style={[
              styles.nextCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.nextHeader}>
              <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
                {t('harvest.nextStep')}
              </Text>
              <TouchableOpacity onPress={() => handleFieldPress(nextCourse.field)}>
                <Text style={[styles.linkText, { color: colors.accentPrimary }]}>
                  {t('harvest.exploreField')}
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.fieldPill,
                { backgroundColor: fieldInfo[nextCourse.field].color + '20' },
              ]}
            >
              <Text style={[styles.fieldPillText, { color: fieldInfo[nextCourse.field].color }]}>
                {fieldInfo[nextCourse.field].title}
              </Text>
            </View>

            <Text style={[styles.nextLessonTitle, { color: colors.primaryText }]}>
              {nextLessonMeta.title}
            </Text>
            <Text style={[styles.nextLessonDescription, { color: colors.secondaryText }]}>
              {t('harvest.nextLessonDescription')}
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.accentPrimary }]}
              onPress={handleContinue}
            >
              <Text style={[styles.primaryButtonText, { color: colors.cardBackground }]}>{t('harvest.continueJourney')}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.cardBackground} />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.completeCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name="trophy-outline" size={36} color={colors.accentSecondary} />
            <Text style={[styles.completeTitle, { color: colors.primaryText }]}>
              {t('harvest.allLessonsComplete')}
            </Text>
            <Text style={[styles.completeBody, { color: colors.secondaryText }]}>
              {t('harvest.allLessonsCompleteBody')}
            </Text>
          </View>
        )}

        {groupRollout.showGroupEntry ? (
          <TouchableOpacity
            style={[
              styles.groupsCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
            onPress={() => navigation.navigate('GroupList')}
            activeOpacity={0.85}
          >
            <View style={styles.groupsHeader}>
              <View style={[styles.groupsIcon, { backgroundColor: colors.accentSecondary + '16' }]}>
                <Ionicons name="people-outline" size={20} color={colors.accentSecondary} />
              </View>
              <View style={styles.groupsCopy}>
                <Text style={[styles.groupsBadge, { color: colors.accentSecondary }]}>
                  {t('harvest.groupPreviewBadge')}
                </Text>
                <Text style={[styles.groupsTitle, { color: colors.primaryText }]}>
                  {t('harvest.groupPreviewTitle')}
                </Text>
              </View>
            </View>
            <Text style={[styles.groupsBody, { color: colors.secondaryText }]}>
              {t('harvest.groupPreviewBody')}
            </Text>
            <Text style={[styles.linkText, { color: colors.accentPrimary }]}>
              {t('harvest.groupPreviewCta')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 20,
    gap: 20,
  },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    gap: 18,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryChip: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 18,
  },
  nextCard: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  nextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fieldPillText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextLessonTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  nextLessonDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  completeCard: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  completeTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  completeBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  groupsCard: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    marginBottom: 12,
  },
  groupsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupsIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupsCopy: {
    flex: 1,
  },
  groupsBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  groupsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  groupsBody: {
    fontSize: 14,
    lineHeight: 21,
  },
});
