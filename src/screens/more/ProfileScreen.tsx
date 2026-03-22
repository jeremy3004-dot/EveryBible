import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { useProgressStore } from '../../stores/progressStore';
import type { MoreStackParamList } from '../../navigation/types';
import { layout, radius, spacing, typography } from '../../design/system';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const chaptersRead = useProgressStore((state) => Object.keys(state.chaptersRead).length);
  const streakDays = useProgressStore((state) => state.streakDays);

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
          <View style={styles.avatar}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={48} color={colors.secondaryText} />
            )}
          </View>
          <Text style={styles.userName}>
            {isAuthenticated && user?.displayName ? user.displayName : t('more.guestUser')}
          </Text>
          <Text style={styles.userEmail}>
            {isAuthenticated && user?.email ? user.email : t('more.signInToSync')}
          </Text>
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
    avatar: {
      width: 100,
      height: 100,
      borderRadius: radius.pill,
      backgroundColor: colors.cardBackground,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    avatarImage: {
      width: 100,
      height: 100,
      borderRadius: radius.pill,
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
