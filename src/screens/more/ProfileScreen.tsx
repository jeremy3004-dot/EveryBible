import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants';
import { useAuthStore } from '../../stores/authStore';
import { useProgressStore } from '../../stores/progressStore';
import type { MoreStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const chaptersRead = useProgressStore((state) => Object.keys(state.chaptersRead).length);
  const streakDays = useProgressStore((state) => state.streakDays);

  const handleSignIn = () => {
    navigation.navigate('Auth');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={48} color={colors.secondaryText} />
            )}
          </View>
          <Text style={styles.userName}>
            {isAuthenticated && user?.displayName ? user.displayName : 'Guest User'}
          </Text>
          <Text style={styles.userEmail}>
            {isAuthenticated && user?.email ? user.email : 'Not signed in'}
          </Text>
        </View>

        {/* Stats Section */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Reading Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{chaptersRead}</Text>
              <Text style={styles.statLabel}>Chapters Read</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{streakDays}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Courses Started</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Courses Completed</Text>
            </View>
          </View>
        </View>

        {/* Sign In Prompt (only for unauthenticated users) */}
        {!isAuthenticated && (
          <View style={styles.signInCard}>
            <Ionicons name="cloud-outline" size={48} color={colors.accentGreen} />
            <Text style={styles.signInTitle}>Sign in to sync</Text>
            <Text style={styles.signInDescription}>
              Your reading progress and course completions will be saved across all your devices.
            </Text>
            <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sync Status (for authenticated users) */}
        {isAuthenticated && (
          <View style={styles.syncCard}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <View style={styles.syncInfo}>
              <Text style={styles.syncTitle}>Synced to Cloud</Text>
              <Text style={styles.syncDescription}>
                Your progress is automatically saved across all your devices.
              </Text>
            </View>
          </View>
        )}
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
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.secondaryText,
  },
  statsCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  signInCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  signInTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primaryText,
    marginTop: 16,
    marginBottom: 8,
  },
  signInDescription: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  signInButton: {
    backgroundColor: colors.accentGreen,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryText,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 12,
  },
  syncInfo: {
    flex: 1,
  },
  syncTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryText,
    marginBottom: 4,
  },
  syncDescription: {
    fontSize: 14,
    color: colors.secondaryText,
  },
});
