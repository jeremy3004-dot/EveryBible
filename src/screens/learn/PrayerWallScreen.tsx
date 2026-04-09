import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { useAuthStore } from '../../stores/authStore';
import * as prayerService from '../../services/prayer/prayerService';
import type { PrayerRequestWithCounts } from '../../services/prayer/prayerService';

type ScreenRouteProp = RouteProp<LearnStackParamList, 'PrayerWall'>;

// Tracks which request IDs the current user has interacted with this session.
// The backend enforces uniqueness; this mirrors it locally for instant UI feedback.
interface LocalInteractions {
  prayed: Set<string>;
  encouraged: Set<string>;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const MAX_CHARS = 500;

export function PrayerWallScreen() {
  const navigation = useNavigation();
  const route = useRoute<ScreenRouteProp>();
  const { groupId, groupName } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.uid ?? null;

  const [requests, setRequests] = useState<PrayerRequestWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [submitText, setSubmitText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localInteractions, setLocalInteractions] = useState<LocalInteractions>({
    prayed: new Set(),
    encouraged: new Set(),
  });

  const inputRef = useRef<TextInput>(null);
  const isSignedIn = Boolean(currentUserId);

  const loadRequests = useCallback(async () => {
    const result = await prayerService.listPrayerRequests(groupId);
    if (result.success && result.data) {
      setRequests(result.data);
    }
  }, [groupId]);

  useEffect(() => {
    setIsLoading(true);
    loadRequests().finally(() => setIsLoading(false));
  }, [loadRequests]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadRequests();
    setIsRefreshing(false);
  }, [loadRequests]);

  const handleSubmit = useCallback(async () => {
    if (!currentUserId) {
      openAuthFlow('signIn');
      return;
    }

    const trimmed = submitText.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const result = await prayerService.createPrayerRequest(groupId, trimmed);

    if (result.success && result.data) {
      const newRequest: PrayerRequestWithCounts = {
        ...result.data,
        prayed_count: 0,
        encouraged_count: 0,
      };
      setRequests((prev) => [newRequest, ...prev]);
      setSubmitText('');
      inputRef.current?.blur();
    } else {
      Alert.alert(t('common.error'), result.error ?? t('common.retry'));
    }

    setIsSubmitting(false);
  }, [currentUserId, groupId, isSubmitting, submitText, t]);

