import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { useAuthStore } from '../../stores/authStore';
import { fourFieldsCourses, fieldInfo } from '../../data/fourFieldsCourses';
import {
  buildGroupDetailSnapshot,
  getSyncedGroup,
  getSyncedGroupServiceAvailability,
  loadGroupDetailSnapshot,
} from '../../services/groups';
import { isSupabaseConfigured } from '../../services/supabase';
import type { GroupDetailSnapshot } from '../../services/groups/groupRepository';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'GroupDetail'>;

export function GroupDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId } = route.params;
  const { colors } = useTheme();

  const groups = useFourFieldsStore((state) => state.groups);
  const groupProgress = useFourFieldsStore((state) => state.groupProgress);
  const leaveGroup = useFourFieldsStore((state) => state.leaveGroup);
  const user = useAuthStore((state) => state.user);
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
          error: error instanceof Error ? error.message : 'Unable to load group.',
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
    userId,
  ]);

  const group =
    localSnapshot ??
    (remoteRequestKey !== null && remoteGroupState.key === remoteRequestKey
      ? remoteGroupState.group
      : null);
  const syncedServiceAvailability = getSyncedGroupServiceAvailability({
    backendConfigured,
    signedIn: isSignedIn,
  });
  const loadError =
    remoteRequestKey !== null && remoteGroupState.key === remoteRequestKey
      ? remoteGroupState.error
      : null;
  const isLoading = localSnapshot == null && remoteRequestKey !== null && remoteGroupState.key !== remoteRequestKey;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.secondaryText }]}>Loading group...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.secondaryText }]}>{loadError ?? 'Group not found'}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.errorLink, { color: colors.accentGreen }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isLocalGroup = group.source === 'local';
  const canStartSession =
    isLocalGroup || (group.source === 'synced' && syncedServiceAvailability === 'ready');
  const currentCourse = fourFieldsCourses.find((course) => course.id === group.currentCourseId);
  const currentLesson = currentCourse?.lessons.find((lesson) => lesson.id === group.currentLessonId);
  const currentFieldInfo = currentCourse ? fieldInfo[currentCourse.field] : null;

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Join my discipleship group "${group.name}" in EveryBible!\n\nJoin code: ${group.joinCode}`,
      });
    } catch {
      // User cancelled
    }
  };

  const handleStartSession = () => {
    navigation.navigate('GroupSession', { groupId });
  };

  const handleLeaveGroup = () => {
    if (!isLocalGroup || !userId) {
      return;
    }

    Alert.alert(
      'Leave Group',
      group.isLeader
        ? 'As the leader, leaving will transfer leadership to the next oldest member. Are you sure?'
        : 'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            leaveGroup(groupId, userId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const completedCount = group.completedLessonCount;

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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>{group.name}</Text>
        <TouchableOpacity style={styles.moreButton} onPress={handleShareCode}>
          <Ionicons name="share-outline" size={24} color={colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Join Code Card */}
        <TouchableOpacity
          style={[styles.codeCard, { backgroundColor: colors.cardBackground }]}
          onPress={handleShareCode}
        >
          <View style={styles.codeCardLeft}>
            <Text style={[styles.codeLabel, { color: colors.secondaryText }]}>Join Code</Text>
            <Text style={[styles.codeValue, { color: colors.primaryText }]}>{group.joinCode}</Text>
          </View>
          <View style={styles.codeCardRight}>
            <Ionicons name="share-social-outline" size={20} color={colors.accentGreen} />
            <Text style={[styles.shareText, { color: colors.accentGreen }]}>Share</Text>
          </View>
        </TouchableOpacity>

        {/* Current Lesson Card */}
        {currentCourse && currentLesson && currentFieldInfo && (
          <View style={[styles.currentCard, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.currentCardHeader}>
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
              <Text style={[styles.progressText, { color: colors.secondaryText }]}>
                {completedCount === null
                  ? 'Synced progress will appear after session rollout is enabled.'
                  : `${completedCount} lessons completed`}
              </Text>
            </View>
            <Text style={[styles.currentTitle, { color: colors.primaryText }]}>{currentCourse.title}</Text>
            <Text style={[styles.currentLesson, { color: colors.secondaryText }]}>
              Next: {currentLesson.title}
            </Text>
            {canStartSession ? (
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: colors.accentGreen }]}
                onPress={handleStartSession}
              >
                <Ionicons name="play" size={20} color={colors.cardBackground} />
                <Text style={[styles.startButtonText, { color: colors.cardBackground }]}>
                  {isLocalGroup ? 'Start Group Session' : 'Save Synced Session'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.readOnlyCard, { backgroundColor: colors.background }]}>
                <View style={styles.readOnlyHeader}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.accentGreen} />
                  <Text style={[styles.readOnlyTitle, { color: colors.primaryText }]}>Synced group preview</Text>
                </View>
                <Text style={[styles.readOnlyBody, { color: colors.secondaryText }]}>
                  Secure synced session recording is not available until backend configuration and
                  signed-in access are both ready for this build.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Members Section */}
        <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
          Members ({group.memberCount})
        </Text>
        {isLocalGroup ? (
          group.members.map((member) => {
            const isCurrentUser = member.id === userId;

            return (
              <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.cardBackground }]}>
                <View style={[styles.memberAvatar, { backgroundColor: colors.accentGreen + '30' }]}>
                  <Text style={[styles.memberInitial, { color: colors.accentGreen }]}>
                    {(member.name ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={[styles.memberName, { color: colors.primaryText }]}>
                      {member.name}
                      {isCurrentUser && ' (you)'}
                    </Text>
                    {member.role === 'leader' && (
                      <View style={[styles.leaderBadge, { backgroundColor: colors.accentGreen + '30' }]}>
                        <Text style={[styles.leaderBadgeText, { color: colors.accentGreen }]}>Leader</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberJoined, { color: colors.secondaryText }]}>
                    {member.joinedAt == null
                      ? 'Joined recently'
                      : `Joined ${new Date(member.joinedAt).toLocaleDateString()}`}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={[styles.readOnlyCard, { backgroundColor: colors.background }]}>
            <View style={styles.readOnlyHeader}>
              <Ionicons name="people-outline" size={18} color={colors.accentGreen} />
              <Text style={[styles.readOnlyTitle, { color: colors.primaryText }]}>Read-only synced membership</Text>
            </View>
            <Text style={[styles.readOnlyBody, { color: colors.secondaryText }]}>
              This synced group came from your signed-in account. Member names and synced lesson
              history will appear here as rollout continues.
            </Text>
          </View>
        )}

        {/* About the 3/3rds Format */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBackground }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={20} color={colors.accentGreen} />
            <Text style={[styles.infoTitle, { color: colors.primaryText }]}>About Group Sessions</Text>
          </View>
          <Text style={[styles.infoText, { color: colors.secondaryText }]}>
            Group sessions use the 3/3rds format used in disciple-making movements worldwide:
          </Text>
          <View style={styles.infoList}>
            <Text style={[styles.infoItem, { color: colors.secondaryText }]}>
              <Text style={[styles.infoItemBold, { color: colors.primaryText }]}>1. Look Back</Text> - How did you obey? Who did you share with?
            </Text>
            <Text style={[styles.infoItem, { color: colors.secondaryText }]}>
              <Text style={[styles.infoItemBold, { color: colors.primaryText }]}>2. Look Up</Text> - Read Scripture together and discuss
            </Text>
            <Text style={[styles.infoItem, { color: colors.secondaryText }]}>
              <Text style={[styles.infoItemBold, { color: colors.primaryText }]}>3. Look Forward</Text> - How will you obey? Who will you tell?
            </Text>
          </View>
        </View>

        {/* Leave Group */}
        {isLocalGroup && userId ? (
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={handleLeaveGroup}
          >
            <Ionicons name="exit-outline" size={20} color={colors.error} />
            <Text style={[styles.leaveButtonText, { color: colors.error }]}>Leave Group</Text>
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
  moreButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
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
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 20,
  },
  codeCardLeft: {},
  codeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
  codeCardRight: {
    alignItems: 'center',
    gap: 4,
  },
  shareText: {
    fontSize: 12,
    fontWeight: '500',
  },
  currentCard: {
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
  },
  currentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fieldBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 12,
  },
  currentTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  currentLesson: {
    fontSize: 14,
    marginBottom: 16,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 14,
    gap: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  readOnlyCard: {
    borderRadius: radius.lg,
    padding: 14,
    gap: 8,
  },
  readOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readOnlyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  readOnlyBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInitial: {
    fontSize: 18,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  leaderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  leaderBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  memberJoined: {
    fontSize: 12,
  },
  infoCard: {
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoItemBold: {
    fontWeight: '600',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  leaveButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
