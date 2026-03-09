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
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      gap: 24,
    },
    avatarSection: {
      alignItems: 'center',
      gap: 4,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.cardBackground,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
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
    },
    userEmail: {
      fontSize: 14,
      color: colors.secondaryText,
    },
    statsCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
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
      backgroundColor: colors.accentPrimary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: 12,
    },
    signInButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primaryText,
    },
  });
