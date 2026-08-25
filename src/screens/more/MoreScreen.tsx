import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { config } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import type { MoreStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { layout, spacing, typography } from '../../design/system';
import { serifFamily } from '../../design/fonts';
import { AppButton, AppCard, Avatar, ListRow } from '../../components/ui';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

type MenuItem = {
  id: string;
  titleKey?: string;
  title?: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen?: keyof MoreStackParamList;
  action?: () => void;
};

type MenuGroup = {
  id: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    id: 'account',
    items: [
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
    ],
  },
  {
    id: 'content',
    items: [
      {
        id: 'translations',
        titleKey: 'translations.title',
        icon: 'book-outline',
        screen: 'TranslationBrowser',
      },
    ],
  },
  {
    id: 'app',
    items: [
      { id: 'settings', titleKey: 'more.settings', icon: 'settings-outline', screen: 'Settings' },
      { id: 'about', titleKey: 'more.about', icon: 'information-circle-outline', screen: 'About' },
    ],
  },
];

export function MoreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const signOut = useAuthStore((state) => state.signOut);

  const displayName = isAuthenticated && user?.displayName ? user.displayName : t('more.guestUser');
  const profileSubtitle = isAuthenticated && user?.email ? user.email : t('more.signInToSync');

  const handleMenuPress = (item: MenuItem) => {
    if (item.screen) {
      navigation.navigate(item.screen);
    } else if (item.action) {
      item.action();
    }
  };

  const handleSignIn = () => {
    openAuthFlow('signIn');
  };

  const handleSignOut = () => {
    Alert.alert(t('more.signOut'), t('more.signOutConfirm'), [
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
    ]);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, displayFont.bold, { color: colors.primaryText }]}>{t('more.title')}</Text>

        {/* Profile card */}
        <AppCard
          pressable
          onPress={() => navigation.navigate('Profile')}
          style={styles.profileCard}
          accessibilityLabel={displayName}
        >
          <View style={styles.profileRow}>
            <Avatar name={displayName} imageUri={user?.photoURL ?? null} size={56} />
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.primaryText }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text
                style={[styles.profileEmail, { color: colors.secondaryText }]}
                numberOfLines={1}
              >
                {profileSubtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </View>
        </AppCard>

        {!isAuthenticated ? (
          <AppButton
            label={t('more.syncYourProgress')}
            onPress={handleSignIn}
            style={styles.authButton}
          />
        ) : null}

        {/* Grouped menu — visually separated cards */}
        {menuGroups.map((group) => (
          <View key={group.id} style={styles.group}>
            <AppCard padding={0} style={styles.groupCard}>
              {group.items.map((item, index) => (
                <ListRow
                  key={item.id}
                  title={
                    item.titleKey ? t(item.titleKey as Parameters<typeof t>[0]) : (item.title ?? '')
                  }
                  leadingIcon={item.icon}
                  showChevron
                  onPress={() => handleMenuPress(item)}
                  isLast={index === group.items.length - 1}
                />
              ))}
            </AppCard>
          </View>
        ))}

        {/* Sign out */}
        {isAuthenticated ? (
          <AppCard padding={0} style={styles.groupCard}>
            <ListRow
              title={t('more.signOut')}
              leadingIcon="log-out-outline"
              destructive
              isLast
              onPress={handleSignOut}
            />
          </AppCard>
        ) : null}

        {/* Footer wordmark */}
        <View style={styles.footer}>
          <Text style={[styles.wordmark, { color: colors.textTertiary }]}>EveryBible</Text>
          <Text style={[styles.version, { color: colors.textTertiary }]}>
            {t('about.version', { version: config.version })}
          </Text>
        </View>
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
    marginBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: serifFamily(600),
    fontSize: 20,
    lineHeight: 26,
    marginBottom: spacing.xs,
  },
  profileEmail: {
    ...typography.micro,
  },
  authButton: {
    marginBottom: spacing.lg,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupCard: {
    paddingHorizontal: spacing.lg,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  wordmark: {
    fontFamily: serifFamily(400, true),
    fontSize: 18,
  },
  version: {
    ...typography.micro,
    textAlign: 'center',
  },
});
