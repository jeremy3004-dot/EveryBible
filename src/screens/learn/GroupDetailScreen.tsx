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
import { useTranslation } from 'react-i18next';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { useAuthStore } from '../../stores/authStore';
import { fourFieldsCourses, fieldInfo, FIELD_TITLE_KEYS } from '../../data/fourFieldsCourses';
import {
  buildGroupDetailSnapshot,
  getSyncedGroup,
  getSyncedGroupServiceAvailability,
  loadGroupDetailSnapshot,
} from '../../services/groups';
import { isSupabaseConfigured } from '../../services/supabase';
import type { GroupDetailSnapshot } from '../../services/groups/groupRepository';
import { listPrayerRequests } from '../../services/prayer/prayerService';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'GroupDetail'>;

export function GroupDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();

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

  const [prayerPreview, setPrayerPreview] = useState<{
    count: number;
    latestContent: string | null;
  } | null>(null);

  useEffect(() => {
    if (!syncFeatureEnabled || !backendConfigured || !isSignedIn) {
      return undefined;
    }

    let cancelled = false;

    listPrayerRequests(groupId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          const active = result.data.filter((r) => !r.is_answered);
          setPrayerPreview({
            count: active.length,
            latestContent: active[0]?.content ?? null,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [backendConfigured, groupId, isSignedIn, syncFeatureEnabled]);

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
      t('groups.leaveGroup'),
      group.isLeader
        ? t('groups.leaveGroupLeaderMessage')
        : t('groups.leaveGroupMemberMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groups.leave'),
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
            <Text style={[styles.codeLabel, { color: colors.secondaryText }]}>{t('groups.joinCode')}</Text>
            <Text style={[styles.codeValue, { color: colors.primaryText }]}>{group.joinCode}</Text>
          </View>
          <View style={styles.codeCardRight}>
            <Ionicons name="share-social-outline" size={20} color={colors.accentGreen} />
            <Text style={[styles.shareText, { color: colors.accentGreen }]}>{t('groups.share')}</Text>
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
                  {t(FIELD_TITLE_KEYS[currentCourse.field])}
                </Text>
              </View>
              <Text style={[styles.progressText, { color: colors.secondaryText }]}>
                {completedCount === null
                  ? t('groups.syncedProgress')
                  : t('groups.lessonsCompleted', { count: completedCount })}
              </Text>
            </View>
            <Text style={[styles.currentTitle, { color: colors.primaryText }]}>{currentCourse.title}</Text>
            <Text style={[styles.currentLesson, { color: colors.secondaryText }]}>
              {t('groups.nextLesson', { title: currentLesson.title })}
            </Text>
            {canStartSession ? (
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: colors.accentGreen }]}
                onPress={handleStartSession}
              >
                <Ionicons name="play" size={20} color={colors.cardBackground} />
                <Text style={[styles.startButtonText, { color: colors.cardBackground }]}>
                  {isLocalGroup ? t('groups.startGroupSession') : t('groups.saveSyncedSession')}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.readOnlyCard, { backgroundColor: colors.background }]}>
                <View style={styles.readOnlyHeader}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.accentGreen} />
                  <Text style={[styles.readOnlyTitle, { color: colors.primaryText }]}>{t('groups.syncedGroupPreview')}</Text>
                </View>
                <Text style={[styles.readOnlyBody, { color: colors.secondaryText }]}>
                  {t('groups.syncedGroupPreviewBody')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Members Section */}
        <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
          {t('groups.members', { count: group.memberCount })}
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
                      {isCurrentUser && t('groups.you')}
                    </Text>
                    {member.role === 'leader' && (
                      <View style={[styles.leaderBadge, { backgroundColor: colors.accentGreen + '30' }]}>
                        <Text style={[styles.leaderBadgeText, { color: colors.accentGreen }]}>{t('groups.leader')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberJoined, { color: colors.secondaryText }]}>
                    {member.joinedAt == null
                      ? t('groups.joinedRecently')
                      : t('groups.joinedDate', { date: new Date(member.joinedAt).toLocaleDateString() })}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={[styles.readOnlyCard, { backgroundColor: colors.background }]}>
            <View style={styles.readOnlyHeader}>
              <Ionicons name="people-outline" size={18} color={colors.accentGreen} />
              <Text style={[styles.readOnlyTitle, { color: colors.primaryText }]}>{t('groups.readOnlySyncedMembership')}</Text>
            </View>
            <Text style={[styles.readOnlyBody, { color: colors.secondaryText }]}>
              {t('groups.readOnlySyncedMembershipBody')}
            </Text>
          </View>
        )}

        {/* Prayer Wall Card — only shown for synced groups (requires Supabase) */}
        {!isLocalGroup && prayerPreview !== null && (
          <TouchableOpacity
            style={[styles.prayerCard, { backgroundColor: colors.cardBackground }]}
            onPress={() =>
              navigation.navigate('PrayerWall', { groupId, groupName: group.name })
            }
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <View style={styles.prayerCardHeader}>
              <View style={styles.prayerCardLeft}>
                <Ionicons name="hand-left-outline" size={20} color={colors.accentGreen} />
                <Text style={[styles.prayerCardTitle, { color: colors.primaryText }]}>
                  Prayer Wall
                </Text>
              </View>
              <View style={styles.prayerCardRight}>
                {prayerPreview.count > 0 && (
                  <View style={[styles.prayerCountBadge, { backgroundColor: colors.accentGreen + '20' }]}>
                    <Text style={[styles.prayerCountText, { color: colors.accentGreen }]}>
                      {prayerPreview.count} active
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
              </View>
            </View>
            {prayerPreview.latestContent ? (
              <Text
                style={[styles.prayerPreviewText, { color: colors.secondaryText }]}
                numberOfLines={2}
              >
                {prayerPreview.latestContent}
              </Text>
            ) : (
              <Text style={[styles.prayerPreviewText, { color: colors.secondaryText }]}>
                No prayer requests yet. Be the first to share.
              </Text>
            )}
          </TouchableOpacity>
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
  prayerCard: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  prayerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prayerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prayerCardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  prayerCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prayerCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  prayerCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  prayerPreviewText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
