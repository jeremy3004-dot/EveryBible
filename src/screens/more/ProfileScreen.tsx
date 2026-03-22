import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { uploadAvatar } from '../../services/storage/storageService';
import { getEngagementSummary } from '../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../services/supabase/types';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { useProgressStore } from '../../stores/progressStore';
import type { MoreStackParamList } from '../../navigation/types';
import { layout, radius, spacing, typography } from '../../design/system';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

// Format listening minutes as "Xh Ym" for long durations or "Xm" for short.
const formatListeningTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const chaptersRead = useProgressStore((state) => Object.keys(state.chaptersRead).length);
  const streakDays = useProgressStore((state) => state.streakDays);

  const [avatarUri, setAvatarUri] = useState<string | null>(user?.photoURL ?? null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [engagement, setEngagement] = useState<UserEngagementSummary | null>(null);

  // Fetch engagement summary once on mount when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getEngagementSummary()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setEngagement(result.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Keep local avatar in sync with auth store
  useEffect(() => {
    setAvatarUri(user?.photoURL ?? null);
  }, [user?.photoURL]);

  const handlePickAvatar = useCallback(async () => {
    if (!isAuthenticated) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const localUri = result.assets[0].uri;
    // Optimistically show the local image while uploading
    setAvatarUri(localUri);
    setIsUploadingAvatar(true);

    try {
      const uploadResult = await uploadAvatar(localUri);

      if (!uploadResult.success || !uploadResult.data) {
        // Revert to previous avatar on failure
        setAvatarUri(user?.photoURL ?? null);
        Alert.alert(t('common.error'), t('profile.avatarUpdateFailed'));
        return;
      }

      const publicUrl = uploadResult.data;

      // Persist the new URL to Supabase auth user metadata so it survives re-login
      const { data: updateData } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (updateData?.user) {
        setUser({
          ...user!,
          photoURL: publicUrl,
        });
      }

      setAvatarUri(publicUrl);
    } catch {
      setAvatarUri(user?.photoURL ?? null);
      Alert.alert(t('common.error'), t('profile.avatarUpdateFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [isAuthenticated, user, setUser, t]);

  const handleSignIn = () => {
    navigation.navigate('Auth');
  };

  const handleReadingActivity = () => {
    navigation.navigate('ReadingActivity');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('more.profile')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={handlePickAvatar}
            disabled={!isAuthenticated || isUploadingAvatar}
            accessibilityLabel={t('profile.changeAvatar')}
            accessibilityRole="button"
          >
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={48} color={colors.secondaryText} />
              )}
              {isUploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color={colors.primaryText} />
                </View>
              )}
            </View>
            {isAuthenticated && (
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={12} color={colors.background} />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.userName}>
            {isAuthenticated && user?.displayName ? user.displayName : t('more.guestUser')}
          </Text>
          <Text style={styles.userEmail}>
            {isAuthenticated && user?.email ? user.email : t('more.signInToSync')}
          </Text>
          {isAuthenticated && isUploadingAvatar && (
            <Text style={styles.uploadingLabel}>{t('profile.uploadingAvatar')}</Text>
          )}
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{chaptersRead}</Text>
              <Text style={styles.statLabel}>{t('home.chaptersRead')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{streakDays}</Text>
              <Text style={styles.statLabel}>{t('profile.streak')}</Text>
            </View>
          </View>
        </View>

        {isAuthenticated && engagement && (
          <View style={styles.engagementCard}>
            <View style={styles.engagementHeader}>
              <Text style={styles.engagementTitle}>{t('engagement.title')}</Text>
              <View style={styles.scorePill}>
                <Text style={styles.scoreValue}>{engagement.engagement_score}</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {formatListeningTime(engagement.total_listening_minutes)}
                </Text>
                <Text style={styles.statLabel}>{t('engagement.listeningTime')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{engagement.plans_completed}</Text>
                <Text style={styles.statLabel}>{t('engagement.plansCompleted')}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{engagement.longest_streak_days}</Text>
                <Text style={styles.statLabel}>{t('engagement.longestStreak')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{engagement.annotations_created}</Text>
                <Text style={styles.statLabel}>{t('engagement.annotationsCreated')}</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.activityCard} onPress={handleReadingActivity}>
          <View style={styles.activityIcon}>
            <Ionicons name="calendar-outline" size={24} color={colors.accentPrimary} />
          </View>
          <View style={styles.activityCopy}>
            <Text style={styles.activityTitle}>{t('profile.readingActivity')}</Text>
            <Text style={styles.activityDescription}>{t('profile.readingActivitySubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </TouchableOpacity>

        {!isAuthenticated && (
          <View style={styles.signInCard}>
            <Ionicons name="cloud-outline" size={48} color={colors.accentPrimary} />
            <Text style={styles.signInTitle}>{t('more.signInOrCreate')}</Text>
            <Text style={styles.signInDescription}>
              {t('auth.signInSubtitle')}
            </Text>
            <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
              <Text style={styles.signInButtonText}>{t('auth.signIn')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: layout.screenPadding,
      gap: layout.sectionGap,
    },
    avatarSection: {
      alignItems: 'center',
      gap: 4,
    },
    avatarTouchable: {
      marginBottom: spacing.md,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: radius.pill,
      backgroundColor: colors.cardBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    avatarImage: {
      width: 100,
      height: 100,
      borderRadius: radius.pill,
    },
    avatarOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background + 'AA',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.accentPrimary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    uploadingLabel: {
      ...typography.micro,
      color: colors.secondaryText,
      marginTop: spacing.xs,
    },
    userName: {
      ...typography.sectionTitle,
      color: colors.primaryText,
    },
    userEmail: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    statsCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    engagementCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      gap: spacing.lg,
    },
    engagementHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    engagementTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    scorePill: {
      backgroundColor: colors.accentPrimary + '1F',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    scoreValue: {
      ...typography.label,
      color: colors.accentPrimary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.cardBorder,
      marginVertical: spacing.xs,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.lg,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    statNumber: {
      ...typography.screenTitle,
      fontSize: 30,
      lineHeight: 34,
      color: colors.primaryText,
      marginBottom: spacing.xs,
    },
    statLabel: {
      ...typography.micro,
      color: colors.secondaryText,
      textAlign: 'center',
    },
    activityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.denseCardPadding,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    activityIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.accentPrimary + '14',
    },
    activityCopy: {
      flex: 1,
      gap: spacing.xs,
    },
    activityTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    activityDescription: {
      ...typography.micro,
      lineHeight: 18,
      color: colors.secondaryText,
    },
    signInCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    signInTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    signInDescription: {
      ...typography.body,
      color: colors.secondaryText,
      textAlign: 'center',
      marginBottom: layout.cardGap,
    },
    signInButton: {
      backgroundColor: colors.accentPrimary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: radius.md,
    },
    signInButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
  });
