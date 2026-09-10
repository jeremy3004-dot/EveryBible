import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BookOpen,
  Bookmark,
  Calendar,
  ChevronRight,
  Info,
  Languages,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont, useTabBarHeight } from '../../hooks';
import { config } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useProgressStore } from '../../stores/progressStore';
import { useAnnotationStore } from '../../stores/annotationStore';
import type { MoreStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { layout, spacing, typography } from '../../design/system';
import { describeSyncStatus } from '../../utils/syncStatus';
import { AppCard, ListRow, PressableScale } from '../../components/ui';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

const AVATAR_SIZE = 48;
const SYNC_DOT_SIZE = 6;
const CHEVRON_SIZE = 18;
const ICON_STROKE = 2;

type MenuItem = {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  screen: keyof MoreStackParamList;
  value?: string;
};

type MenuGroup = {
  id: string;
  eyebrowKey: string;
  items: MenuItem[];
};

// The build number only exists in a real native binary; keep the require lazy so
// importing this screen stays side-effect-free in tests.
function getBuildNumber(): string | null {
  try {
    const Constants = require('expo-constants').default as {
      nativeBuildVersion?: string | null;
      expoConfig?: { ios?: { buildNumber?: string | null } } | null;
    };
    return Constants?.nativeBuildVersion ?? Constants?.expoConfig?.ios?.buildNumber ?? null;
  } catch {
    return null;
  }
}

export function MoreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { contentClearance } = useTabBarHeight();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const preferences = useAuthStore((state) => state.preferences);
  const preferencesUpdatedAt = useAuthStore((state) => state.preferencesUpdatedAt);
  const signOut = useAuthStore((state) => state.signOut);
  const streakDays = useProgressStore((state) => state.streakDays);
  const annotations = useAnnotationStore((state) => state.annotations);
  const translations = useBibleStore((state) => state.translations);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);

  const displayName = isAuthenticated && user?.displayName ? user.displayName : t('more.guestUser');
  const email = isAuthenticated && user?.email ? user.email : null;
  const initials = useMemo(() => initialsFrom(displayName), [displayName]);

  const syncStatus = describeSyncStatus({
    isAuthenticated,
    lastSyncedAt: preferencesUpdatedAt,
    t,
  });

  // Right-hand row values are metadata, not decoration: each one answers the
  // question the row would otherwise make you tap to find out.
  const annotationCount = annotations.filter((annotation) => !annotation.deleted_at).length;
  const offlineCount = translations.filter((translation) => translation.isDownloaded).length;
  const currentAbbreviation =
    translations.find((translation) => translation.id === currentTranslation)?.abbreviation ??
    currentTranslation;
  const localeValue =
    [preferences.countryName, preferences.contentLanguageNativeName].filter(Boolean).join(' · ') ||
    undefined;
  const reminderValue =
    preferences.notificationsEnabled && preferences.reminderTime
      ? t('more.reminderValue', { time: preferences.reminderTime })
      : undefined;

  const menuGroups: MenuGroup[] = [
    {
      id: 'account',
      eyebrowKey: 'more.groupAccount',
      items: [
        { id: 'profile', titleKey: 'more.profile', icon: User, screen: 'Profile' },
        {
          id: 'readingActivity',
          titleKey: 'more.readingActivity',
          icon: Calendar,
          screen: 'ReadingActivity',
          value: streakDays > 0 ? t('more.streakValue', { count: streakDays }) : undefined,
        },
        {
          id: 'annotations',
          titleKey: 'more.highlightsAndNotes',
          icon: Bookmark,
          screen: 'Annotations',
          value: annotationCount > 0 ? String(annotationCount) : undefined,
        },
      ],
    },
    {
      id: 'content',
      eyebrowKey: 'more.groupContent',
      items: [
        {
          id: 'translations',
          titleKey: 'more.translations',
          icon: BookOpen,
          screen: 'TranslationBrowser',
          value: t('more.translationsValue', {
            abbreviation: currentAbbreviation,
            count: offlineCount,
          }),
        },
        {
          id: 'locale',
          titleKey: 'settings.nationAndLanguage',
          icon: Languages,
          screen: 'LocalePreferences',
          value: localeValue,
        },
      ],
    },
    {
      id: 'app',
      eyebrowKey: 'more.groupApp',
      items: [
        {
          id: 'settings',
          titleKey: 'more.settings',
          icon: Settings,
          screen: 'Settings',
          value: reminderValue,
        },
        { id: 'about', titleKey: 'more.about', icon: Info, screen: 'About' },
      ],
    },
  ];

  const buildNumber = getBuildNumber();
  const versionLabel = t('more.footerVersion', {
    version: buildNumber ? `${config.version} (${buildNumber})` : config.version,
  });

  const handleAccountPress = () => {
    if (isAuthenticated) {
      navigation.navigate('Profile');
      return;
    }
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
        <Text style={[styles.title, displayFont.bold, { color: colors.primaryText }]}>
          {t('more.title')}
        </Text>

        {/* Account — identity, address, and whether the cloud has caught up. */}
        <AppCard
          pressable
          onPress={handleAccountPress}
          padding={layout.cardPaddingWide}
          style={styles.accountCard}
          accessibilityLabel={displayName}
        >
          <View style={styles.accountRow}>
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                style={styles.avatar}
                accessibilityIgnoresInvertColors
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.accentSurface }]}>
                <Text
                  style={[
                    styles.avatarInitials,
                    displayFont.bold,
                    { color: colors.onAccentSurface },
                  ]}
                >
                  {initials}
                </Text>
              </View>
            )}
            <View style={styles.accountInfo}>
              <Text style={[styles.accountName, { color: colors.primaryText }]} numberOfLines={1}>
                {displayName}
              </Text>
              {email ? (
                <Text
                  style={[styles.accountEmail, { color: colors.secondaryText }]}
                  numberOfLines={1}
                >
                  {email}
                </Text>
              ) : null}
              <View style={styles.syncRow}>
                {syncStatus.isSynced ? (
                  <View style={[styles.syncDot, { backgroundColor: colors.success }]} />
                ) : null}
                <Text
                  style={[styles.syncLabel, displayFont.regular, { color: colors.secondaryText }]}
                  numberOfLines={1}
                >
                  {syncStatus.label}
                </Text>
              </View>
            </View>
            <ChevronRight
              size={CHEVRON_SIZE}
              color={colors.textTertiary}
              strokeWidth={ICON_STROKE}
            />
          </View>
        </AppCard>

        {menuGroups.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text
              style={[styles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}
            >
              {t(group.eyebrowKey as Parameters<typeof t>[0])}
            </Text>
            <AppCard padding={0} style={styles.groupCard}>
              {group.items.map((item, index) => (
                <React.Fragment key={item.id}>
                  {index > 0 ? (
                    <View style={[styles.rowSeparator, { backgroundColor: colors.borderStrong }]} />
                  ) : null}
                  {/* ListRow insets its own separator past the leading glyph; the
                      design runs the rule the full width of the card, so the
                      rows are drawn as last and the rule is drawn here. */}
                  <ListRow
                    title={t(item.titleKey as Parameters<typeof t>[0])}
                    leadingIcon={item.icon}
                    value={item.value}
                    titleWeight="500"
                    showChevron
                    onPress={() => navigation.navigate(item.screen)}
                    isLast
                  />
                </React.Fragment>
              ))}
            </AppCard>
          </View>
        ))}

        {/* Footer: the destructive action and the build stamp share one line. */}
        <View style={styles.footer}>
          {isAuthenticated ? (
            <PressableScale
              onPress={handleSignOut}
              pressEffect="translate"
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={t('more.signOut')}
              hitSlop={8}
            >
              <Text style={[styles.signOut, { color: colors.error }]}>{t('more.signOut')}</Text>
            </PressableScale>
          ) : (
            <View />
          )}
          <Text
            style={[styles.version, displayFont.regular, { color: colors.textTertiary }]}
            numberOfLines={2}
          >
            {versionLabel}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  title: {
    ...typography.displayHero,
    marginBottom: spacing.xl,
  },
  accountCard: {
    marginBottom: spacing.xl,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitials: {
    ...typography.sectionHeading,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: 0,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 21,
  },
  accountEmail: {
    ...typography.captionStrong,
    fontWeight: '400',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  syncDot: {
    width: SYNC_DOT_SIZE,
    height: SYNC_DOT_SIZE,
    borderRadius: SYNC_DOT_SIZE / 2,
  },
  syncLabel: {
    ...typography.eyebrow,
    flexShrink: 1,
  },
  group: {
    marginBottom: spacing.xl,
  },
  groupEyebrow: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
  },
  groupCard: {
    paddingHorizontal: layout.cardPadding,
  },
  rowSeparator: {
    height: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  signOut: {
    ...typography.captionStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  version: {
    ...typography.eyebrowPlain,
    flexShrink: 1,
    textAlign: 'right',
  },
});
