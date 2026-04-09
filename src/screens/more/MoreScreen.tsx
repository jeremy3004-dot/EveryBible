import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { config } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import type { MoreStackParamList } from '../../navigation/types';
import { layout, radius, spacing, typography } from '../../design/system';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

type MenuItem = {
  id: string;
  titleKey?: string;
  title?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  screen?: keyof MoreStackParamList;
  action?: () => void;
};

const menuItems: MenuItem[] = [
  { id: 'profile', titleKey: 'more.profile', icon: 'person-outline', screen: 'Profile' },
  {
    id: 'readingActivity',
    titleKey: 'more.readingActivity',
    icon: 'calendar-outline',
    screen: 'ReadingActivity',
  },
  {
    id: 'annotations',
    titleKey: 'annotations.title',
    icon: 'bookmarks-outline',
    screen: 'Annotations',
  },
  { id: 'settings', titleKey: 'more.settings', icon: 'settings-outline', screen: 'Settings' },
  {
    id: 'translations',
    titleKey: 'translations.title',
    icon: 'book-outline',
    screen: 'TranslationBrowser',
  },
  { id: 'about', titleKey: 'more.about', icon: 'information-circle-outline', screen: 'About' },
];

export function MoreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const signOut = useAuthStore((state) => state.signOut);

  const handleMenuPress = (item: MenuItem) => {
    if (item.screen) {
      navigation.navigate(item.screen);
    } else if (item.action) {
      item.action();
    }
  };

  const handleSignIn = () => {
    navigation.navigate('Auth');
  };

  const handleSignOut = () => {
    Alert.alert(
      t('more.signOut'),
      t('more.signOutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('more.signOut'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch {
              // Sign-out failure is non-fatal; the user stays signed in
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>{t('more.title')}</Text>

        {/* User Profile Card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={[styles.avatar, { backgroundColor: colors.cardBorder }]}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={32} color={colors.secondaryText} />
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.primaryText }]}>
              {isAuthenticated && user?.displayName ? user.displayName : t('more.guestUser')}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>
              {isAuthenticated && user?.email ? user.email : t('more.signInToSync')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </TouchableOpacity>

        {/* Auth Buttons */}
        {!isAuthenticated ? (
          <TouchableOpacity style={[styles.signInButton, { backgroundColor: colors.accentGreen }]} onPress={handleSignIn}>
            <Text style={[styles.signInText, { color: colors.onAccent }]}>
              {t('more.signInOrCreate')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.signOutButton, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>{t('more.signOut')}</Text>
          </TouchableOpacity>
        )}

        {/* Menu Items */}
        <View style={[styles.menuSection, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                { borderBottomColor: colors.cardBorder },
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={() => handleMenuPress(item)}
            >
              <Ionicons name={item.icon} size={24} color={colors.secondaryText} />
              <Text style={[styles.menuItemText, { color: colors.primaryText }]}>
                {item.title ?? (item.titleKey ? t(item.titleKey) : '')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          ))}
        </View>

        {/* App Version */}
        <Text style={[styles.version, { color: colors.secondaryText }]}>
          {t('about.version', { version: config.version })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: layout.screenPadding,
  },
  title: {
    ...typography.pageTitle,
    marginBottom: layout.sectionGap,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: layout.cardPadding,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.cardTitle,
    marginBottom: spacing.xs,
  },
  profileEmail: {
    ...typography.micro,
  },
  signInButton: {
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: layout.sectionGap,
  },
  signInText: {
    ...typography.button,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: layout.sectionGap,
    borderWidth: 1,
    gap: spacing.sm,
  },
  signOutText: {
    ...typography.button,
  },
  menuSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: layout.sectionGap,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    flex: 1,
    ...typography.bodyStrong,
    marginLeft: spacing.md,
  },
  version: {
    ...typography.micro,
    textAlign: 'center',
  },
});
