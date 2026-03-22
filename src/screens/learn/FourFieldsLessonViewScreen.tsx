import React, { useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { fourFieldsCourses, fieldInfo } from '../../data/fourFieldsCourses';
import {
  LessonSectionRenderer,
  TakeawayCard,
  PracticeCard,
} from '../../components/fourfields';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'FourFieldsLessonView'>;

export function FourFieldsLessonViewScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { courseId, lessonId } = route.params;

  const {
    markLessonComplete,
    markPracticeComplete,
    markTaughtComplete,
    isLessonComplete,
    isPracticeComplete,
    isTaughtComplete,
  } = useFourFieldsStore();

  // Find course and lesson
  const course = fourFieldsCourses.find((c) => c.id === courseId);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const lessonIndex = course?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const currentFieldInfo = course ? fieldInfo[course.field] : null;

  // Check completion states
  const lessonComplete = isLessonComplete(courseId, lessonId);
  const practiceComplete = isPracticeComplete(lessonId);
  const taughtComplete = isTaughtComplete(lessonId);

  // Find next/prev lessons
  const prevLesson = lessonIndex > 0 ? course?.lessons[lessonIndex - 1] : null;
  const nextLesson =
    course && lessonIndex < course.lessons.length - 1
      ? course.lessons[lessonIndex + 1]
      : null;

  const handleScripturePress = useCallback(
    (_reference: string) => {
      Alert.alert(t('common.comingSoon'), t('harvest.scriptureNavigationUnavailable'));
    },
    [t]
  );

  const handlePracticeComplete = useCallback(() => {
    markPracticeComplete(lessonId);
  }, [markPracticeComplete, lessonId]);

  const handleTaughtComplete = useCallback(() => {
    markTaughtComplete(lessonId);
  }, [markTaughtComplete, lessonId]);

  const handleMarkComplete = useCallback(() => {
    markLessonComplete(courseId, lessonId);
    if (nextLesson) {
      navigation.replace('FourFieldsLessonView', {
        courseId,
        lessonId: nextLesson.id,
      });
    } else {
      navigation.goBack();
    }
  }, [markLessonComplete, courseId, lessonId, navigation, nextLesson]);

  const handlePrevious = useCallback(() => {
    if (prevLesson) {
      navigation.replace('FourFieldsLessonView', {
        courseId,
        lessonId: prevLesson.id,
      });
    }
  }, [navigation, courseId, prevLesson]);

  const handleNext = useCallback(() => {
    if (nextLesson) {
      navigation.replace('FourFieldsLessonView', {
        courseId,
        lessonId: nextLesson.id,
      });
    }
  }, [navigation, courseId, nextLesson]);

  if (!course || !lesson || !currentFieldInfo) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.secondaryText }]}>Lesson not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.errorLink, { color: colors.accentGreen }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerSubtitle, { color: colors.primaryText }]}>{course.title}</Text>
          <Text style={[styles.headerProgress, { color: colors.secondaryText }]}>
            Lesson {lessonIndex + 1} of {course.lessons.length}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Lesson Header */}
        <View style={styles.lessonHeader}>
          <View
            style={[
              styles.fieldBadge,
              { backgroundColor: currentFieldInfo.color + '20' },
            ]}
          >
            <Text
              style={[styles.fieldBadgeText, { color: currentFieldInfo.color }]}
            >
              {currentFieldInfo.title}
            </Text>
          </View>
          <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>{lesson.title}</Text>
        </View>

        {/* Key Verse */}
        {lesson.keyVerse && (
          <TouchableOpacity
            style={[
              styles.keyVerseCard,
              {
                backgroundColor: colors.accentGreen + '12',
                borderLeftColor: colors.accentGreen,
              },
            ]}
            onPress={() => handleScripturePress(lesson.keyVerse!.reference)}
            activeOpacity={0.7}
          >
            <View style={styles.keyVerseHeader}>
              <Ionicons name="bookmark" size={16} color={colors.accentGreen} />
              <Text style={[styles.keyVerseLabel, { color: colors.accentGreen }]}>Key Verse</Text>
            </View>
            <Text style={[styles.keyVerseText, { color: colors.primaryText }]}>{`"${lesson.keyVerse.text}"`}</Text>
            <Text style={[styles.keyVerseReference, { color: colors.accentGreen }]}>{lesson.keyVerse.reference}</Text>
          </TouchableOpacity>
        )}

        {/* Lesson Sections */}
        <View style={styles.sectionsContainer}>
          {lesson.sections.map((section, index) => (
            <LessonSectionRenderer
              key={index}
              section={section}
              onScripturePress={handleScripturePress}
            />
          ))}
        </View>

        {/* Discussion Questions */}
        {lesson.discussionQuestions && lesson.discussionQuestions.length > 0 && (
          <View
            style={[
              styles.discussionSection,
              { backgroundColor: colors.warning + '10' },
            ]}
          >
            <View style={styles.discussionHeader}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.warning} />
              <Text style={[styles.discussionTitle, { color: colors.primaryText }]}>Discussion Questions</Text>
            </View>
            {lesson.discussionQuestions.map((question, index) => (
              <View key={index} style={styles.questionItem}>
                <Text style={[styles.questionNumber, { color: colors.secondaryText }]}>{index + 1}.</Text>
                <Text style={[styles.questionText, { color: colors.primaryText }]}>{question}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Takeaway Card */}
        <TakeawayCard text={lesson.takeaway} lessonTitle={lesson.title} />

        {/* Practice Card */}
        {lesson.practiceActivity && (
          <PracticeCard
            activity={lesson.practiceActivity}
            practiceCompleted={practiceComplete}
            taughtCompleted={taughtComplete}
            onPracticeComplete={handlePracticeComplete}
            onTaughtComplete={handleTaughtComplete}
          />
        )}

        {/* Navigation Buttons */}
        <View style={styles.navigationButtons}>
          {prevLesson && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handlePrevious}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={colors.secondaryText} />
              <Text style={[styles.navButtonText, { color: colors.secondaryText }]}>Previous</Text>
            </TouchableOpacity>
          )}
          <View style={styles.navSpacer} />
          {nextLesson && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handleNext}
              activeOpacity={0.7}
            >
              <Text style={[styles.navButtonText, { color: colors.secondaryText }]}>Next</Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={colors.secondaryText}
              />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Complete Button */}
      {!lessonComplete && (
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.background, borderTopColor: colors.cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.completeButton, { backgroundColor: colors.accentGreen }]}
            onPress={handleMarkComplete}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle" size={22} color={colors.cardBackground} />
            <Text style={[styles.completeButtonText, { color: colors.cardBackground }]}>
              {nextLesson ? 'Complete & Continue' : 'Complete Lesson'}
            </Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  headerProgress: {
    fontSize: 12,
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginBottom: 12,
  },
  errorLink: {
    fontSize: 16,
    fontWeight: '500',
  },
  lessonHeader: {
    marginBottom: 20,
  },
  fieldBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  keyVerseCard: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
  },
  keyVerseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  keyVerseLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keyVerseText: {
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 24,
    marginBottom: 8,
  },
  keyVerseReference: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionsContainer: {
    marginBottom: 8,
  },
  discussionSection: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  discussionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  questionItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  questionNumber: {
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
    width: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  navigationButtons: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 20,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  navSpacer: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: 32,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 16,
    gap: 8,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