  const handleInteraction = useCallback(
    async (requestId: string, type: 'prayed' | 'encouraged') => {
      if (!currentUserId) {
        openAuthFlow('signIn');
        return;
      }

      const key = type === 'prayed' ? 'prayed' : 'encouraged';
      const alreadyInteracted = localInteractions[key].has(requestId);

      // Optimistic update
      setLocalInteractions((prev) => {
        const updated = new Set(prev[key]);
        if (alreadyInteracted) {
          updated.delete(requestId);
        } else {
          updated.add(requestId);
        }
        return { ...prev, [key]: updated };
      });

      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== requestId) return r;
          const delta = alreadyInteracted ? -1 : 1;
          return type === 'prayed'
            ? { ...r, prayed_count: Math.max(0, r.prayed_count + delta) }
            : { ...r, encouraged_count: Math.max(0, r.encouraged_count + delta) };
        })
      );

      if (alreadyInteracted) {
        await prayerService.removeInteraction(requestId, type);
      } else {
        await prayerService.addInteraction(requestId, type);
      }
    },
    [currentUserId, localInteractions]
  );

  const handleLongPress = useCallback(
    (request: PrayerRequestWithCounts) => {
      if (request.user_id !== currentUserId) return;

      const options = [
        t('common.edit'),
        t('prayer.markAnswered'),
        t('common.delete'),
        t('common.cancel'),
      ];

      const destructiveIndex = 2;
      const cancelIndex = 3;

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
          (buttonIndex) => {
            if (buttonIndex === 0) handleEdit(request);
            else if (buttonIndex === 1) handleMarkAnswered(request.id);
            else if (buttonIndex === 2) handleDelete(request.id);
          }
        );
      } else {
        Alert.alert(
          t('common.edit'),
          undefined,
          [
            { text: t('common.edit'), onPress: () => handleEdit(request) },
            { text: t('prayer.markAnswered'), onPress: () => handleMarkAnswered(request.id) },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: () => handleDelete(request.id),
            },
            { text: t('common.cancel'), style: 'cancel' },
          ]
        );
      }
    },
    // handleEdit/handleMarkAnswered/handleDelete defined below; deps added via useCallback chain
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, t]
  );

  const handleEdit = useCallback(
    (request: PrayerRequestWithCounts) => {
      Alert.prompt(
        t('common.edit'),
        undefined,
        async (newText) => {
          if (!newText?.trim()) return;
          const result = await prayerService.updatePrayerRequest(request.id, newText.trim());
          if (result.success && result.data) {
            setRequests((prev) =>
              prev.map((r) => (r.id === request.id ? { ...r, content: result.data!.content } : r))
            );
          }
        },
        'plain-text',
        request.content
      );
    },
    [t]
  );

  const handleMarkAnswered = useCallback(
    async (requestId: string) => {
      const result = await prayerService.markPrayerAnswered(requestId);
      if (result.success && result.data) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, is_answered: true, answered_at: result.data!.answered_at }
              : r
          )
        );
      }
    },
    []
  );

  const handleDelete = useCallback(
    (requestId: string) => {
      Alert.alert(
        t('common.delete'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              const result = await prayerService.deletePrayerRequest(requestId);
              if (result.success) {
                setRequests((prev) => prev.filter((r) => r.id !== requestId));
              }
            },
          },
        ]
      );
    },
    [t]
  );

  const styles = makeStyles(colors);

  const renderItem = useCallback(
    ({ item }: { item: PrayerRequestWithCounts }) => {
      const isOwner = item.user_id === currentUserId;
      const hasPrayed = localInteractions.prayed.has(item.id);
      const hasEncouraged = localInteractions.encouraged.has(item.id);

      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBackground }]}
          onLongPress={isOwner ? () => handleLongPress(item) : undefined}
          activeOpacity={isOwner ? 0.7 : 1}
          accessible
          accessibilityLabel={item.content}
          accessibilityHint={isOwner ? 'Long press to edit or delete' : undefined}
        >
          {/* Card header: avatar + meta */}
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.accentPrimary + '25' }]}>
              <Text style={[styles.avatarInitial, { color: colors.accentPrimary }]}>
                {(item.user_id.charAt(0) ?? '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={[styles.displayName, { color: colors.primaryText }]}>
                {isOwner ? (user?.displayName ?? t('prayer.you')) : t('prayer.groupMember')}
              </Text>
              <Text style={[styles.timestamp, { color: colors.secondaryText }]}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
            {item.is_answered && (
              <View style={[styles.answeredBadge, { backgroundColor: colors.success + '25' }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[styles.answeredText, { color: colors.success }]}>
                  {t('prayer.answered')}
                </Text>
              </View>
            )}
          </View>

          {/* Request content */}
          <Text style={[styles.content, { color: colors.primaryText }]}>{item.content}</Text>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionPill,
                {
                  backgroundColor: hasPrayed
                    ? colors.accentPrimary + '20'
                    : colors.cardBorder + '50',
                },
              ]}
              onPress={() => handleInteraction(item.id, 'prayed')}
              accessibilityLabel={t('prayer.prayedCount', { count: item.prayed_count })}
              accessibilityRole="button"
            >
              <Ionicons
                name={hasPrayed ? 'hand-left' : 'hand-left-outline'}
                size={15}
                color={hasPrayed ? colors.accentPrimary : colors.secondaryText}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: hasPrayed ? colors.accentPrimary : colors.secondaryText },
                ]}
              >
                {t('prayer.prayed')} {item.prayed_count > 0 ? `(${item.prayed_count})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionPill,
                {
                  backgroundColor: hasEncouraged
                    ? colors.accentPrimary + '20'
                    : colors.cardBorder + '50',
                },
              ]}
              onPress={() => handleInteraction(item.id, 'encouraged')}
              accessibilityLabel={t('prayer.encouragedCount', { count: item.encouraged_count })}
              accessibilityRole="button"
            >
              <Ionicons
                name={hasEncouraged ? 'heart' : 'heart-outline'}
                size={15}
                color={hasEncouraged ? colors.accentPrimary : colors.secondaryText}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: hasEncouraged ? colors.accentPrimary : colors.secondaryText },
                ]}
              >
                {t('prayer.encouraged')} {item.encouraged_count > 0 ? `(${item.encouraged_count})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [
      colors,
      currentUserId,
      handleInteraction,
      handleLongPress,
      localInteractions,
      styles,
      t,
      user?.displayName,
    ]
  );

  const ListEmptyComponent = (
    <View style={styles.emptyContainer}>
      <Ionicons name="hand-left-outline" size={48} color={colors.secondaryText} />
      <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
        {isSignedIn ? t('prayer.noPrayers') : t('prayer.signInTitle')}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
        {isSignedIn ? t('prayer.beFirst') : t('prayer.signInBody')}
      </Text>
      {!isSignedIn ? (
        <TouchableOpacity
          style={[styles.signInPromptButton, { backgroundColor: colors.accentPrimary }]}
          onPress={() => openAuthFlow('signIn')}
        >
          <Text style={[styles.signInPromptButtonText, { color: colors.background }]}>
            {t('auth.signIn')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrapper}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
            {t('prayer.title')}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]} numberOfLines={1}>
            {groupName}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {!isSignedIn ? (
        <View
          style={[
            styles.signInPromptCard,
            {
              backgroundColor: colors.cardBackground,
              borderBottomColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.signInPromptCopy}>
            <Text style={[styles.signInPromptTitle, { color: colors.primaryText }]}>
              {t('prayer.signInTitle')}
            </Text>
            <Text style={[styles.signInPromptBody, { color: colors.secondaryText }]}>
              {t('prayer.signInBody')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.signInInlineButton, { backgroundColor: colors.accentPrimary }]}
            onPress={() => openAuthFlow('signIn')}
          >
            <Text style={[styles.signInInlineButtonText, { color: colors.background }]}>
              {t('auth.signIn')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Submit bar */}
      <View style={[styles.submitBar, { backgroundColor: colors.cardBackground, borderBottomColor: colors.cardBorder }]}>
        <TextInput
          ref={inputRef}
          style={[styles.textInput, { color: colors.primaryText, backgroundColor: colors.background }]}
          placeholder={t('prayer.requestPlaceholder')}
          placeholderTextColor={colors.secondaryText}
          value={submitText}
          onChangeText={(text) => setSubmitText(text.slice(0, MAX_CHARS))}
          multiline
          maxLength={MAX_CHARS}
          returnKeyType="default"
          editable={isSignedIn}
          accessible
          accessibilityLabel={t('prayer.requestPlaceholder')}
        />
        <View style={styles.submitRow}>
          <Text style={[styles.charCount, { color: colors.secondaryText }]}>
            {submitText.length}/{MAX_CHARS}
          </Text>
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor:
                  isSignedIn && submitText.trim().length > 0
                    ? colors.accentPrimary
                    : colors.cardBorder,
              },
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting || !isSignedIn || submitText.trim().length === 0}
            accessibilityLabel={t('prayer.submitRequest')}
            accessibilityRole="button"
          >
            <Ionicons
              name="send"
              size={16}
              color={
                isSignedIn && submitText.trim().length > 0
                  ? colors.cardBackground
                  : colors.secondaryText
              }
            />
            <Text
              style={[
                styles.submitButtonText,
                {
                  color:
                    isSignedIn && submitText.trim().length > 0
                      ? colors.cardBackground
                      : colors.secondaryText,
                },
              ]}
            >
              {t('prayer.submitRequest')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Prayer request list */}
      {isLoading ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
            {t('common.loading')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            requests.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={ListEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.secondaryText}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: spacing.xs,
      minWidth: layout.minTouchTarget,
      minHeight: layout.minTouchTarget,
      justifyContent: 'center',
    },
    headerTitleWrapper: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      ...typography.cardTitle,
    },
    headerSubtitle: {
      ...typography.micro,
      marginTop: 1,
    },
    headerRight: {
      minWidth: layout.minTouchTarget,
    },
    submitBar: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
    },
    signInPromptCard: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      gap: spacing.md,
    },
    signInPromptCopy: {
      gap: spacing.xs,
    },
    signInPromptTitle: {
      ...typography.bodyStrong,
    },
    signInPromptBody: {
      ...typography.body,
    },
    signInInlineButton: {
      alignSelf: 'flex-start',
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    signInInlineButtonText: {
      ...typography.button,
    },
    textInput: {
      ...typography.body,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 72,
      maxHeight: 140,
      textAlignVertical: 'top',
    },
    submitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    charCount: {
      ...typography.micro,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    submitButtonText: {
      ...typography.label,
    },
    listContent: {
      padding: layout.screenPadding,
      gap: spacing.md,
    },
    listContentEmpty: {
      flex: 1,
    },
    card: {
      borderRadius: radius.lg,
      padding: layout.denseCardPadding,
      gap: spacing.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      ...typography.label,
    },
    cardMeta: {
      flex: 1,
    },
    displayName: {
      ...typography.bodyStrong,
      fontSize: 14,
      lineHeight: 18,
    },
    timestamp: {
      ...typography.micro,
    },
    answeredBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    answeredText: {
      ...typography.micro,
      fontWeight: '600',
    },
    content: {
      ...typography.body,
      lineHeight: 22,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
    },
    pillText: {
      ...typography.micro,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.screenPadding,
    },
    emptyTitle: {
      ...typography.cardTitle,
      textAlign: 'center',
    },
    emptyBody: {
      ...typography.body,
      textAlign: 'center',
    },
    signInPromptButton: {
      marginTop: spacing.lg,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    signInPromptButtonText: {
      ...typography.button,
    },
  });
}
