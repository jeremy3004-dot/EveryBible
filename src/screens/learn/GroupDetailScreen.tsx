import React from 'react';
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
import { colors } from '../../constants';
import type { LearnStackParamList } from '../../navigation/types';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { useAuthStore } from '../../stores/authStore';
import { fourFieldsCourses, fieldInfo } from '../../data/fourFieldsCourses';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;
type ScreenRouteProp = RouteProp<LearnStackParamList, 'GroupDetail'>;

export function GroupDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId } = route.params;

  const { getGroup, leaveGroup, getGroupProgress } = useFourFieldsStore();
  const user = useAuthStore((state) => state.user);
  const userId = user?.uid || 'anonymous';

  const group = getGroup(groupId);
  const groupProgress = getGroupProgress(groupId);

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

  const currentMember = group.members.find((m) => m.id === userId);
  const isLeader = currentMember?.role === 'leader';
  const currentCourse = fourFieldsCourses.find(
    (c) => c.id === group.currentCourseId
  );
  const currentLesson = currentCourse?.lessons.find(
    (l) => l.id === group.currentLessonId
  );
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
    Alert.alert(
      isLeader ? 'Leave Group' : 'Leave Group',
      isLeader
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

  const completedCount = groupProgress?.completedLessons.length || 0;

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
        <Text style={styles.headerTitle}>{group.name}</Text>
        <TouchableOpacity style={styles.moreButton} onPress={handleShareCode}>
          <Ionicons name="share-outline" size={24} color={colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Join Code Card */}
        <TouchableOpacity style={styles.codeCard} onPress={handleShareCode}>
          <View style={styles.codeCardLeft}>
            <Text style={styles.codeLabel}>Join Code</Text>
            <Text style={styles.codeValue}>{group.joinCode}</Text>
          </View>
          <View style={styles.codeCardRight}>
            <Ionicons name="share-social-outline" size={20} color={colors.accentGreen} />
            <Text style={styles.shareText}>Share</Text>
          </View>
        </TouchableOpacity>

        {/* Current Lesson Card */}
        {currentCourse && currentLesson && currentFieldInfo && (
          <View style={styles.currentCard}>
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
              <Text style={styles.progressText}>
                {completedCount} lessons completed
              </Text>
            </View>
            <Text style={styles.currentTitle}>{currentCourse.title}</Text>
            <Text style={styles.currentLesson}>
              Next: {currentLesson.title}
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartSession}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.startButtonText}>Start Group Session</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Members Section */}
        <Text style={styles.sectionTitle}>
          Members ({group.members.length})
        </Text>
        {group.members.map((member) => {
          const isCurrentUser = member.id === userId;
          return (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberInitial}>
                  {member.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>
                    {member.name}
                    {isCurrentUser && ' (you)'}
                  </Text>
                  {member.role === 'leader' && (
                    <View style={styles.leaderBadge}>
                      <Text style={styles.leaderBadgeText}>Leader</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberJoined}>
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          );
        })}

        {/* About the 3/3rds Format */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={20} color={colors.accentGreen} />
            <Text style={styles.infoTitle}>About Group Sessions</Text>
          </View>
          <Text style={styles.infoText}>
            Group sessions use the 3/3rds format used in disciple-making movements worldwide:
          </Text>
          <View style={styles.infoList}>
            <Text style={styles.infoItem}>
              <Text style={styles.infoItemBold}>1. Look Back</Text> - How did you obey? Who did you share with?
            </Text>
            <Text style={styles.infoItem}>
              <Text style={styles.infoItemBold}>2. Look Up</Text> - Read Scripture together and discuss
            </Text>
            <Text style={styles.infoItem}>
              <Text style={styles.infoItemBold}>3. Look Forward</Text> - How will you obey? Who will you tell?
            </Text>
          </View>
        </View>

        {/* Leave Group */}
        <TouchableOpacity
          style={styles.leaveButton}
          onPress={handleLeaveGroup}
        >
          <Ionicons name="exit-outline" size={20} color={colors.error} />
          <Text style={styles.leaveButtonText}>Leave Group</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primaryText,
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
    color: colors.secondaryText,
    marginBottom: 12,
  },
  errorLink: {
    fontSize: 16,
    color: colors.accentGreen,
    fontWeight: '500',
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  codeCardLeft: {},
  codeLabel: {
    fontSize: 12,
    color: colors.secondaryText,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryText,
    letterSpacing: 2,
  },
  codeCardRight: {
    alignItems: 'center',
    gap: 4,
  },
  shareText: {
    fontSize: 12,
    color: colors.accentGreen,
    fontWeight: '500',
  },
  currentCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
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
    borderRadius: 8,
  },
  fieldBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  currentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  currentLesson: {
    fontSize: 14,
    color: colors.secondaryText,
    marginBottom: 16,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentGreen + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accentGreen,
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
    color: colors.primaryText,
  },
  leaderBadge: {
    backgroundColor: colors.accentGreen + '30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leaderBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accentGreen,
    textTransform: 'uppercase',
  },
  memberJoined: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  infoCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
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
    color: colors.primaryText,
  },
  infoText: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
    marginBottom: 12,
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
  },
  infoItemBold: {
    fontWeight: '600',
    color: colors.primaryText,
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
    color: colors.error,
    fontWeight: '500',
  },
});
