import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants';
import type { LearnStackParamList, CourseDetailScreenProps } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;

const sampleLessons = [
  { id: '1', title: 'What is the Bible?', completed: true },
  { id: '2', title: 'The Old Testament Overview', completed: true },
  { id: '3', title: 'The New Testament Overview', completed: false },
  { id: '4', title: 'How to Study the Bible', completed: false },
  { id: '5', title: 'Key Themes in Scripture', completed: false },
  { id: '6', title: 'Bible Genres Explained', completed: false },
  { id: '7', title: 'Historical Context', completed: false },
  { id: '8', title: 'Applying Scripture Today', completed: false },
];

export function CourseDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CourseDetailScreenProps['route']>();
  const { courseId } = route.params;

  const handleLessonPress = (lessonId: string) => {
    navigation.navigate('LessonView', { courseId, lessonId });
  };

  const completedCount = sampleLessons.filter((l) => l.completed).length;
  const progress = (completedCount / sampleLessons.length) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Course</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Introduction to the Bible</Text>
        <Text style={styles.description}>
          Learn the basics of how the Bible is organized and its key themes. This course will help
          you understand the overall narrative of Scripture.
        </Text>

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Your Progress</Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completedCount} of {sampleLessons.length} lessons completed
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Lessons</Text>
        {sampleLessons.map((lesson, index) => (
          <TouchableOpacity
            key={lesson.id}
            style={styles.lessonCard}
            onPress={() => handleLessonPress(lesson.id)}
          >
            <View style={styles.lessonNumber}>
              {lesson.completed ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
              ) : (
                <Text style={styles.lessonNumberText}>{index + 1}</Text>
              )}
            </View>
            <Text style={[styles.lessonTitle, lesson.completed && styles.lessonTitleCompleted]}>
              {lesson.title}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.secondaryText,
    lineHeight: 24,
    marginBottom: 24,
  },
  progressCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentGreen,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.cardBorder,
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accentGreen,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 16,
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  lessonNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  lessonTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.primaryText,
  },
  lessonTitleCompleted: {
    color: colors.secondaryText,
  },
});
