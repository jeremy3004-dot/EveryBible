import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { fieldInfo, getCoursesByField, FIELD_TITLE_KEYS, FIELD_SUBTITLE_KEYS, FIELD_DESC_KEYS, FOUR_FIELDS_LESSON_TITLE_KEYS } from '../../data/fourFieldsCourses';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type FieldType = 'entry' | 'gospel' | 'discipleship' | 'church' | 'multiplication';

export function FieldOverviewScreen() {
  const navigation = useNavigation<NavigationProp>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const route = useRoute<any>();
  const { field } = route.params as { field: FieldType };
  const { t } = useTranslation();
  const { colors } = useTheme();

  const { isLessonComplete, getCourseProgress, getFieldProgress } = useFourFieldsStore();

  const currentFieldInfo = fieldInfo[field];
  const fieldCourses = getCoursesByField(field);
  const progress = getFieldProgress(field);

  const handleLessonPress = (courseId: string, lessonId: string) => {
    // FourFieldsLessonView removed — navigation deprecated with this screen
    void courseId; void lessonId;
  };

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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>{t(FIELD_TITLE_KEYS[field])}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Field Header */}
        <View
          style={[
            styles.fieldHeader,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.accentPrimary + '20' },
            ]}
          >
            <Ionicons
              name={getIconName(currentFieldInfo.icon)}
              size={32}
              color={colors.accentPrimary}
            />
          </View>
          <Text style={[styles.fieldTitle, { color: colors.primaryText }]}>{t(FIELD_TITLE_KEYS[field])}</Text>
          <Text style={[styles.fieldSubtitle, { color: colors.secondaryText }]}>{t(FIELD_SUBTITLE_KEYS[field])}</Text>
          <Text style={[styles.fieldDescription, { color: colors.secondaryText }]}>{t(FIELD_DESC_KEYS[field])}</Text>

          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: colors.cardBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: colors.accentPrimary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.secondaryText }]}>{progress}% complete</Text>
          </View>
        </View>

        {/* Courses and Lessons */}
        {fieldCourses.map((course) => {
          const courseProgress = getCourseProgress(course.id);

          return (
            <View key={course.id} style={styles.courseSection}>
              <View style={styles.courseHeader}>
                <Text style={[styles.courseTitle, { color: colors.primaryText }]}>{course.title}</Text>
                <Text style={[styles.courseDescription, { color: colors.secondaryText }]}>{course.description}</Text>
                <View style={styles.courseMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={14}
                      color={colors.accentPrimary}
                    />
                    <Text style={[styles.metaText, { color: colors.accentPrimary }]}>
                      {courseProgress}% complete
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={colors.secondaryText}
                    />
                    <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                      ~{course.estimatedMinutes} min
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons
                      name="book-outline"
                      size={14}
                      color={colors.secondaryText}
                    />
                    <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                      {course.lessons.length} lessons
                    </Text>
                  </View>
                </View>
              </View>

              {/* Key Verse */}
              <View
                style={[
                  styles.keyVerseCard,
                  { backgroundColor: colors.cardBackground },
                ]}
              >
                <Ionicons
                  name="bookmark"
                  size={16}
                  color={colors.accentPrimary}
                />
                <View style={styles.keyVerseContent}>
                  <Text style={[styles.keyVerseText, { color: colors.primaryText }]}>{`"${course.keyVerse.text}"`}</Text>
                  <Text style={[styles.keyVerseReference, { color: colors.secondaryText }]}>
                    {course.keyVerse.reference}
                  </Text>
                </View>
              </View>

              {/* Lessons List */}
              <View style={styles.lessonsList}>
                {course.lessons.map((lesson, index) => {
                  const isComplete = isLessonComplete(course.id, lesson.id);
                  const lessonTitleKey = FOUR_FIELDS_LESSON_TITLE_KEYS[lesson.id];
                  const lessonTitle = lessonTitleKey ? t(lessonTitleKey as Parameters<typeof t>[0]) : lesson.title;
                  return (
                    <TouchableOpacity
                      key={lesson.id}
                      style={[
                        styles.lessonCard,
                        { backgroundColor: colors.cardBackground },
                      ]}
                      onPress={() => handleLessonPress(course.id, lesson.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.lessonNumber,
                          { backgroundColor: colors.cardBorder },
                          isComplete && { backgroundColor: colors.accentGreen },
                        ]}
                      >
                        {isComplete ? (
                          <Ionicons name="checkmark" size={16} color={colors.cardBackground} />
                        ) : (
                          <Text style={[styles.lessonNumberText, { color: colors.secondaryText }]}>{index + 1}</Text>
                        )}
                      </View>
                      <View style={styles.lessonContent}>
                        <Text
                          style={[
                            styles.lessonTitle,
                            { color: isComplete ? colors.accentGreen : colors.primaryText },
                          ]}
                        >
                          {lessonTitle}
                        </Text>
                        <Text style={[styles.lessonTakeaway, { color: colors.secondaryText }]} numberOfLines={1}>
                          {lesson.takeaway}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.secondaryText}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function getIconName(icon: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    search: 'search-outline',
    broadcast: 'megaphone-outline',
    'book-open': 'book-outline',
    users: 'people-outline',
    'git-branch': 'git-branch-outline',
  };
  return iconMap[icon] || 'ellipse-outline';
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
    padding: 20,
  },
  fieldHeader: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  fieldTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldSubtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  fieldDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  progressContainer: {
    width: '100%',
  },
  progressBar: {
    height: 6,
    borderRadius: radius.xs,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.xs,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  courseSection: {
    marginBottom: 32,
  },
  courseHeader: {
    marginBottom: 16,
  },
  courseTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  courseDescription: {
    fontSize: 14,
    marginBottom: 8,
  },
  courseMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  keyVerseCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  keyVerseContent: {
    flex: 1,
  },
  keyVerseText: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
    marginBottom: 4,
  },
  keyVerseReference: {
    fontSize: 12,
    fontWeight: '600',
  },
  lessonsList: {
    gap: 8,
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
  },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lessonNumberText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lessonContent: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  lessonTakeaway: {
    fontSize: 13,
  },
});
