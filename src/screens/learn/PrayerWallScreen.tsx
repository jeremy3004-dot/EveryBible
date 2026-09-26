import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../../i18n/interfaceFormatting';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { lightHaptic, successHaptic } from '../../utils';
import { announceForAccessibility } from '../../utils/a11y';
import { isDeviceOffline } from '../../utils/connectivity';
import type { LearnStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { useAuthStore } from '../../stores/authStore';
import * as prayerService from '../../services/prayer/prayerService';
import type {
  PrayerRequestCursor,
  PrayerRequestWithCounts,
} from '../../services/prayer/prayerService';
import {
  applyConfirmedInteraction,
  isUnderReviewForViewer,
  prayerRequestActions,
  withPendingInteractions,
  type PrayerInteractionType,
  type PrayerReportReason,
  type PrayerWriteErrorCode,
} from '../../services/prayer/prayerModel';
import { PrayerReportSheet } from './PrayerReportSheet';
import {
  buildPrayerCardAccessibilityLabel,
  prayerInteractionAnnouncement,
  prayerRequestActionAnnouncement,
} from './prayerCardAccessibility';

type ScreenRouteProp = RouteProp<LearnStackParamList, 'PrayerWall'>;
type NavigationProp = NativeStackNavigationProp<LearnStackParamList, 'PrayerWall'>;

const MAX_CHARS = 500;

/** One Prayed / Encouraged pill: `prayed:<request id>`. */
const interactionKey = (type: PrayerInteractionType, requestId: string) => `${type}:${requestId}`;

export function PrayerWallScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { groupId, groupName, isLeader = false } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Prayer wall is pushed inside the Learn tab stack, so the last card has to
  // clear the floating tab capsule and the Android navigation bar beneath it.
  const { contentClearance } = useTabBarHeight();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.uid ?? null;
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const scopeRef = useRef<object | null>(null);
  const captureOwner = useCallback(() => {
    const scope = scopeRef.current;
    return {
      userId: currentUserId ?? '',
      isCurrent: () => {
        const auth = useAuthStore.getState();
        return (
          scope != null &&
          scopeRef.current === scope &&
          (auth.user?.uid ?? null) === currentUserId &&
          auth.authGeneration === authGeneration
        );
      },
    };
  }, [currentUserId, authGeneration]);

  const [requests, setRequests] = useState<PrayerRequestWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Set with loadError: the wall lives only on the server, so offline it cannot load.
  const [offline, setOffline] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [submitText, setSubmitText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // `requests` holds what the server last confirmed. Taps still waiting for the server are laid
  // over it from here (pill key -> the state the tap will set), so a failed tap only has to drop
  // its entry to show the latest confirmed state again.
  const [pendingInteractions, setPendingInteractions] = useState<Record<string, boolean>>({});
  // Pills with a write in flight. A ref, so a second tap in the same frame is already ignored.
  const inFlightRef = useRef(new Map<string, object>());
  const submittingRef = useRef<object | null>(null);
  const reportingRef = useRef<object | null>(null);
  // The viewer's confirmed flag per pill, read synchronously to decide what a tap does.
  const confirmedRef = useRef(new Map<string, boolean>());
  // Older requests load a page at a time as the reader reaches the end of the wall.
  const [nextCursor, setNextCursor] = useState<PrayerRequestCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef<object | null>(null);
  // Bumped by every first-page load, so a next page requested before a refresh is dropped.
  const loadGenerationRef = useRef(0);
  // The request whose report form is open, if any.
  const [reportTarget, setReportTarget] = useState<PrayerRequestWithCounts | null>(null);
  const [isReporting, setIsReporting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const isSignedIn = Boolean(currentUserId);

  const rememberConfirmed = useCallback((rows: PrayerRequestWithCounts[]) => {
    for (const row of rows) {
      confirmedRef.current.set(interactionKey('prayed', row.id), row.viewer_prayed);
      confirmedRef.current.set(interactionKey('encouraged', row.id), row.viewer_encouraged);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    const owner = captureOwner();
    if (!owner.isCurrent() || !owner.userId) return;
    const generation = ++loadGenerationRef.current;
    loadingMoreRef.current = null;
    setIsLoadingMore(false);
    const isCurrent = () => owner.isCurrent() && generation === loadGenerationRef.current;
    try {
      const result = await prayerService.listPrayerRequests(groupId);
      if (!isCurrent()) return;
      if (result.success && result.data) {
        setRequests(result.data);
        setNextCursor(result.nextCursor ?? null);
        confirmedRef.current = new Map();
        rememberConfirmed(result.data);
        setLoadError(false);
      } else {
        const isOffline = await isDeviceOffline();
        if (!isCurrent()) return;
        setOffline(isOffline);
        setLoadError(true);
      }
    } catch {
      if (!isCurrent()) return;
      const isOffline = await isDeviceOffline().catch(() => false);
      if (!isCurrent()) return;
      setOffline(isOffline);
      setLoadError(true);
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [captureOwner, groupId, rememberConfirmed]);

  const handleLoadMore = useCallback(async () => {
    const owner = captureOwner();
    if (!owner.isCurrent() || !nextCursor || loadingMoreRef.current) return;
    const request = {};
    loadingMoreRef.current = request;
    setIsLoadingMore(true);
    const generation = loadGenerationRef.current;
    const isCurrent = () =>
      owner.isCurrent() &&
      generation === loadGenerationRef.current &&
      loadingMoreRef.current === request;
    try {
      const result = await prayerService.listPrayerRequests(groupId, { before: nextCursor });
      if (!isCurrent() || !result.success || !result.data) return;
      rememberConfirmed(result.data);
      const page = result.data;
      setRequests((prev) => {
        const shown = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !shown.has(r.id))];
      });
      setNextCursor(result.nextCursor ?? null);
    } catch {
      // Keep the cursor so scrolling to the end can retry a failed page.
    } finally {
      if (isCurrent()) {
        loadingMoreRef.current = null;
        setIsLoadingMore(false);
      }
    }
  }, [captureOwner, groupId, nextCursor, rememberConfirmed]);

  // Reset before paint so the new viewer never sees the prior group's private text.
  useLayoutEffect(() => {
    scopeRef.current = {};
    loadGenerationRef.current += 1;
    inFlightRef.current = new Map();
    confirmedRef.current = new Map();
    loadingMoreRef.current = null;
    submittingRef.current = null;
    reportingRef.current = null;
    setRequests([]);
    setNextCursor(null);
    setSubmitText('');
    setReportTarget(null);
    setPendingInteractions({});
    setIsSubmitting(false);
    setIsReporting(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
    setLoadError(false);
    setOffline(false);
    setIsLoading(Boolean(currentUserId));
    if (currentUserId) void loadRequests();
    return () => {
      scopeRef.current = null;
      loadGenerationRef.current += 1;
    };
  }, [currentUserId, authGeneration, groupId, loadRequests]);

  const handleRefresh = useCallback(async () => {
    if (!captureOwner().isCurrent()) return;
    setIsRefreshing(true);
    await loadRequests();
  }, [captureOwner, loadRequests]);

  // A refusal the member can act on gets its own message; anything else is generic.
  const writeErrorMessage = useCallback(
    (code: PrayerWriteErrorCode | undefined) => {
      if (code === 'rate_limited') return t('prayer.rateLimited');
      if (code === 'content_rejected') return t('prayer.contentRejected');
      if (code === 'banned') return t('prayer.postingBlocked');
      return t('common.somethingWentWrong');
    },
    [t]
  );

  const handleSubmit = useCallback(async () => {
    if (!currentUserId) {
      openAuthFlow('signIn');
      return;
    }
    const owner = captureOwner();
    const trimmed = submitText.trim();
    if (!owner.isCurrent() || !trimmed || submittingRef.current) return;
    const request = {};
    submittingRef.current = request;
    setIsSubmitting(true);
    try {
      const result = await prayerService.createPrayerRequest(groupId, trimmed, owner);
      if (!owner.isCurrent()) return;
      if (result.success && result.data) {
        setRequests((prev) => [
          {
            ...result.data!,
            prayed_count: 0,
            encouraged_count: 0,
            viewer_prayed: false,
            viewer_encouraged: false,
          },
          ...prev,
        ]);
        setSubmitText('');
        inputRef.current?.blur();
        successHaptic();
      } else Alert.alert(t('common.error'), writeErrorMessage(result.code));
    } catch {
      if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
    } finally {
      if (owner.isCurrent() && submittingRef.current === request) {
        submittingRef.current = null;
        setIsSubmitting(false);
      }
    }
  }, [captureOwner, currentUserId, groupId, submitText, t, writeErrorMessage]);

  const handleInteraction = useCallback(
    async (requestId: string, type: PrayerInteractionType) => {
      if (!currentUserId) {
        openAuthFlow('signIn');
        return;
      }
      const owner = captureOwner();
      const key = interactionKey(type, requestId);
      if (!owner.isCurrent() || inFlightRef.current.has(key)) return;
      const request = {};
      inFlightRef.current.set(key, request);
      const active = !(confirmedRef.current.get(key) ?? false);
      setPendingInteractions((prev) => ({ ...prev, [key]: active }));
      lightHaptic();
      let succeeded = false;
      try {
        const result = active
          ? await prayerService.addInteraction(requestId, type, owner)
          : await prayerService.removeInteraction(requestId, type, owner);
        if (!owner.isCurrent()) return;
        succeeded = Boolean(result?.success);
      } catch {
        if (!owner.isCurrent()) return;
      } finally {
        if (owner.isCurrent() && inFlightRef.current.get(key) === request) {
          inFlightRef.current.delete(key);
          setPendingInteractions((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      if (!succeeded) {
        announceForAccessibility(t('common.somethingWentWrong'));
        return;
      }
      confirmedRef.current.set(key, active);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? applyConfirmedInteraction(r, type, active) : r))
      );
      announceForAccessibility(prayerInteractionAnnouncement(t, type, active));
    },
    [captureOwner, currentUserId, t]
  );

  const handleEdit = useCallback(
    (request: PrayerRequestWithCounts) => {
      const owner = captureOwner();
      if (!owner.isCurrent()) return;
      Alert.prompt(
        t('common.edit'),
        undefined,
        async (newText) => {
          if (!owner.isCurrent() || !newText?.trim()) return;
          try {
            const result = await prayerService.updatePrayerRequest(
              request.id,
              newText.trim(),
              owner
            );
            if (!owner.isCurrent()) return;
            if (result.success && result.data)
              setRequests((prev) =>
                prev.map((r) => (r.id === request.id ? { ...r, content: result.data!.content } : r))
              );
            else Alert.alert(t('common.error'), writeErrorMessage(result.code));
          } catch {
            if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
          }
        },
        'plain-text',
        request.content
      );
    },
    [captureOwner, t, writeErrorMessage]
  );

  const handleMarkAnswered = useCallback(
    async (requestId: string) => {
      const owner = captureOwner();
      if (!owner.isCurrent()) return;
      try {
        const result = await prayerService.markPrayerAnswered(requestId, owner);
        if (!owner.isCurrent()) return;
        if (result.success && result.data) {
          setRequests((prev) =>
            prev.map((r) =>
              r.id === requestId
                ? { ...r, is_answered: true, answered_at: result.data!.answered_at }
                : r
            )
          );
          announceForAccessibility(prayerRequestActionAnnouncement(t, 'markAnswered'));
        } else Alert.alert(t('common.error'), t('common.somethingWentWrong'));
      } catch {
        if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
      }
    },
    [captureOwner, t]
  );

  const handleDelete = useCallback(
    (requestId: string) => {
      const owner = captureOwner();
      if (!owner.isCurrent()) return;
      Alert.alert(t('common.delete'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!owner.isCurrent()) return;
            try {
              const result = await prayerService.deletePrayerRequest(requestId, owner);
              if (!owner.isCurrent()) return;
              if (result.success) {
                setRequests((prev) => prev.filter((r) => r.id !== requestId));
                announceForAccessibility(prayerRequestActionAnnouncement(t, 'delete'));
              } else Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            } catch {
              if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            }
          },
        },
      ]);
    },
    [captureOwner, t]
  );

  const handleSubmitReport = useCallback(
    async (reason: PrayerReportReason, note: string) => {
      const owner = captureOwner();
      if (!owner.isCurrent() || !reportTarget || reportingRef.current) return;
      const request = {};
      reportingRef.current = request;
      setIsReporting(true);
      try {
        const result = await prayerService.reportPrayerRequest(
          reportTarget.id,
          reason,
          note,
          owner
        );
        if (!owner.isCurrent()) return;
        if (result.success) {
          setRequests((prev) => prev.filter((r) => r.id !== reportTarget.id));
          setReportTarget(null);
          Alert.alert(t('prayer.report'), t('prayer.reportSent'));
        } else
          Alert.alert(
            t('common.error'),
            result.code === 'rate_limited'
              ? t('prayer.reportRateLimited')
              : t('common.somethingWentWrong')
          );
      } catch {
        if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
      } finally {
        if (owner.isCurrent() && reportingRef.current === request) {
          reportingRef.current = null;
          setIsReporting(false);
        }
      }
    },
    [captureOwner, reportTarget, t]
  );

  const handleBlock = useCallback(
    (request: PrayerRequestWithCounts) => {
      const owner = captureOwner();
      if (!owner.isCurrent()) return;
      Alert.alert(t('prayer.blockTitle'), t('prayer.blockBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('prayer.blockAuthor'),
          style: 'destructive',
          onPress: async () => {
            if (!owner.isCurrent()) return;
            try {
              const result = await prayerService.blockUser(request.user_id, owner);
              if (!owner.isCurrent()) return;
              if (result.success)
                setRequests((prev) => prev.filter((r) => r.user_id !== request.user_id));
              else Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            } catch {
              if (owner.isCurrent()) Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            }
          },
        },
      ]);
    },
    [captureOwner, t]
  );

  const actionsFor = useCallback(
    (request: PrayerRequestWithCounts) =>
      prayerRequestActions({
        isSignedIn: Boolean(currentUserId),
        isOwner: request.user_id === currentUserId,
        isLeader,
        isAnswered: request.is_answered,
        // Edit relies on Alert.prompt, which only exists on iOS.
        canEdit: Platform.OS === 'ios',
      }),
    [currentUserId, isLeader]
  );

  const handleShowActions = useCallback(
    (request: PrayerRequestWithCounts) => {
      const owner = captureOwner();
      if (!owner.isCurrent()) return;
      const actions = actionsFor(request);
      if (actions.length === 0) return;

      const labels = {
        edit: t('common.edit'),
        markAnswered: t('prayer.markAnswered'),
        report: t('prayer.report'),
        block: t('prayer.blockAuthor'),
        delete: t('common.delete'),
      };
      const run = (action: (typeof actions)[number]) => {
        if (!owner.isCurrent()) return;
        if (action === 'edit') handleEdit(request);
        else if (action === 'markAnswered') handleMarkAnswered(request.id);
        else if (action === 'report') setReportTarget(request);
        else if (action === 'block') handleBlock(request);
        else handleDelete(request.id);
      };
      const isDestructive = (action: (typeof actions)[number]) =>
        action === 'delete' || action === 'block';

      if (Platform.OS === 'ios') {
        const options = [...actions.map((action) => labels[action]), t('common.cancel')];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: actions
              .map((action, index) => (isDestructive(action) ? index : -1))
              .filter((index) => index >= 0),
            cancelButtonIndex: actions.length,
          },
          (buttonIndex) => {
            const action = actions[buttonIndex];
            if (action) run(action);
          }
        );
      } else {
        // Android alerts show at most three buttons. With three actions the cancel button is
        // dropped and tapping outside the dialog cancels instead.
        const buttons = actions.map((action) => ({
          text: labels[action],
          style: isDestructive(action) ? ('destructive' as const) : ('default' as const),
          onPress: () => run(action),
        }));
        Alert.alert(
          t('prayer.title'),
          undefined,
          buttons.length < 3
            ? [...buttons, { text: t('common.cancel'), style: 'cancel' as const }]
            : buttons,
          { cancelable: true }
        );
      }
    },
    [actionsFor, captureOwner, handleBlock, handleDelete, handleEdit, handleMarkAnswered, t]
  );

  const renderItem = useCallback(
    ({ item: confirmed }: { item: PrayerRequestWithCounts }) => {
      const item = withPendingInteractions(confirmed, {
        prayed: pendingInteractions[interactionKey('prayed', confirmed.id)],
        encouraged: pendingInteractions[interactionKey('encouraged', confirmed.id)],
      });
      const isOwner = item.user_id === currentUserId;
      const hasActions = actionsFor(item).length > 0;
      const underReview = isUnderReviewForViewer(item, isOwner);
      const hasPrayed = item.viewer_prayed;
      const hasEncouraged = item.viewer_encouraged;
      const displayName = isOwner
        ? (user?.displayName ?? t('prayer.you'))
        : t('prayer.groupMember');
      // Derive the avatar initial from the displayed name, never from the raw
      // user_id (a UUID whose first char is a meaningless hex digit).
      const avatarInitial = (displayName.trim().charAt(0) || '?').toUpperCase();

      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBackground }]}
          onLongPress={hasActions ? () => handleShowActions(confirmed) : undefined}
          activeOpacity={hasActions ? 0.7 : 1}
          // The card is one VoiceOver element, which swallows the nested Prayed /
          // Encouraged pills on iOS; they are offered again as custom actions and
          // the label carries everything the card shows.
          accessible
          accessibilityLabel={buildPrayerCardAccessibilityLabel(t, {
            displayName,
            relativeTime: formatRelativeTime(item.created_at, t),
            isAnswered: item.is_answered,
            isUnderReview: underReview,
            content: item.content,
            prayedCount: item.prayed_count,
            encouragedCount: item.encouraged_count,
            hasPrayed,
            hasEncouraged,
          })}
          accessibilityHint={
            isOwner
              ? t('prayer.ownerLongPressHint')
              : isLeader
                ? t('prayer.leaderLongPressHint')
                : undefined
          }
          accessibilityActions={[
            { name: 'prayed', label: t('prayer.prayed') },
            { name: 'encouraged', label: t('prayer.encouraged') },
            ...(hasActions ? [{ name: 'moreActions', label: t('prayer.moreActions') }] : []),
          ]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName;
            if (action === 'prayed' || action === 'encouraged') {
              void handleInteraction(item.id, action);
            } else if (action === 'moreActions') {
              handleShowActions(confirmed);
            }
          }}
        >
          {/* Card header: avatar + meta */}
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.accentPrimary + '25' }]}>
              <Text style={[styles.avatarInitial, { color: colors.accentPrimary }]}>
                {avatarInitial}
              </Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={[styles.displayName, { color: colors.primaryText }]}>{displayName}</Text>
              <Text style={[styles.timestamp, { color: colors.secondaryText }]}>
                {formatRelativeTime(item.created_at, t)}
              </Text>
            </View>
            {item.is_answered && (
              <View style={[styles.answeredBadge, { backgroundColor: colors.success + '25' }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.onSuccessSoft} />
                <Text style={[styles.answeredText, { color: colors.onSuccessSoft }]}>
                  {t('prayer.answered')}
                </Text>
              </View>
            )}
            {underReview ? (
              <View style={[styles.answeredBadge, { backgroundColor: colors.cardBorder + '80' }]}>
                <Ionicons name="eye-off-outline" size={14} color={colors.secondaryText} />
                <Text style={[styles.answeredText, { color: colors.secondaryText }]}>
                  {t('prayer.underReview')}
                </Text>
              </View>
            ) : null}
            {/* A visible way to report or block, not only a long press (Guideline 1.2). */}
            {hasActions ? (
              <TouchableOpacity
                style={styles.moreButton}
                onPress={() => handleShowActions(confirmed)}
                accessibilityRole="button"
                accessibilityLabel={t('prayer.moreActions')}
                hitSlop={spacing.sm}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            ) : null}
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
              onPress={() => void handleInteraction(item.id, 'prayed')}
              accessibilityLabel={t('prayer.prayedCount', { count: item.prayed_count })}
              accessibilityRole="button"
              accessibilityState={{ selected: hasPrayed }}
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
              onPress={() => void handleInteraction(item.id, 'encouraged')}
              accessibilityLabel={t('prayer.encouragedCount', { count: item.encouraged_count })}
              accessibilityRole="button"
              accessibilityState={{ selected: hasEncouraged }}
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
                {t('prayer.encouraged')}{' '}
                {item.encouraged_count > 0 ? `(${item.encouraged_count})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [
      actionsFor,
      colors,
      currentUserId,
      handleInteraction,
      handleShowActions,
      isLeader,
      pendingInteractions,
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
          accessibilityRole="button"
        >
          <Text style={[styles.signInPromptButtonText, { color: colors.onAccent }]}>
            {t('auth.signIn')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
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
          <Text
            accessibilityRole="header"
            style={[styles.headerTitle, { color: colors.primaryText }]}
          >
            {t('prayer.title')}
          </Text>
          {/* Two lines: the group name is not repeated anywhere else on the wall. */}
          <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]} numberOfLines={2}>
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
            accessibilityRole="button"
          >
            <Text style={[styles.signInInlineButtonText, { color: colors.onAccent }]}>
              {t('auth.signIn')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Submit bar */}
      <View
        style={[
          styles.submitBar,
          { backgroundColor: colors.cardBackground, borderBottomColor: colors.cardBorder },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            {
              color: colors.primaryText,
              backgroundColor: colors.background,
              borderColor: colors.controlBorder,
            },
          ]}
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
          <Text
            style={[styles.charCount, styles.charCountTabular, { color: colors.secondaryText }]}
          >
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
                isSignedIn && submitText.trim().length > 0 ? colors.onAccent : colors.secondaryText
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
            {offline ? t('common.offlineTryAgain') : t('common.somethingWentWrong')}
          </Text>
          {/* The offline message already asks the reader to try again. */}
          {offline ? null : (
            <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
              {t('common.tryAgain')}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.errorRetryButton, { backgroundColor: colors.accentPrimary }]}
            onPress={() => {
              setIsLoading(true);
              void loadRequests();
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
            { paddingBottom: contentClearance },
          ]}
          ListEmptyComponent={ListEmptyComponent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator
                style={styles.loadingMore}
                color={colors.secondaryText}
                accessibilityLabel={t('common.loading')}
              />
            ) : null
          }
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

      <PrayerReportSheet
        key={reportTarget?.id ?? 'closed'}
        visible={reportTarget !== null}
        isSubmitting={isReporting}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitReport}
      />
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
    textAlign: 'center',
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
    borderWidth: 1,
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
  loadingMore: {
    paddingVertical: spacing.md,
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
  moreButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeredText: {
    ...typography.micro,
    fontWeight: '600',
  },
  content: {
    ...typography.body,
    lineHeight: 22,
  },
  // Wraps so the pills drop to a second line at large text sizes instead of
  // running past the card edge.
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
