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
import { colors } from '../../constants';
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Lesson not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.errorLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerSubtitle}>{course.title}</Text>
          <Text style={styles.headerProgress}>
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
          <Text style={styles.lessonTitle}>{lesson.title}</Text>
        </View>

        {/* Key Verse */}
        {lesson.keyVerse && (
          <TouchableOpacity
            style={styles.keyVerseCard}
            onPress={() => handleScripturePress(lesson.keyVerse!.reference)}
            activeOpacity={0.7}
          >
            <View style={styles.keyVerseHeader}>
              <Ionicons name="bookmark" size={16} color={colors.accentGreen} />
              <Text style={styles.keyVerseLabel}>Key Verse</Text>
            </View>
            <Text style={styles.keyVerseText}>{`"${lesson.keyVerse.text}"`}</Text>
            <Text style={styles.keyVerseReference}>{lesson.keyVerse.reference}</Text>
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
          <View style={styles.discussionSection}>
            <View style={styles.discussionHeader}>
              <Ionicons name="chatbubbles-outline" size={20} color="#FFD700" />
              <Text style={styles.discussionTitle}>Discussion Questions</Text>
            </View>
            {lesson.discussionQuestions.map((question, index) => (
              <View key={index} style={styles.questionItem}>
                <Text style={styles.questionNumber}>{index + 1}.</Text>
                <Text style={styles.questionText}>{question}</Text>
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
              <Text style={styles.navButtonText}>Previous</Text>
            </TouchableOpacity>
          )}
          <View style={styles.navSpacer} />
          {nextLesson && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handleNext}
              activeOpacity={0.7}
            >
              <Text style={styles.navButtonText}>Next</Text>
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
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleMarkComplete}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.completeButtonText}>
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
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
    color: colors.primaryText,
  },
  headerProgress: {
    fontSize: 12,
    color: colors.secondaryText,
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
    color: colors.secondaryText,
    marginBottom: 12,
  },
  errorLink: {
    fontSize: 16,
    color: colors.accentGreen,
    fontWeight: '500',
  },
  lessonHeader: {
    marginBottom: 20,
  },
  fieldBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primaryText,
    lineHeight: 32,
  },
  keyVerseCard: {
    backgroundColor: colors.accentGreen + '12',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentGreen,
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
    color: colors.accentGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keyVerseText: {
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.primaryText,
    lineHeight: 24,
    marginBottom: 8,
  },
  keyVerseReference: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentGreen,
  },
  sectionsContainer: {
    marginBottom: 8,
  },
  discussionSection: {
    backgroundColor: '#FFD70010',
    borderRadius: 12,
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
    color: colors.primaryText,
  },
  questionItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  questionNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondaryText,
    marginRight: 8,
    width: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.primaryText,
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
    color: colors.secondaryText,
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
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    padding: 16,
    paddingBottom: 32,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
