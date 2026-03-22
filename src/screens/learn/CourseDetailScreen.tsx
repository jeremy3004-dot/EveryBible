import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
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
  const { colors } = useTheme();
  const { courseId } = route.params;

  const handleLessonPress = (lessonId: string) => {
    navigation.navigate('LessonView', { courseId, lessonId });
  };

  const completedCount = sampleLessons.filter((l) => l.completed).length;
  const progress = (completedCount / sampleLessons.length) * 100;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.secondaryText }]}>Course</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>Introduction to the Bible</Text>
        <Text style={[styles.description, { color: colors.secondaryText }]}>
          Learn the basics of how the Bible is organized and its key themes. This course will help
          you understand the overall narrative of Scripture.
        </Text>

        {/* Progress Card */}
        <View
          style={[
            styles.progressCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>Your Progress</Text>
            <Text style={[styles.progressPercent, { color: colors.accentGreen }]}>
              {Math.round(progress)}%
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.cardBorder }]}>
            <View
              style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accentGreen }]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.secondaryText }]}>
            {completedCount} of {sampleLessons.length} lessons completed
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Lessons</Text>
        {sampleLessons.map((lesson, index) => (
          <TouchableOpacity
            key={lesson.id}
            style={[
              styles.lessonCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
            onPress={() => handleLessonPress(lesson.id)}
          >
            <View style={[styles.lessonNumber, { backgroundColor: colors.cardBorder }]}>
              {lesson.completed ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
              ) : (
                <Text style={[styles.lessonNumberText, { color: colors.secondaryText }]}>
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.lessonTitle,
                { color: lesson.completed ? colors.secondaryText : colors.primaryText },
              ]}
            >
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  progressCard: {
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
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
    textTransform: 'uppercase',
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: radius.sm,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  progressText: {
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
  },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  lessonNumberText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lessonTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
});
