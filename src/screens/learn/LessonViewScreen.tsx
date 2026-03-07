import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants';
import type { LearnStackParamList, LessonViewScreenProps } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;

export function LessonViewScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LessonViewScreenProps['route']>();
  const { lessonId } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lesson {lessonId}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.lessonTitle}>What is the Bible?</Text>

        <View style={styles.section}>
          <Text style={styles.paragraph}>
            {
              "The Bible is a collection of 66 books written by approximately 40 different authors over a period of about 1,500 years. Despite its diverse authorship, the Bible tells one unified story of God's plan to redeem humanity."
            }
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Points</Text>
          <View style={styles.bulletPoint}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>
              The Bible is divided into two main sections: Old Testament and New Testament
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>
              The Old Testament contains 39 books written before Jesus
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>
              {"The New Testament contains 27 books written after Jesus' life and resurrection"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scripture Reference</Text>
          <View style={styles.scriptureCard}>
            <Text style={styles.scriptureText}>
              {
                '"All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness, so that the servant of God may be thoroughly equipped for every good work."'
              }
            </Text>
            <Text style={styles.scriptureReference}>2 Timothy 3:16-17</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.completeButton}>
          <Text style={styles.completeButtonText}>Mark as Complete</Text>
        </TouchableOpacity>
      </View>
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
  lessonTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 16,
    color: colors.primaryText,
    lineHeight: 26,
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentGreen,
    marginTop: 8,
    marginRight: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    color: colors.primaryText,
    lineHeight: 24,
  },
  scriptureCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.accentGreen,
  },
  scriptureText: {
    fontSize: 16,
    color: colors.primaryText,
    lineHeight: 26,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  scriptureReference: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentGreen,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  completeButton: {
    backgroundColor: colors.accentGreen,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryText,
  },
});
