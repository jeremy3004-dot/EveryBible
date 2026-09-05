import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import {
  buildGroupRepositorySnapshot,
  listSyncedGroups,
  type SyncedGroup,
} from '../../services/groups';
import { isSupabaseConfigured } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useFourFieldsStore } from '../../stores/fourFieldsStore';
import { getGroupRolloutModel } from './groupRolloutModel';

type NavigationProp = NativeStackNavigationProp<LearnStackParamList>;

export function GroupListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const groups = useFourFieldsStore((state) => state.groups);
  const syncFeatureEnabled = config.features.studyGroupsSync;
  const backendConfigured = isSupabaseConfigured();
  const isSignedIn = Boolean(user);
  const groupRollout = getGroupRolloutModel({
    isSignedIn,
    localGroupCount: groups.length,
    syncFeatureEnabled,
    backendConfigured,
  });
  const syncRequestKey =
    syncFeatureEnabled && backendConfigured && isSignedIn ? (user?.uid ?? 'signed-in') : null;
  const [reloadKey, setReloadKey] = useState(0);
  const [remoteSyncState, setRemoteSyncState] = useState<{
    key: string | null;
    groups: SyncedGroup[];
    error: string | null;
  }>({
    key: null,
    groups: [],
    error: null,
  });
  // Fold the retry counter into the request identity so a retry (which bumps
  // reloadKey, not syncRequestKey) changes the token, making the derived loading
  // state re-show the spinner instead of the stale error card — no setState in
  // the effect required.
  const syncRequestToken = syncRequestKey === null ? null : `${syncRequestKey}:${reloadKey}`;
  const syncedGroups =
    syncRequestToken !== null && remoteSyncState.key === syncRequestToken
      ? remoteSyncState.groups
      : [];
  const syncLoadError =
    syncRequestToken !== null && remoteSyncState.key === syncRequestToken
      ? remoteSyncState.error
      : null;
  const isLoadingSynced = syncRequestToken !== null && remoteSyncState.key !== syncRequestToken;
  const repositorySnapshot = buildGroupRepositorySnapshot({
    localGroups: groups,
    syncFeatureEnabled,
    backendConfigured,
    signedIn: isSignedIn,
    syncedGroups,
  });

  useEffect(() => {
    let cancelled = false;

    if (!syncRequestToken) {
      return () => {
        cancelled = true;
      };
    }

    void listSyncedGroups()
      .then((nextGroups) => {
        if (cancelled) {
          return;
        }

        setRemoteSyncState({
          key: syncRequestToken,
          groups: nextGroups,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRemoteSyncState({
          key: syncRequestToken,
          groups: [],
          error: t('groups.unableToLoadGroup'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [syncRequestToken, t]);

  const handleRetrySync = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  const statusIconName =
    groupRollout.syncStatusKey === 'harvest.groupSyncReady'
      ? 'checkmark-circle-outline'
      : groupRollout.syncStatusKey === 'harvest.groupSyncSignin'
        ? 'person-outline'
        : 'cloud-offline-outline';
  const statusIconColor =
    groupRollout.syncStatusKey === 'harvest.groupSyncReady' ? colors.success : colors.accentPrimary;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('harvest.groupPreviewTitle')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accentSecondary + '16' }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.accentSecondary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroBadge, { color: colors.accentSecondary }]}>
                {t('harvest.groupPreviewBadge')}
              </Text>
              <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                {t('harvest.groupPreviewTitle')}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
            {t('harvest.groupPreviewBody')}
          </Text>

          <View
            style={[
              styles.statusCard,
              { backgroundColor: colors.background, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name={statusIconName} size={20} color={statusIconColor} />
            <Text style={[styles.statusText, { color: colors.primaryText }]}>
              {t(groupRollout.syncStatusKey)}
            </Text>
          </View>

          {!isSignedIn && backendConfigured ? (
            <TouchableOpacity
              style={[styles.authPromptButton, { backgroundColor: colors.accentPrimary }]}
              onPress={() => openAuthFlow('signIn')}
              activeOpacity={0.85}
            >
              <Text style={[styles.authPromptButtonText, { color: colors.onAccent }]}>
                {t('auth.signIn')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          style={[
            styles.localCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.localTitle, { color: colors.primaryText }]}>
            {t('harvest.localGroupsTitle')}
          </Text>
          <Text style={[styles.localBody, { color: colors.secondaryText }]}>
            {t('harvest.localGroupsDescription')}
          </Text>

          {repositorySnapshot.localGroups.length > 0 ? (
            <View style={styles.localList}>
              {repositorySnapshot.localGroups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupRow,
                    { backgroundColor: colors.background, borderColor: colors.cardBorder },
                  ]}
                  onPress={() => navigation.navigate('GroupDetail', { groupId: group.id })}
                  activeOpacity={0.85}
                >
                  <View
                    style={[styles.groupIcon, { backgroundColor: colors.accentPrimary + '16' }]}
                  >
                    <Ionicons name="people-outline" size={18} color={colors.accentPrimary} />
                  </View>
                  <View style={styles.groupCopy}>
                    <Text style={[styles.groupName, { color: colors.primaryText }]}>
                      {group.name}
                    </Text>
                    <Text style={[styles.groupMeta, { color: colors.secondaryText }]}>
                      {group.memberCount} • {group.joinCode}
                    </Text>
                  </View>
                  <View style={[styles.localOnlyBadge, { backgroundColor: colors.cardBorder }]}>
                    <Text style={[styles.localOnlyText, { color: colors.secondaryText }]}>
                      {t('harvest.localOnly')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Ionicons name="people-outline" size={30} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                {t('harvest.noLocalGroups')}
              </Text>
            </View>
          )}
        </View>

        {repositorySnapshot.mode !== 'local-only' && (
          <View
            style={[
              styles.localCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.localTitle, { color: colors.primaryText }]}>
              {t('harvest.syncedGroupsTitle')}
            </Text>
            <Text style={[styles.localBody, { color: colors.secondaryText }]}>
              {isSignedIn ? t('harvest.syncedGroupsDescription') : t('harvest.syncedGroupsSignin')}
            </Text>

            {syncLoadError ? (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: colors.background, borderColor: colors.cardBorder },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={30} color={colors.error} />
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                  {t('harvest.groupSyncLoadError')}
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { borderColor: colors.cardBorder }]}
                  onPress={handleRetrySync}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                >
                  <Text style={[styles.retryButtonText, { color: colors.accentPrimary }]}>
                    {t('common.retry')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : isLoadingSynced && repositorySnapshot.syncedGroups.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: colors.background, borderColor: colors.cardBorder },
                ]}
              >
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                  {t('harvest.loadingSyncedGroups')}
                </Text>
              </View>
            ) : repositorySnapshot.syncedGroups.length > 0 ? (
              <View style={styles.localList}>
                {repositorySnapshot.syncedGroups.map((group) => (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupRow,
                      { backgroundColor: colors.background, borderColor: colors.cardBorder },
                    ]}
                    onPress={() => navigation.navigate('GroupDetail', { groupId: group.id })}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[styles.groupIcon, { backgroundColor: colors.accentSecondary + '16' }]}
                    >
                      <Ionicons
                        name="cloud-done-outline"
                        size={18}
                        color={colors.accentSecondary}
                      />
                    </View>
                    <View style={styles.groupCopy}>
                      <Text style={[styles.groupName, { color: colors.primaryText }]}>
                        {group.name}
                      </Text>
                      <Text style={[styles.groupMeta, { color: colors.secondaryText }]}>
                        {group.memberCount} • {group.joinCode}
                      </Text>
                    </View>
                    <View style={[styles.localOnlyBadge, { backgroundColor: colors.cardBorder }]}>
                      <Text style={[styles.localOnlyText, { color: colors.secondaryText }]}>
                        {t('harvest.syncedLabel')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: colors.background, borderColor: colors.cardBorder },
                ]}
              >
                <Ionicons name="cloud-outline" size={30} color={colors.secondaryText} />
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                  {t('harvest.noSyncedGroups')}
                </Text>
              </View>
            )}
          </View>
        )}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.cardTitle,
  },
  headerRight: {
    width: layout.minTouchTarget,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroBadge: {
    ...typography.eyebrow,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.sectionTitle,
  },
  heroBody: {
    ...typography.body,
    lineHeight: 22,
  },
  statusCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  statusText: {
    flex: 1,
    ...typography.body,
    lineHeight: 20,
  },
  authPromptButton: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  authPromptButtonText: {
    ...typography.button,
  },
  localCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.denseCardPadding,
    gap: spacing.md,
  },
  localTitle: {
    ...typography.cardTitle,
  },
  localBody: {
    ...typography.body,
    lineHeight: 21,
  },
  localList: {
    gap: spacing.md,
  },
  groupRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCopy: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  groupMeta: {
    ...typography.label,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  localOnlyBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  localOnlyText: {
    ...typography.eyebrow,
    letterSpacing: 0.4,
  },
  emptyState: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  retryButtonText: {
    ...typography.label,
  },
});
