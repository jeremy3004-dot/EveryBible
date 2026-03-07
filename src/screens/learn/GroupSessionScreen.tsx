import React, { useState } from 'react';
import {
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
import { colors } from '../../constants';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { fourFieldsCourses, fieldInfo } from '../../data/fourFieldsCourses';
import { LessonSectionRenderer } from '../../components/fourfields';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'GroupSession'>;

type SessionPhase = 'look-back' | 'look-up' | 'look-forward';

const PHASES: { id: SessionPhase; title: string; duration: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'look-back', title: 'Look Back', duration: '~5 min', icon: 'arrow-back-circle-outline' },
  { id: 'look-up', title: 'Look Up', duration: '~10 min', icon: 'arrow-up-circle-outline' },
  { id: 'look-forward', title: 'Look Forward', duration: '~10 min', icon: 'arrow-forward-circle-outline' },
];

export function GroupSessionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId } = route.params;

  const { getGroup, markGroupLessonComplete, updateGroupLesson } = useFourFieldsStore();
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>('look-back');

  const group = getGroup(groupId);

  if (!group) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Group not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.errorLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentCourse = fourFieldsCourses.find((c) => c.id === group.currentCourseId);
  const currentLesson = currentCourse?.lessons.find((l) => l.id === group.currentLessonId);
  const currentFieldInfo = currentCourse ? fieldInfo[currentCourse.field] : null;
  const lessonIndex = currentCourse?.lessons.findIndex((l) => l.id === group.currentLessonId) ?? -1;
  const nextLesson = currentCourse && lessonIndex < currentCourse.lessons.length - 1
    ? currentCourse.lessons[lessonIndex + 1]
    : null;

  const currentPhaseIndex = PHASES.findIndex((p) => p.id === currentPhase);

  const handleNextPhase = () => {
    const nextIndex = currentPhaseIndex + 1;
    if (nextIndex < PHASES.length) {
      setCurrentPhase(PHASES[nextIndex].id);
    }
  };

  const handlePreviousPhase = () => {
    const prevIndex = currentPhaseIndex - 1;
    if (prevIndex >= 0) {
      setCurrentPhase(PHASES[prevIndex].id);
    }
  };

  const handleComplete = () => {
    if (currentLesson) {
      markGroupLessonComplete(groupId, currentLesson.id);
    }
    if (nextLesson && currentCourse) {
      updateGroupLesson(groupId, currentCourse.id, nextLesson.id);
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Group Session</Text>
          <Text style={styles.headerSubtitle}>{group.name}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Phase Tabs */}
      <View style={styles.phaseTabs}>
        {PHASES.map((phase, index) => {
          const isActive = phase.id === currentPhase;
          const isCompleted = index < currentPhaseIndex;
          return (
            <TouchableOpacity
              key={phase.id}
              style={[
                styles.phaseTab,
                isActive && styles.phaseTabActive,
              ]}
              onPress={() => setCurrentPhase(phase.id)}
            >
              <View
                style={[
                  styles.phaseIndicator,
                  isActive && styles.phaseIndicatorActive,
                  isCompleted && styles.phaseIndicatorCompleted,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.phaseNumber,
                      isActive && styles.phaseNumberActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.phaseTitle,
                  isActive && styles.phaseTitleActive,
                ]}
              >
                {phase.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Lesson Info */}
        {currentCourse && currentLesson && currentFieldInfo && (
          <View style={styles.lessonInfo}>
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
            <Text style={styles.lessonTitle}>{currentLesson.title}</Text>
          </View>
        )}

        {/* Phase Content */}
        {currentPhase === 'look-back' && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-back-circle" size={24} color="#4169E1" />
              <View>
                <Text style={styles.phaseContentTitle}>Look Back</Text>
                <Text style={styles.phaseDuration}>~5 minutes</Text>
              </View>
            </View>

            <Text style={styles.phaseDescription}>
              {"Start by checking in on how everyone applied last week's lesson. This builds accountability and celebrates obedience."}
            </Text>

            <View style={styles.discussionCard}>
              <Text style={styles.discussionLabel}>Discuss Together:</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>1.</Text>
                  <Text style={styles.questionText}>
                    How did you obey what you learned last time?
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>2.</Text>
                  <Text style={styles.questionText}>
                    Who did you share it with? What happened?
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>3.</Text>
                  <Text style={styles.questionText}>
                    What challenges did you face?
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.tipCard}>
              <Ionicons name="bulb-outline" size={18} color="#FFD700" />
              <Text style={styles.tipText}>
                {"Celebrate wins! Encourage those who obeyed. Gently encourage those who didn't to try again this week."}
              </Text>
            </View>
          </View>
        )}

        {currentPhase === 'look-up' && currentLesson && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-up-circle" size={24} color={colors.accentGreen} />
              <View>
                <Text style={styles.phaseContentTitle}>Look Up</Text>
                <Text style={styles.phaseDuration}>~10 minutes</Text>
              </View>
            </View>

            <Text style={styles.phaseDescription}>
              Read the Scripture together and discover what God is teaching.
            </Text>

            {/* Key Verse */}
            {currentLesson.keyVerse && (
              <View style={styles.scriptureCard}>
                <Text style={styles.scriptureReference}>
                  {currentLesson.keyVerse.reference}
                </Text>
                <Text style={styles.scriptureText}>
                  {`"${currentLesson.keyVerse.text}"`}
                </Text>
              </View>
            )}

            {/* Scripture sections from lesson */}
            {currentLesson.sections
              .filter((s) => s.type === 'scripture')
              .map((section, index) => (
                <LessonSectionRenderer key={index} section={section} />
              ))}

            <View style={styles.discussionCard}>
              <Text style={styles.discussionLabel}>Discovery Questions:</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>1.</Text>
                  <Text style={styles.questionText}>
                    What does this passage teach about God?
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>2.</Text>
                  <Text style={styles.questionText}>
                    What does it teach about people?
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>3.</Text>
                  <Text style={styles.questionText}>
                    Is there an example to follow or avoid?
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>4.</Text>
                  <Text style={styles.questionText}>
                    Is there a command to obey?
                  </Text>
                </View>
              </View>
            </View>

            {/* Discussion questions from lesson */}
            {currentLesson.discussionQuestions && currentLesson.discussionQuestions.length > 0 && (
              <View style={styles.lessonQuestionsCard}>
                <Text style={styles.discussionLabel}>Lesson Questions:</Text>
                {currentLesson.discussionQuestions.map((q, i) => (
                  <View key={i} style={styles.questionItem}>
                    <Text style={styles.questionBullet}>{i + 1}.</Text>
                    <Text style={styles.questionText}>{q}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {currentPhase === 'look-forward' && currentLesson && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-forward-circle" size={24} color="#9932CC" />
              <View>
                <Text style={styles.phaseContentTitle}>Look Forward</Text>
                <Text style={styles.phaseDuration}>~10 minutes</Text>
              </View>
            </View>

            <Text style={styles.phaseDescription}>
              Commit to obeying what you learned and sharing it with someone else.
            </Text>

            <View style={styles.takeawayCard}>
              <Text style={styles.takeawayLabel}>Key Takeaway:</Text>
              <Text style={styles.takeawayText}>{currentLesson.takeaway}</Text>
            </View>

            {currentLesson.practiceActivity && (
              <View style={styles.practiceCard}>
                <Text style={styles.practiceLabel}>{"This Week's Practice:"}</Text>
                <Text style={styles.practiceText}>{currentLesson.practiceActivity}</Text>
              </View>
            )}

            <View style={styles.discussionCard}>
              <Text style={styles.discussionLabel}>Commit Together:</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>1.</Text>
                  <Text style={styles.questionText}>
                    {'"I will..." - How will you obey this teaching?'}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={styles.questionBullet}>2.</Text>
                  <Text style={styles.questionText}>
                    {'"I will share with..." - Who will you teach this to?'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.prayerCard}>
              <Ionicons name="heart-outline" size={18} color="#9932CC" />
              <Text style={styles.prayerText}>
                {"Close in prayer. Ask God to help each person obey and share what they've learned. Pray for the people they'll share with."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Navigation */}
      <View style={styles.footer}>
        <View style={styles.footerButtons}>
          {currentPhaseIndex > 0 && (
            <TouchableOpacity
              style={styles.footerButtonSecondary}
              onPress={handlePreviousPhase}
            >
              <Ionicons name="arrow-back" size={20} color={colors.secondaryText} />
              <Text style={styles.footerButtonSecondaryText}>Previous</Text>
            </TouchableOpacity>
          )}
          <View style={styles.footerSpacer} />
          {currentPhaseIndex < PHASES.length - 1 ? (
            <TouchableOpacity
              style={styles.footerButtonPrimary}
              onPress={handleNextPhase}
            >
              <Text style={styles.footerButtonPrimaryText}>Next</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.footerButtonPrimary}
              onPress={handleComplete}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.footerButtonPrimaryText}>Complete Session</Text>
            </TouchableOpacity>
          )}
        </View>
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryText,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  headerRight: {
    width: 32,
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
  phaseTabs: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  phaseTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  phaseTabActive: {
    backgroundColor: colors.accentGreen + '20',
  },
  phaseIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseIndicatorActive: {
    backgroundColor: colors.accentGreen,
  },
  phaseIndicatorCompleted: {
    backgroundColor: colors.accentGreen,
  },
  phaseNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  phaseNumberActive: {
    color: '#fff',
  },
  phaseTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondaryText,
  },
  phaseTitleActive: {
    color: colors.accentGreen,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  lessonInfo: {
    marginBottom: 20,
  },
  fieldBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryText,
  },
  phaseContent: {
    gap: 16,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  phaseContentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primaryText,
  },
  phaseDuration: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  phaseDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.secondaryText,
  },
  discussionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
  },
  discussionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
    marginBottom: 12,
  },
  questionList: {
    gap: 10,
  },
  questionItem: {
    flexDirection: 'row',
  },
  questionBullet: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
    width: 24,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.primaryText,
  },
  lessonQuestionsCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFD70015',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryText,
  },
  scriptureCard: {
    backgroundColor: colors.accentGreen + '15',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentGreen,
  },
  scriptureReference: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentGreen,
    marginBottom: 8,
  },
  scriptureText: {
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 24,
    color: colors.primaryText,
  },
  takeawayCard: {
    backgroundColor: '#FFD70015',
    borderRadius: 12,
    padding: 16,
  },
  takeawayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFD700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  takeawayText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    color: colors.primaryText,
  },
  practiceCard: {
    backgroundColor: '#4169E115',
    borderRadius: 12,
    padding: 16,
  },
  practiceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
    marginBottom: 8,
  },
  practiceText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.primaryText,
  },
  prayerCard: {
    flexDirection: 'row',
    backgroundColor: '#9932CC15',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  prayerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryText,
    fontStyle: 'italic',
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
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  footerButtonSecondaryText: {
    fontSize: 15,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  footerSpacer: {
    flex: 1,
  },
  footerButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentGreen,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  footerButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
