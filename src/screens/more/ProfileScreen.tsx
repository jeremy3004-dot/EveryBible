import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { updateUserProfile } from '../../services/auth';
import { uploadAvatar } from '../../services/storage/storageService';
import { withPrivacyLockGrace } from '../../services/privacy/privacyLockGrace';
import { totalListeningMinutes } from '../../services/progress/listeningTime';
import { getEngagementSummary, refreshEngagement } from '../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../services/supabase/types';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { selectCurrentStreakDays, useProgressStore } from '../../stores/progressStore';
import type { MoreStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { layout, radius, spacing, typography } from '../../design/system';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { formatListeningTime } from '../../i18n/interfaceFormatting';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Pushed inside the More tab stack: the floating tab capsule (and the Android
  // navigation bar under it) overlaps the end of this scroll.
  const { contentClearance } = useTabBarHeight();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const chaptersRead = useProgressStore((state) => Object.keys(state.chaptersRead).length);
  const streakDays = useProgressStore(selectCurrentStreakDays);
  const listeningMsByDate = useProgressStore((state) => state.listeningMsByDate);

  const [avatarUri, setAvatarUri] = useState<string | null>(user?.photoURL ?? null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  // The button only disables once an upload starts; a second tap while the system
  // picker is still opening must not launch another one.
  const isPickingAvatarRef = useRef(false);
  const [engagement, setEngagement] = useState<UserEngagementSummary | null>(null);
  // Listening is banked on this device as it plays, and the cloud summary lags it
  // until queued events upload: show the larger, as Reading activity does.
  const listeningMinutes = useMemo(
    () => totalListeningMinutes(listeningMsByDate, engagement?.total_listening_minutes),
    [engagement?.total_listening_minutes, listeningMsByDate]
  );

  // Refresh then fetch engagement summary once on mount when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    // Fire-and-forget refresh so the summary row is up-to-date before we read it
    refreshEngagement()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        return getEngagementSummary();
      })
      .then((result) => {
        if (!cancelled && result?.success && result.data) {
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
    if (!isAuthenticated || isPickingAvatarRef.current) return;

    let result: ImagePicker.ImagePickerResult;
    isPickingAvatarRef.current = true;
    try {
      // The system photo picker can turn the app inactive; that must not lock discreet mode.
      result = await withPrivacyLockGrace(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      );
    } catch {
      Alert.alert(t('common.error'), t('profile.avatarUpdateFailed'));
      return;
    } finally {
      isPickingAvatarRef.current = false;
    }

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

      // Persist the new URL through the auth service so the update goes through
      // the shared error-mapping layer instead of a raw Supabase call (L17).
      const updateResult = await updateUserProfile({ data: { avatar_url: publicUrl } });

      if (!updateResult.success) {
        setAvatarUri(user?.photoURL ?? null);
        Alert.alert(t('common.error'), t('profile.avatarUpdateFailed'));
        return;
      }

      setUser(
        updateResult.user ?? {
          ...user!,
          photoURL: publicUrl,
        }
      );

      setAvatarUri(publicUrl);
    } catch {
      setAvatarUri(user?.photoURL ?? null);
      Alert.alert(t('common.error'), t('profile.avatarUpdateFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [isAuthenticated, user, setUser, t]);

  // Email sign-up stores no display name: such an account is named by its email
  // (shown once), never as a guest.
  const accountName = user?.displayName?.trim() || null;
  const userName = isAuthenticated
    ? (accountName ?? user?.email ?? t('more.guestUser'))
    : t('more.guestUser');
  const userSubtitle = !isAuthenticated
    ? t('more.signInToSync')
    : accountName
      ? (user?.email ?? null)
      : null;

  const handleSignIn = () => {
    openAuthFlow('signIn');
  };

  const handleReadingActivity = () => {
    navigation.navigate('ReadingActivity');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {t('more.profile')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
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
                <Image
                  source={{ uri: avatarUri }}
                  // Offline or an expired provider link: the placeholder, not an empty circle.
                  onError={() => setAvatarUri(null)}
                  style={styles.avatarImage}
                />
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

          <Text style={styles.userName}>{userName}</Text>
          {userSubtitle ? <Text style={styles.userEmail}>{userSubtitle}</Text> : null}
          {isAuthenticated && isUploadingAvatar && (
            <Text style={styles.uploadingLabel}>{t('profile.uploadingAvatar')}</Text>
          )}
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                {chaptersRead}
              </Text>
              <Text style={styles.statLabel}>{t('home.chaptersRead')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                {streakDays}
              </Text>
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
                <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                  {formatListeningTime(listeningMinutes, t)}
                </Text>
                <Text style={styles.statLabel}>{t('engagement.listeningTime')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                  {engagement.plans_completed}
                </Text>
                <Text style={styles.statLabel}>{t('engagement.plansCompleted')}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                  {engagement.longest_streak_days}
                </Text>
                <Text style={styles.statLabel}>{t('engagement.longestStreak')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.statNumber}>
                  {engagement.annotations_created}
                </Text>
                <Text style={styles.statLabel}>{t('engagement.annotationsCreated')}</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.activityCard}
          onPress={handleReadingActivity}
          accessibilityRole="button"
        >
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
            <Text style={styles.signInTitle}>{t('more.syncYourProgress')}</Text>
            <Text style={styles.signInDescription}>{t('auth.signInSubtitle')}</Text>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={handleSignIn}
              accessibilityRole="button"
            >
              <Text style={styles.signInButtonText}>{t('more.signInOrCreate')}</Text>
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
      color: colors.onAccent,
    },
  });
