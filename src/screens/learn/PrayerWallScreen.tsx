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
import { layout, radius, spacing, typography } from '../../design/system';
import { lightHaptic, successHaptic } from '../../utils';
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

// TODO(i18n): relative-time strings ('just now', '{{count}}m ago', etc.) are still
// English. Extracting them needs new plural-aware keys (prayer.justNow / minutesAgo /
// hoursAgo / daysAgo) added across all 26 locales, so it is deferred to the copy pass.
// Do NOT switch to Intl.RelativeTimeFormat here — this runs per-render on a hot path.
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
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
    } else {
      // Distinguish a genuine load failure (offline / server error) from an
      // empty group so we never render "no prayers yet" over a fetch failure.
      setLoadError(true);
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
      successHaptic();
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
      const delta = alreadyInteracted ? -1 : 1;

      const applyLocalDelta = (direction: 1 | -1) => {
        setLocalInteractions((prev) => {
          const updated = new Set(prev[key]);
          const shouldHave = direction === 1 ? !alreadyInteracted : alreadyInteracted;
          if (shouldHave) {
            updated.add(requestId);
          } else {
            updated.delete(requestId);
          }
          return { ...prev, [key]: updated };
        });

        setRequests((prev) =>
          prev.map((r) => {
            if (r.id !== requestId) return r;
            const applied = delta * direction;
            return type === 'prayed'
              ? { ...r, prayed_count: Math.max(0, r.prayed_count + applied) }
              : { ...r, encouraged_count: Math.max(0, r.encouraged_count + applied) };
          })
        );
      };

      // Optimistic update
      applyLocalDelta(1);
      lightHaptic();

      const result = alreadyInteracted
        ? await prayerService.removeInteraction(requestId, type)
        : await prayerService.addInteraction(requestId, type);

      // Roll back the optimistic change if the write failed so counts don't drift.
      if (!result?.success) {
        applyLocalDelta(-1);
      }
    },
    [currentUserId, localInteractions]
  );

  const handleLongPress = useCallback(
    (request: PrayerRequestWithCounts) => {
      if (request.user_id !== currentUserId) return;

      if (Platform.OS === 'ios') {
        // Edit relies on Alert.prompt, which only exists on iOS. Keep it here only.
        const options = [
          t('common.edit'),
          t('prayer.markAnswered'),
          t('common.delete'),
          t('common.cancel'),
        ];

        ActionSheetIOS.showActionSheetWithOptions(
          { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
          (buttonIndex) => {
            if (buttonIndex === 0) handleEdit(request);
            else if (buttonIndex === 1) handleMarkAnswered(request.id);
            else if (buttonIndex === 2) handleDelete(request.id);
          }
        );
      } else {
        // Android has no Alert.prompt, so Edit is omitted rather than shipped as a
        // no-op option.
        Alert.alert(
          t('prayer.title'),
          undefined,
          [
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

  const renderItem = useCallback(
    ({ item }: { item: PrayerRequestWithCounts }) => {
      const isOwner = item.user_id === currentUserId;
      const hasPrayed = localInteractions.prayed.has(item.id);
      const hasEncouraged = localInteractions.encouraged.has(item.id);
      const displayName = isOwner
        ? user?.displayName ?? t('prayer.you')
        : t('prayer.groupMember');
      // Derive the avatar initial from the displayed name, never from the raw
      // user_id (a UUID whose first char is a meaningless hex digit).
      const avatarInitial = (displayName.trim().charAt(0) || '?').toUpperCase();

      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBackground }]}
          onLongPress={isOwner ? () => handleLongPress(item) : undefined}
          activeOpacity={isOwner ? 0.7 : 1}
          accessible
          accessibilityLabel={item.content}
          accessibilityHint={isOwner ? t('prayer.ownerLongPressHint') : undefined}
        >
          {/* Card header: avatar + meta */}
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.accentPrimary + '25' }]}>
              <Text style={[styles.avatarInitial, { color: colors.accentPrimary }]}>
                {avatarInitial}
              </Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={[styles.displayName, { color: colors.primaryText }]}>
                {displayName}
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
                  styles.pillTextTabular,
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
                  styles.pillTextTabular,
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
          <Text style={[styles.signInPromptButtonText, { color: colors.onAccent }]}>
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
            <Text style={[styles.signInInlineButtonText, { color: colors.onAccent }]}>
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
          <Text style={[styles.charCount, styles.charCountTabular, { color: colors.secondaryText }]}>
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
                  ? colors.onAccent
                  : colors.secondaryText
              }
            />
            <Text
              style={[
                styles.submitButtonText,
                {
                  color:
                    isSignedIn && submitText.trim().length > 0
                      ? colors.onAccent
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
      ) : loadError && requests.length === 0 ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.secondaryText} />
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            {t('common.somethingWentWrong')}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
            {t('common.tryAgain')}
          </Text>
          <TouchableOpacity
            style={[styles.errorRetryButton, { backgroundColor: colors.accentPrimary }]}
            onPress={() => {
              setIsLoading(true);
              loadRequests().finally(() => setIsLoading(false));
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={[styles.errorRetryButtonText, { color: colors.onAccent }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
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

const styles = StyleSheet.create({
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
      borderRadius: radius.lg,
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
      borderRadius: radius.lg,
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
      borderRadius: radius.lg,
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
    charCountTabular: {
      fontVariant: ['tabular-nums'],
    },
    pillTextTabular: {
      fontVariant: ['tabular-nums'],
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.screenPadding,
    },
    errorRetryButton: {
      marginTop: spacing.lg,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    errorRetryButtonText: {
      ...typography.button,
    },
});
