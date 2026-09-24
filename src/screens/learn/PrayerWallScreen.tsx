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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../../i18n/interfaceFormatting';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { lightHaptic, successHaptic } from '../../utils';
import { announceForAccessibility } from '../../utils/a11y';
import type { LearnStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';
import { useAuthStore } from '../../stores/authStore';
import * as prayerService from '../../services/prayer/prayerService';
import type { PrayerRequestWithCounts } from '../../services/prayer/prayerService';
import {
  isUnderReviewForViewer,
  prayerRequestActions,
  type PrayerReportReason,
  type PrayerWriteErrorCode,
} from '../../services/prayer/prayerModel';
import { PrayerReportSheet } from './PrayerReportSheet';
import {
  buildPrayerCardAccessibilityLabel,
  prayerInteractionAnnouncement,
} from './prayerCardAccessibility';

type ScreenRouteProp = RouteProp<LearnStackParamList, 'PrayerWall'>;
type NavigationProp = NativeStackNavigationProp<LearnStackParamList, 'PrayerWall'>;

// Tracks which request IDs the current user has prayed for / encouraged. Seeded from the
// server on every load and updated optimistically on tap.
interface LocalInteractions {
  prayed: Set<string>;
  encouraged: Set<string>;
}

const MAX_CHARS = 500;

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
  // The request whose report form is open, if any.
  const [reportTarget, setReportTarget] = useState<PrayerRequestWithCounts | null>(null);
  const [isReporting, setIsReporting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const isSignedIn = Boolean(currentUserId);

  const loadRequests = useCallback(async () => {
    const result = await prayerService.listPrayerRequests(groupId);
    if (result.success && result.data) {
      const loaded = result.data;
      setRequests(loaded);
      setLocalInteractions({
        prayed: new Set(loaded.filter((r) => r.viewer_prayed).map((r) => r.id)),
        encouraged: new Set(loaded.filter((r) => r.viewer_encouraged).map((r) => r.id)),
      });
      setLoadError(false);
    } else {
      // Distinguish a genuine load failure (offline / server error) from an
      // empty group so we never render "no prayers yet" over a fetch failure.
      setLoadError(true);
    }
  }, [groupId]);

  // isLoading starts true, so the first load needs no synchronous setState here. loadRequests
  // only sets state after its network call resolves, which the compiler rule cannot see.
  useEffect(() => {
    loadRequests().finally(() => setIsLoading(false)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadRequests]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadRequests();
    setIsRefreshing(false);
  }, [loadRequests]);

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

    const trimmed = submitText.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const result = await prayerService.createPrayerRequest(groupId, trimmed);

    if (result.success && result.data) {
      const newRequest: PrayerRequestWithCounts = {
        ...result.data,
        prayed_count: 0,
        encouraged_count: 0,
        viewer_prayed: false,
        viewer_encouraged: false,
      };
      setRequests((prev) => [newRequest, ...prev]);
      setSubmitText('');
      inputRef.current?.blur();
      successHaptic();
    } else {
      Alert.alert(t('common.error'), writeErrorMessage(result.code));
    }

    setIsSubmitting(false);
  }, [currentUserId, groupId, isSubmitting, submitText, t, writeErrorMessage]);

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
        announceForAccessibility(t('common.somethingWentWrong'));
        return;
      }
      // The pill changes only by fill and icon; say which way the toggle went.
      announceForAccessibility(prayerInteractionAnnouncement(t, type, !alreadyInteracted));
    },
    [currentUserId, localInteractions, t]
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
          } else {
            Alert.alert(t('common.error'), writeErrorMessage(result.code));
          }
        },
        'plain-text',
        request.content
      );
    },
    [t, writeErrorMessage]
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
      } else {
        Alert.alert(t('common.error'), t('common.somethingWentWrong'));
      }
    },
    [t]
  );

  const handleDelete = useCallback(
    (requestId: string) => {
      Alert.alert(t('common.delete'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const result = await prayerService.deletePrayerRequest(requestId);
            if (result.success) {
              setRequests((prev) => prev.filter((r) => r.id !== requestId));
            } else {
              Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            }
          },
        },
      ]);
    },
    [t]
  );

  const handleSubmitReport = useCallback(
    async (reason: PrayerReportReason, note: string) => {
      if (!reportTarget || isReporting) return;
      setIsReporting(true);
      const result = await prayerService.reportPrayerRequest(reportTarget.id, reason, note);
      setIsReporting(false);

      if (result.success) {
        // The server hides a reported request from the reporter; mirror that right away.
        setRequests((prev) => prev.filter((r) => r.id !== reportTarget.id));
        setReportTarget(null);
        Alert.alert(t('prayer.report'), t('prayer.reportSent'));
      } else {
        Alert.alert(
          t('common.error'),
          result.code === 'rate_limited'
            ? t('prayer.reportRateLimited')
            : t('common.somethingWentWrong')
        );
      }
    },
    [isReporting, reportTarget, t]
  );

  const handleBlock = useCallback(
    (request: PrayerRequestWithCounts) => {
      Alert.alert(t('prayer.blockTitle'), t('prayer.blockBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('prayer.blockAuthor'),
          style: 'destructive',
          onPress: async () => {
            const result = await prayerService.blockUser(request.user_id);
            if (result.success) {
              setRequests((prev) => prev.filter((r) => r.user_id !== request.user_id));
            } else {
              Alert.alert(t('common.error'), t('common.somethingWentWrong'));
            }
          },
        },
      ]);
    },
    [t]
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
    [actionsFor, handleBlock, handleDelete, handleEdit, handleMarkAnswered, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: PrayerRequestWithCounts }) => {
      const isOwner = item.user_id === currentUserId;
      const hasActions = actionsFor(item).length > 0;
      const underReview = isUnderReviewForViewer(item, isOwner);
      const hasPrayed = localInteractions.prayed.has(item.id);
      const hasEncouraged = localInteractions.encouraged.has(item.id);
      const displayName = isOwner
        ? (user?.displayName ?? t('prayer.you'))
        : t('prayer.groupMember');
      // Derive the avatar initial from the displayed name, never from the raw
      // user_id (a UUID whose first char is a meaningless hex digit).
      const avatarInitial = (displayName.trim().charAt(0) || '?').toUpperCase();

      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBackground }]}
          onLongPress={hasActions ? () => handleShowActions(item) : undefined}
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
              handleShowActions(item);
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
                onPress={() => handleShowActions(item)}
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
              onPress={() => handleInteraction(item.id, 'prayed')}
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
              onPress={() => handleInteraction(item.id, 'encouraged')}
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
            { paddingBottom: contentClearance },
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
