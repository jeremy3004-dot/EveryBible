import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { useAuthStore } from '../../stores/authStore';
import { fourFieldsCourses, fieldInfo, FIELD_TITLE_KEYS } from '../../data/fourFieldsCourses';
import { LessonSectionRenderer } from '../../components/fourfields';
import {
  buildGroupDetailSnapshot,
  getSyncedGroup,
  getSyncedGroupServiceAvailability,
  loadGroupDetailSnapshot,
  recordSyncedGroupSession,
  updateSyncedGroupLesson,
} from '../../services/groups';
import { isSupabaseConfigured } from '../../services/supabase';
import type { GroupDetailSnapshot } from '../../services/groups/groupRepository';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'GroupSession'>;

type SessionPhase = 'look-back' | 'look-up' | 'look-forward';


export function GroupSessionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();

  const PHASES = [
    { id: 'look-back' as SessionPhase, title: t('groups.session.lookBack'), duration: t('groups.session.duration5min'), icon: 'arrow-back-circle-outline' as keyof typeof Ionicons.glyphMap },
    { id: 'look-up' as SessionPhase, title: t('groups.session.lookUp'), duration: t('groups.session.duration10min'), icon: 'arrow-up-circle-outline' as keyof typeof Ionicons.glyphMap },
    { id: 'look-forward' as SessionPhase, title: t('groups.session.lookForward'), duration: t('groups.session.duration10min'), icon: 'arrow-forward-circle-outline' as keyof typeof Ionicons.glyphMap },
];

  const groups = useFourFieldsStore((state) => state.groups);
  const groupProgress = useFourFieldsStore((state) => state.groupProgress);
  const markGroupLessonComplete = useFourFieldsStore((state) => state.markGroupLessonComplete);
  const updateLocalGroupLesson = useFourFieldsStore((state) => state.updateGroupLesson);
  const user = useAuthStore((state) => state.user);
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>('look-back');
  const [isSavingSynced, setIsSavingSynced] = useState(false);
  const userId = user?.uid ?? null;
  const isSignedIn = Boolean(user);
  const syncFeatureEnabled = config.features.studyGroupsSync;
  const backendConfigured = isSupabaseConfigured();
  const localGroup = groups.find((candidate) => candidate.id === groupId) ?? null;
  const localSnapshot = buildGroupDetailSnapshot({
    localGroup,
    localProgress: localGroup ? groupProgress[groupId] ?? null : null,
    syncedGroup: null,
    currentUserId: userId,
  });
  const remoteRequestKey =
    localSnapshot == null && syncFeatureEnabled && backendConfigured && isSignedIn
      ? `${groupId}:${user?.uid ?? 'signed-in'}`
      : null;
  const [remoteGroupState, setRemoteGroupState] = useState<{
    key: string | null;
    group: GroupDetailSnapshot | null;
    error: string | null;
  }>({
    key: null,
    group: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!remoteRequestKey) {
      return () => {
        cancelled = true;
      };
    }

    void loadGroupDetailSnapshot({
      groupId,
      localGroups: [],
      localProgress: {},
      syncFeatureEnabled,
      backendConfigured,
      signedIn: isSignedIn,
      currentUserId: userId,
      getSyncedGroup,
    })
      .then((snapshot) => {
        if (!cancelled) {
          setRemoteGroupState({
            key: remoteRequestKey,
            group: snapshot,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRemoteGroupState({
          key: remoteRequestKey,
          group: null,
          error: error instanceof Error ? error.message : t('groups.unableToLoadGroup'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    backendConfigured,
    groupId,
    isSignedIn,
    remoteRequestKey,
    syncFeatureEnabled,
    t,
    userId,
  ]);

  const group =
    localSnapshot ??
    (remoteRequestKey !== null && remoteGroupState.key === remoteRequestKey
      ? remoteGroupState.group
      : null);
  const loadError =
    remoteRequestKey !== null && remoteGroupState.key === remoteRequestKey
      ? remoteGroupState.error
      : null;
  const isLoading = localSnapshot == null && remoteRequestKey !== null && remoteGroupState.key !== remoteRequestKey;
  const syncedServiceAvailability = getSyncedGroupServiceAvailability({
    backendConfigured,
    signedIn: isSignedIn,
  });
  const isSyncedGroup = group?.source === 'synced';

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.secondaryText }]}>{t('groups.loadingGroup')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.secondaryText }]}>{loadError ?? t('groups.groupNotFound')}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.errorLink, { color: colors.accentGreen }]}>{t('groups.goBack')}</Text>
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

  const handleComplete = async () => {
    if (!currentLesson) {
      return;
    }

    if (!isSyncedGroup) {
      markGroupLessonComplete(groupId, currentLesson.id);
      if (nextLesson && currentCourse) {
        updateLocalGroupLesson(groupId, currentCourse.id, nextLesson.id);
      }
      navigation.goBack();
      return;
    }

    if (syncedServiceAvailability !== 'ready') {
      Alert.alert(
        t('groups.syncSession.unavailableTitle'),
        syncedServiceAvailability === 'backend-unavailable'
          ? t('groups.syncSession.backendUnavailable')
          : t('groups.syncSession.signInRequired')
      );
      return;
    }

    try {
      setIsSavingSynced(true);
      await recordSyncedGroupSession({
        groupId,
        courseId: group.currentCourseId,
        lessonId: currentLesson.id,
      });
      if (nextLesson && currentCourse) {
        await updateSyncedGroupLesson(groupId, {
          current_course_id: currentCourse.id,
          current_lesson_id: nextLesson.id,
        });
      }
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('groups.syncSession.saveFailedDefault');
      Alert.alert(t('groups.syncSession.saveFailedTitle'), message);
    } finally {
      setIsSavingSynced(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>{t('groups.session.title')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]}>{group.name}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Phase Tabs */}
      <View style={[styles.phaseTabs, { backgroundColor: colors.cardBackground }]}>
        {PHASES.map((phase, index) => {
          const isActive = phase.id === currentPhase;
          const isCompleted = index < currentPhaseIndex;
          return (
            <TouchableOpacity
              key={phase.id}
              style={[
                styles.phaseTab,
                isActive && { backgroundColor: colors.accentGreen + '20' },
              ]}
              onPress={() => setCurrentPhase(phase.id)}
            >
              <View
                style={[
                  styles.phaseIndicator,
                  { backgroundColor: colors.cardBorder },
                  isActive && { backgroundColor: colors.accentGreen },
                  isCompleted && { backgroundColor: colors.accentGreen },
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color={colors.cardBackground} />
                ) : (
                  <Text
                    style={[
                      styles.phaseNumber,
                      { color: colors.secondaryText },
                      isActive && { color: colors.cardBackground },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.phaseTitle,
                  { color: colors.secondaryText },
                  isActive && { color: colors.accentGreen, fontWeight: '600' },
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
                {t(FIELD_TITLE_KEYS[currentCourse.field])}
              </Text>
            </View>
            <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>{currentLesson.title}</Text>
          </View>
        )}

        {isSyncedGroup ? (
          <View style={[styles.syncedNoticeCard, { backgroundColor: colors.cardBackground }]}>
            <Ionicons name="cloud-done-outline" size={18} color={colors.accentGreen} />
            <Text style={[styles.syncedNoticeText, { color: colors.primaryText }]}>
              {t('groups.session.syncedNotice')}
            </Text>
          </View>
        ) : null}

        {/* Phase Content */}
        {currentPhase === 'look-back' && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-back-circle" size={24} color={colors.accentPrimary} />
              <View>
                <Text style={[styles.phaseContentTitle, { color: colors.primaryText }]}>{t('groups.session.lookBack')}</Text>
                <Text style={[styles.phaseDuration, { color: colors.secondaryText }]}>{t('groups.session.duration5min')}</Text>
              </View>
            </View>

            <Text style={[styles.phaseDescription, { color: colors.secondaryText }]}>
              {t('groups.session.lookBackDescription')}
            </Text>

            <View style={[styles.discussionCard, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.discussionLabel, { color: colors.primaryText }]}>{t('groups.session.discussTogether')}</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>1.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookBackQ1')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>2.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookBackQ2')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>3.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookBackQ3')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.warning + '15' }]}>
              <Ionicons name="bulb-outline" size={18} color={colors.warning} />
              <Text style={[styles.tipText, { color: colors.primaryText }]}>
                {t('groups.session.lookBackTip')}
              </Text>
            </View>
          </View>
        )}

        {currentPhase === 'look-up' && currentLesson && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-up-circle" size={24} color={colors.accentGreen} />
              <View>
                <Text style={[styles.phaseContentTitle, { color: colors.primaryText }]}>{t('groups.session.lookUp')}</Text>
                <Text style={[styles.phaseDuration, { color: colors.secondaryText }]}>{t('groups.session.duration10min')}</Text>
              </View>
            </View>

            <Text style={[styles.phaseDescription, { color: colors.secondaryText }]}>
              {t('groups.session.lookUpDescription')}
            </Text>

            {/* Key Verse */}
            {currentLesson.keyVerse && (
              <View
                style={[
                  styles.scriptureCard,
                  {
                    backgroundColor: colors.accentGreen + '15',
                    borderLeftColor: colors.accentGreen,
                  },
                ]}
              >
                <Text style={[styles.scriptureReference, { color: colors.accentGreen }]}>
                  {currentLesson.keyVerse.reference}
                </Text>
                <Text style={[styles.scriptureText, { color: colors.primaryText }]}>
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

            <View style={[styles.discussionCard, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.discussionLabel, { color: colors.primaryText }]}>{t('groups.session.discoveryQuestions')}</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>1.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookUpQ1')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>2.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookUpQ2')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>3.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookUpQ3')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>4.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookUpQ4')}
                  </Text>
                </View>
              </View>
            </View>

            {/* Discussion questions from lesson */}
            {currentLesson.discussionQuestions && currentLesson.discussionQuestions.length > 0 && (
              <View style={[styles.lessonQuestionsCard, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.discussionLabel, { color: colors.primaryText }]}>{t('groups.session.lessonQuestions')}</Text>
                {currentLesson.discussionQuestions.map((q, i) => (
                  <View key={i} style={styles.questionItem}>
                    <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>{i + 1}.</Text>
                    <Text style={[styles.questionText, { color: colors.primaryText }]}>{q}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {currentPhase === 'look-forward' && currentLesson && (
          <View style={styles.phaseContent}>
            <View style={styles.phaseHeader}>
              <Ionicons name="arrow-forward-circle" size={24} color={colors.accentPrimary} />
              <View>
                <Text style={[styles.phaseContentTitle, { color: colors.primaryText }]}>{t('groups.session.lookForward')}</Text>
                <Text style={[styles.phaseDuration, { color: colors.secondaryText }]}>{t('groups.session.duration10min')}</Text>
              </View>
            </View>

            <Text style={[styles.phaseDescription, { color: colors.secondaryText }]}>
              {t('groups.session.lookForwardDescription')}
            </Text>

            <View style={[styles.takeawayCard, { backgroundColor: colors.warning + '15' }]}>
              <Text style={[styles.takeawayLabel, { color: colors.warning }]}>{t('groups.session.keyTakeaway')}</Text>
              <Text style={[styles.takeawayText, { color: colors.primaryText }]}>{currentLesson.takeaway}</Text>
            </View>

            {currentLesson.practiceActivity && (
              <View style={[styles.practiceCard, { backgroundColor: colors.accentPrimary + '15' }]}>
                <Text style={[styles.practiceLabel, { color: colors.primaryText }]}>{t('groups.session.thisWeeksPractice')}</Text>
                <Text style={[styles.practiceText, { color: colors.primaryText }]}>{currentLesson.practiceActivity}</Text>
              </View>
            )}

            <View style={[styles.discussionCard, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.discussionLabel, { color: colors.primaryText }]}>{t('groups.session.commitTogether')}</Text>
              <View style={styles.questionList}>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>1.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookForwardQ1')}
                  </Text>
                </View>
                <View style={styles.questionItem}>
                  <Text style={[styles.questionBullet, { color: colors.secondaryText }]}>2.</Text>
                  <Text style={[styles.questionText, { color: colors.primaryText }]}>
                    {t('groups.session.lookForwardQ2')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.prayerCard, { backgroundColor: colors.accentPrimary + '15' }]}>
              <Ionicons name="heart-outline" size={18} color={colors.accentPrimary} />
              <Text style={[styles.prayerText, { color: colors.primaryText }]}>
                {t('groups.session.closingPrayer')}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Navigation */}
      <View
        style={[
          styles.footer,
          { backgroundColor: colors.background, borderTopColor: colors.cardBorder },
        ]}
      >
        <View style={styles.footerButtons}>
          {currentPhaseIndex > 0 && (
            <TouchableOpacity
              style={styles.footerButtonSecondary}
              onPress={handlePreviousPhase}
            >
              <Ionicons name="arrow-back" size={20} color={colors.secondaryText} />
              <Text style={[styles.footerButtonSecondaryText, { color: colors.secondaryText }]}>{t('common.previous')}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.footerSpacer} />
          {currentPhaseIndex < PHASES.length - 1 ? (
            <TouchableOpacity
              style={[styles.footerButtonPrimary, { backgroundColor: colors.accentGreen }]}
              onPress={handleNextPhase}
            >
              <Text style={[styles.footerButtonPrimaryText, { color: colors.cardBackground }]}>{t('common.next')}</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.cardBackground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.footerButtonPrimary,
                { backgroundColor: colors.accentGreen },
                isSavingSynced && styles.footerButtonPrimaryDisabled,
              ]}
              onPress={() => {
                void handleComplete();
              }}
              disabled={isSavingSynced}
            >
              <Ionicons name="checkmark" size={20} color={colors.cardBackground} />
              <Text style={[styles.footerButtonPrimaryText, { color: colors.cardBackground }]}>
                {isSavingSynced
                  ? t('groups.session.saving')
                  : isSyncedGroup
                    ? t('groups.saveSyncedSession')
                    : t('groups.session.completeSession')}
              </Text>
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
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
    marginBottom: 12,
  },
  errorLink: {
    fontSize: 16,
    fontWeight: '500',
  },
  phaseTabs: {
    flexDirection: 'row',
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
    borderRadius: radius.md,
    gap: 6,
  },
  phaseIndicator: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseNumber: {
    fontSize: 12,
    fontWeight: '600',
  },
  phaseTitle: {
    fontSize: 13,
    fontWeight: '500',
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
  syncedNoticeCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  syncedNoticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 22,
    fontWeight: '700',
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
  },
  phaseDuration: {
    fontSize: 12,
  },
  phaseDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  discussionCard: {
    borderRadius: radius.lg,
    padding: 16,
  },
  discussionLabel: {
    fontSize: 14,
    fontWeight: '600',
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
    width: 24,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  lessonQuestionsCard: {
    borderRadius: radius.lg,
    padding: 16,
  },
  tipCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  scriptureCard: {
    borderRadius: radius.lg,
    padding: 16,
    borderLeftWidth: 3,
  },
  scriptureReference: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  scriptureText: {
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 24,
  },
  takeawayCard: {
    borderRadius: radius.lg,
    padding: 16,
  },
  takeawayLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  takeawayText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  practiceCard: {
    borderRadius: radius.lg,
    padding: 16,
  },
  practiceLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  practiceText: {
    fontSize: 15,
    lineHeight: 22,
  },
  prayerCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  prayerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
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
    fontWeight: '500',
  },
  footerSpacer: {
    flex: 1,
  },
  footerButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    gap: 8,
  },
  footerButtonPrimaryDisabled: {
    opacity: 0.7,
  },
  footerButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
