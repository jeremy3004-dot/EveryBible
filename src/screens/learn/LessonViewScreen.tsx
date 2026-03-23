import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LessonViewScreenProps = { route: any };

export function LessonViewScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LessonViewScreenProps['route']>();
  const { lessonId } = route.params;
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.secondaryText }]}>Lesson {lessonId}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>What is the Bible?</Text>

        <View style={styles.section}>
          <Text style={[styles.paragraph, { color: colors.primaryText }]}>
            {
              "The Bible is a collection of 66 books written by approximately 40 different authors over a period of about 1,500 years. Despite its diverse authorship, the Bible tells one unified story of God's plan to redeem humanity."
            }
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Key Points</Text>
          <View style={styles.bulletPoint}>
            <View style={[styles.bullet, { backgroundColor: colors.accentGreen }]} />
            <Text style={[styles.bulletText, { color: colors.primaryText }]}>
              The Bible is divided into two main sections: Old Testament and New Testament
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <View style={[styles.bullet, { backgroundColor: colors.accentGreen }]} />
            <Text style={[styles.bulletText, { color: colors.primaryText }]}>
              The Old Testament contains 39 books written before Jesus
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <View style={[styles.bullet, { backgroundColor: colors.accentGreen }]} />
            <Text style={[styles.bulletText, { color: colors.primaryText }]}>
              {"The New Testament contains 27 books written after Jesus' life and resurrection"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Scripture Reference</Text>
          <View
            style={[
              styles.scriptureCard,
              { backgroundColor: colors.cardBackground, borderLeftColor: colors.accentGreen },
            ]}
          >
            <Text style={[styles.scriptureText, { color: colors.primaryText }]}>
              {
                '"All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness, so that the servant of God may be thoroughly equipped for every good work."'
              }
            </Text>
            <Text style={[styles.scriptureReference, { color: colors.accentGreen }]}>2 Timothy 3:16-17</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={[styles.completeButton, { backgroundColor: colors.accentGreen }]}
        >
          <Text style={[styles.completeButtonText, { color: colors.cardBackground }]}>Mark as Complete</Text>
        </TouchableOpacity>
      </View>
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
  lessonTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: radius.xs,
    marginTop: 8,
    marginRight: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  scriptureCard: {
    borderRadius: radius.lg,
    padding: 20,
    borderLeftWidth: 4,
  },
  scriptureText: {
    fontSize: 16,
    lineHeight: 26,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  scriptureReference: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  completeButton: {
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
