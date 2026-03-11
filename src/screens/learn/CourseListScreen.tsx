import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { config } from '../../constants';
import type { LearnStackParamList } from '../../navigation/types';
import { isSupabaseConfigured } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { fourFieldsCourses } from '../../data/fourFieldsCourses';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { getGroupRolloutModel } from './groupRolloutModel';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;

export function CourseListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { getCompletedLessonsCount, getTotalLessonsCount, getNextLesson } = useFourFieldsStore();
  const localGroupCount = useFourFieldsStore((state) => state.groups.length);
  const groupRollout = getGroupRolloutModel({
    isSignedIn: Boolean(user),
    localGroupCount,
    syncFeatureEnabled: config.features.studyGroupsSync,
    backendConfigured: isSupabaseConfigured(),
  });

  const completedLessons = getCompletedLessonsCount();
  const totalLessons = getTotalLessonsCount();
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const nextLesson = getNextLesson();
  const nextCourse = nextLesson
    ? fourFieldsCourses.find((course) => course.id === nextLesson.courseId)
    : null;
  const nextLessonMeta = nextCourse?.lessons.find((lesson) => lesson.id === nextLesson?.lessonId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>{t('harvest.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>{t('harvest.heroSubtitle')}</Text>

        <TouchableOpacity
          style={[
            styles.primaryCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.accentPrimary },
          ]}
          onPress={() => navigation.navigate('FourFieldsJourney')}
          activeOpacity={0.9}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.accentPrimary + '18' }]}>
              <Ionicons name="layers-outline" size={24} color={colors.accentPrimary} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.cardEyebrow, { color: colors.accentPrimary }]}>
                {t('harvest.trainingOverviewTitle')}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
                {t('harvest.fourFieldsJourney')}
              </Text>
            </View>
          </View>

          <Text style={[styles.cardBody, { color: colors.secondaryText }]}>
            {t('harvest.trainingOverviewBody')}
          </Text>

          <View style={styles.progressSection}>
            <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: colors.accentPrimary },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.secondaryText }]}>
              {t('harvest.lessonsCompleted', { completed: completedLessons, total: totalLessons })}
            </Text>
          </View>

          {nextLessonMeta && (
            <View
              style={[
                styles.nextLessonCard,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.nextLessonLabel, { color: colors.secondaryText }]}>
                {t('harvest.nextLesson')}
              </Text>
              <Text style={[styles.nextLessonTitle, { color: colors.primaryText }]}>
                {nextLessonMeta.title}
              </Text>
            </View>
          )}

          <View style={[styles.ctaRow, { backgroundColor: colors.accentPrimary }]}>
            <Text style={styles.ctaText}>
              {nextLesson ? t('harvest.continueJourney') : t('harvest.browseFields')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </View>
        </TouchableOpacity>

        {groupRollout.showGroupEntry ? (
          <TouchableOpacity
            style={[
              styles.secondaryCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
            onPress={() => navigation.navigate('GroupList')}
            activeOpacity={0.8}
          >
            <View style={styles.secondaryCardHeader}>
              <View style={[styles.secondaryIcon, { backgroundColor: colors.accentSecondary + '16' }]}>
                <Ionicons name="people-outline" size={22} color={colors.accentSecondary} />
              </View>
              <View style={styles.secondaryCopy}>
                <Text style={[styles.secondaryEyebrow, { color: colors.accentSecondary }]}>
                  {t('harvest.groupPreviewBadge')}
                </Text>
                <Text style={[styles.secondaryTitle, { color: colors.primaryText }]}>
                  {t('harvest.groupPreviewTitle')}
                </Text>
              </View>
            </View>
            <Text style={[styles.secondaryBody, { color: colors.secondaryText }]}>
              {t('harvest.groupPreviewBody')}
            </Text>
            <Text style={[styles.secondaryLink, { color: colors.accentPrimary }]}>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  primaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  progressSection: {
    gap: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '500',
  },
  nextLessonCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  nextLessonLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  nextLessonTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  secondaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  secondaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCopy: {
    flex: 1,
  },
  secondaryEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  secondaryTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  secondaryLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
