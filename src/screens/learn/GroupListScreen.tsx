import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import type { LearnStackParamList } from '../../navigation/types';
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
  const syncRequestKey = syncFeatureEnabled && backendConfigured && isSignedIn
    ? user?.uid ?? 'signed-in'
    : null;
  const [remoteSyncState, setRemoteSyncState] = useState<{
    key: string | null;
    groups: SyncedGroup[];
    error: string | null;
  }>({
    key: null,
    groups: [],
    error: null,
  });
  const syncedGroups = syncRequestKey !== null && remoteSyncState.key === syncRequestKey
    ? remoteSyncState.groups
    : [];
  const syncLoadError = syncRequestKey !== null && remoteSyncState.key === syncRequestKey
    ? remoteSyncState.error
    : null;
  const isLoadingSynced = syncRequestKey !== null && remoteSyncState.key !== syncRequestKey;
  const repositorySnapshot = buildGroupRepositorySnapshot({
    localGroups: groups,
    syncFeatureEnabled,
    backendConfigured,
    signedIn: isSignedIn,
    syncedGroups,
  });

  useEffect(() => {
    let cancelled = false;

    if (!syncRequestKey) {
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
          key: syncRequestKey,
          groups: nextGroups,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRemoteSyncState({
          key: syncRequestKey,
          groups: [],
          error: error instanceof Error ? error.message : 'Unable to refresh synced groups.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [syncRequestKey]);

  const statusIconName =
    groupRollout.syncStatusKey === 'harvest.groupSyncReady'
      ? 'checkmark-circle-outline'
      : groupRollout.syncStatusKey === 'harvest.groupSyncSignin'
        ? 'person-outline'
        : 'cloud-offline-outline';
  const statusIconColor =
    groupRollout.syncStatusKey === 'harvest.groupSyncReady'
      ? colors.success
      : colors.accentPrimary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
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
            <Ionicons
              name={statusIconName}
              size={20}
              color={statusIconColor}
            />
            <Text style={[styles.statusText, { color: colors.primaryText }]}>
              {t(groupRollout.syncStatusKey)}
            </Text>
          </View>
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
                  <View style={[styles.groupIcon, { backgroundColor: colors.accentPrimary + '16' }]}>
                    <Ionicons name="people-outline" size={18} color={colors.accentPrimary} />
                  </View>
                  <View style={styles.groupCopy}>
                    <Text style={[styles.groupName, { color: colors.primaryText }]}>{group.name}</Text>
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
              <Ionicons name="cloud-offline-outline" size={30} color={colors.secondaryText} />
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
              {isSignedIn
                ? t('harvest.syncedGroupsDescription')
                : t('harvest.syncedGroupsSignin')}
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
              </View>
            ) : isLoadingSynced && repositorySnapshot.syncedGroups.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: colors.background, borderColor: colors.cardBorder },
                ]}
              >
                <Ionicons name="sync-outline" size={30} color={colors.accentPrimary} />
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
                      <Ionicons name="cloud-done-outline" size={18} color={colors.accentSecondary} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  statusCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  localCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  localTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  localBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  localList: {
    gap: 12,
  },
  groupRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCopy: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
  },
  groupMeta: {
    fontSize: 13,
  },
  localOnlyBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  localOnlyText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
