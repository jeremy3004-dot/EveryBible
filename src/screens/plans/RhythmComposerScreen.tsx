import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { useReadingPlansStore } from '../../stores';
import { listReadingPlans } from '../../services/plans/readingPlanService';
import type { ReadingPlan } from '../../services/plans/types';
import type { RhythmComposerScreenProps } from '../../navigation/types';

interface PlanRowModel {
  plan: ReadingPlan;
  title: string;
  isSelected: boolean;
  isEnrolled: boolean;
  isCompleted: boolean;
  blockedByAnotherRhythm: boolean;
  currentRhythmTitle: string | null;
}

function PlanStatusPill({
  label,
  colors,
  variant = 'neutral',
}: {
  label: string;
  colors: ThemeColors;
  variant?: 'neutral' | 'selected' | 'blocked' | 'success';
}) {
  const backgroundColor =
    variant === 'selected'
      ? colors.accentPrimary
      : variant === 'blocked'
        ? colors.cardBorder
        : variant === 'success'
          ? colors.success
          : colors.background;
  const borderColor =
    variant === 'neutral' ? colors.cardBorder : variant === 'blocked' ? colors.cardBorder : backgroundColor;
  const textColor =
    variant === 'selected' || variant === 'success' ? colors.cardBackground : colors.secondaryText;

  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]}>
      <Text style={[styles.pillLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SelectedPlanRow({
  item,
  title,
  colors,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: PlanRowModel;
  title: string;
  colors: ThemeColors;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={[styles.selectedRow, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      <View style={styles.selectedRowBody}>
        <Text style={[styles.planTitle, { color: colors.primaryText }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.planMetaRow}>
          <PlanStatusPill label={`${item.plan.duration_days}d`} colors={colors} />
          {item.currentRhythmTitle ? (
            <PlanStatusPill label={item.currentRhythmTitle} colors={colors} variant="selected" />
          ) : null}
        </View>
      </View>

      <View style={styles.reorderActions}>
        <TouchableOpacity
          onPress={onMoveUp}
          disabled={!item.isSelected}
          accessibilityRole="button"
          accessibilityLabel={t('common.moveUp', { defaultValue: 'Move up' })}
          style={[
            styles.iconButton,
            { borderColor: colors.cardBorder, backgroundColor: colors.background },
          ]}
        >
          <Ionicons name="chevron-up" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onMoveDown}
          disabled={!item.isSelected}
          accessibilityRole="button"
          accessibilityLabel={t('common.moveDown', { defaultValue: 'Move down' })}
          style={[
            styles.iconButton,
            { borderColor: colors.cardBorder, backgroundColor: colors.background },
          ]}
        >
          <Ionicons name="chevron-down" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('common.remove', { defaultValue: 'Remove' })}
          style={[
            styles.removeButton,
            { borderColor: colors.cardBorder, backgroundColor: colors.background },
          ]}
        >
          <Ionicons name="close" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AvailablePlanRow({
  item,
  title,
  colors,
  onPress,
}: {
  item: PlanRowModel;
  title: string;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  const statusLabel = item.isSelected
    ? t('readingPlans.selected', { defaultValue: 'Selected' })
    : item.blockedByAnotherRhythm
      ? item.currentRhythmTitle
      : item.isCompleted || !item.isEnrolled
        ? t('readingPlans.planUnavailableForRhythm')
        : t('readingPlans.availablePlans');

  const statusVariant: 'neutral' | 'selected' | 'blocked' | 'success' = item.isSelected
    ? 'selected'
    : item.blockedByAnotherRhythm
      ? 'blocked'
      : item.isCompleted || !item.isEnrolled
        ? 'neutral'
        : 'success';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={item.blockedByAnotherRhythm || item.isCompleted || !item.isEnrolled}
      activeOpacity={0.82}
      style={[
        styles.availableRow,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          opacity: item.blockedByAnotherRhythm || item.isCompleted || !item.isEnrolled ? 0.65 : 1,
        },
      ]}
    >
      <View style={styles.availableRowText}>
        <Text style={[styles.planTitle, { color: colors.primaryText }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.planSubtitle, { color: colors.secondaryText }]} numberOfLines={2}>
          {item.isCompleted
            ? t('readingPlans.planUnavailableForRhythm')
            : item.blockedByAnotherRhythm
              ? t('readingPlans.alreadyInAnotherRhythm')
              : item.isEnrolled
                ? t('readingPlans.rhythmDaySummary', {
                    defaultValue: `${item.plan.duration_days} days`,
                  })
                : t('readingPlans.planUnavailableForRhythm')}
        </Text>
        <View style={styles.planMetaRow}>
          <PlanStatusPill label={`${item.plan.duration_days}d`} colors={colors} />
          <PlanStatusPill label={statusLabel ?? ''} colors={colors} variant={statusVariant} />
        </View>
      </View>

      <View style={styles.checkbox}>
        <Ionicons
          name={item.isSelected ? 'checkmark-circle' : 'add-circle-outline'}
          size={22}
          color={item.isSelected ? colors.accentPrimary : colors.secondaryText}
        />
      </View>
    </TouchableOpacity>
  );
}

export function RhythmComposerScreen({ navigation, route }: RhythmComposerScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rhythmId = route.params?.rhythmId ?? null;
  const isEditing = Boolean(rhythmId);

  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draftState, setDraftState] = useState<{
    title?: string;
    selectedPlanIds?: string[];
  }>({});

  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);
  const rhythmsById = useReadingPlansStore((state) => state.rhythmsById);
  const createRhythm = useReadingPlansStore((state) => state.createRhythm);
  const updateRhythm = useReadingPlansStore((state) => state.updateRhythm);
  const deleteRhythm = useReadingPlansStore((state) => state.deleteRhythm);
  const getRhythmForPlan = useReadingPlansStore((state) => state.getRhythmForPlan);
  const currentRhythm = rhythmId ? rhythmsById[rhythmId] ?? null : null;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      const result = await listReadingPlans();
      if (mounted && result.success && result.data) {
        setAllPlans(result.data);
      }
      if (mounted) {
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const title = useMemo(
    () => draftState.title ?? currentRhythm?.title ?? '',
    [currentRhythm?.title, draftState.title]
  );
  const selectedPlanIds = useMemo(
    () => draftState.selectedPlanIds ?? currentRhythm?.planIds ?? [],
    [currentRhythm?.planIds, draftState.selectedPlanIds]
  );

  const planTitleById = useMemo(
    () =>
      Object.fromEntries(
        allPlans.map((plan) => [plan.id, t(plan.title_key as Parameters<typeof t>[0])])
      ) as Record<string, string>,
    [allPlans, t]
  );

  const planRows = useMemo<PlanRowModel[]>(
    () =>
      allPlans.map((plan) => {
        const progress = progressByPlanId[plan.id] ?? null;
        const ownerRhythm = getRhythmForPlan(plan.id);
        const isSelected = selectedPlanIds.includes(plan.id);
        const isEnrolled = progress !== null;
        const isCompleted = progress?.is_completed ?? false;
        const blockedByAnotherRhythm =
          Boolean(ownerRhythm) && ownerRhythm?.id !== currentRhythm?.id && !isSelected;

        return {
          plan,
          title: planTitleById[plan.id] ?? plan.title_key,
          isSelected,
          isEnrolled,
          isCompleted,
          blockedByAnotherRhythm,
          currentRhythmTitle: blockedByAnotherRhythm ? ownerRhythm?.title ?? null : null,
        };
      }),
    [allPlans, currentRhythm?.id, getRhythmForPlan, planTitleById, progressByPlanId, selectedPlanIds]
  );

  const selectedPlans = useMemo(
    () =>
      selectedPlanIds
        .map((planId) => {
          const plan = allPlans.find((item) => item.id === planId);
          if (!plan) {
            return null;
          }

          const row = planRows.find((item) => item.plan.id === planId);
          return row ?? null;
        })
        .filter((item): item is PlanRowModel => item !== null),
    [allPlans, planRows, selectedPlanIds]
  );

  const togglePlan = useCallback(
    (planId: string) => {
      setDraftState((current) => {
        const currentPlanIds = current.selectedPlanIds ?? currentRhythm?.planIds ?? [];

        if (currentPlanIds.includes(planId)) {
          return {
            ...current,
            selectedPlanIds: currentPlanIds.filter((id) => id !== planId),
          };
        }

        const row = planRows.find((item) => item.plan.id === planId);
        if (!row || row.blockedByAnotherRhythm || row.isCompleted || !row.isEnrolled) {
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            row?.blockedByAnotherRhythm
              ? t('readingPlans.alreadyInAnotherRhythm')
              : t('readingPlans.planUnavailableForRhythm')
          );
          return current;
        }

        return {
          ...current,
          selectedPlanIds: [...currentPlanIds, planId],
        };
      });
    },
    [currentRhythm?.planIds, planRows, t]
  );

  const moveSelectedPlan = useCallback((planId: string, direction: 'up' | 'down') => {
    setDraftState((current) => {
      const currentPlanIds = current.selectedPlanIds ?? currentRhythm?.planIds ?? [];
      const currentIndex = currentPlanIds.indexOf(planId);
      if (currentIndex < 0) {
        return current;
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= currentPlanIds.length) {
        return current;
      }

      const next = [...currentPlanIds];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, moved);
      return {
        ...current,
        selectedPlanIds: next,
      };
    });
  }, [currentRhythm?.planIds]);

  const handleDeleteRhythm = useCallback(() => {
    if (!currentRhythm) {
      return;
    }

    Alert.alert(
      t('readingPlans.deleteRhythmConfirmTitle'),
      t('readingPlans.deleteRhythmConfirmBody', { title: currentRhythm.title }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            deleteRhythm(currentRhythm.id);
            navigation.popToTop();
          },
        },
      ]
    );
  }, [currentRhythm, deleteRhythm, navigation, t]);

  const handleSave = useCallback(async () => {
    if (selectedPlanIds.length === 0) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('readingPlans.emptyRhythmPlans')
      );
      return;
    }

    setIsSaving(true);
    const input = {
      title,
      planIds: selectedPlanIds,
    };

    const result = currentRhythm
      ? updateRhythm(currentRhythm.id, input)
      : createRhythm(input);

    setIsSaving(false);

    if (!result.success || !result.rhythm) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), result.error ?? t('common.unexpectedError', { defaultValue: 'Something went wrong' }));
      return;
    }

    if (currentRhythm) {
      navigation.goBack();
      return;
    }

    navigation.replace('RhythmDetail', { rhythmId: result.rhythm.id });
  }, [createRhythm, currentRhythm, navigation, selectedPlanIds, title, t, updateRhythm]);

  const titleTrimmed = title.trim();
  const saveDisabled = selectedPlanIds.length === 0 || isSaving;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.backButton, { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.screenTitle, { color: colors.primaryText }]}>
              {isEditing ? t('readingPlans.editRhythm') : t('readingPlans.createRhythm')}
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.secondaryText }]}>
              {t('readingPlans.manageRhythm')}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{t('readingPlans.rhythmName')}</Text>
          <TextInput
            value={title}
            onChangeText={(nextTitle) =>
              setDraftState((current) => ({
                ...current,
                title: nextTitle,
              }))
            }
            placeholder={t('readingPlans.rhythmNamePlaceholder')}
            placeholderTextColor={colors.secondaryText + '88'}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.cardBorder,
                color: colors.primaryText,
              },
            ]}
            accessibilityLabel={t('readingPlans.rhythmName')}
            returnKeyType="done"
          />
          <Text style={[styles.helperText, { color: colors.secondaryText }]}>
            {titleTrimmed
              ? t('readingPlans.rhythmName', { defaultValue: 'Rhythm name' })
              : t('readingPlans.rhythmNamePlaceholder')}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
              {t('readingPlans.includedPlans')}
            </Text>
            <PlanStatusPill
              label={t('readingPlans.rhythmPlanCount', { count: selectedPlanIds.length })}
              colors={colors}
              variant="selected"
            />
          </View>

          {selectedPlans.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="layers-outline" size={24} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                {t('readingPlans.emptyRhythmPlans')}
              </Text>
            </View>
          ) : (
            <View style={styles.selectedList}>
              {selectedPlans.map((item) => (
                <SelectedPlanRow
                  key={item.plan.id}
                  item={item}
                  title={item.title}
                  colors={colors}
                  onMoveUp={() => moveSelectedPlan(item.plan.id, 'up')}
                  onMoveDown={() => moveSelectedPlan(item.plan.id, 'down')}
                  onRemove={() => togglePlan(item.plan.id)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
            {t('readingPlans.availablePlans')}
          </Text>
          <Text style={[styles.sectionNote, { color: colors.secondaryText }]}>
            {t('readingPlans.planUnavailableForRhythm')}
          </Text>

          <View style={styles.availableList}>
            {planRows.map((item) => {
              if (selectedPlanIds.includes(item.plan.id)) {
                return null;
              }

              return (
                <AvailablePlanRow
                  key={item.plan.id}
                  item={item}
                  title={item.title}
                  colors={colors}
                  onPress={() => togglePlan(item.plan.id)}
                />
              );
            })}
          </View>
        </View>

        {isEditing ? (
          <TouchableOpacity
            onPress={handleDeleteRhythm}
            accessibilityRole="button"
            style={[styles.destructiveButton, { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground }]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={[styles.destructiveLabel, { color: colors.error }]}>
              {t('readingPlans.deleteRhythm')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: spacing.md + insets.bottom,
            backgroundColor: colors.background,
            borderTopColor: colors.cardBorder,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          style={[styles.secondaryButton, { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground }]}
        >
          <Text style={[styles.secondaryButtonLabel, { color: colors.primaryText }]}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saveDisabled}
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            {
              backgroundColor: saveDisabled ? colors.cardBorder : colors.accentPrimary,
            },
          ]}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.cardBackground} />
          ) : (
            <Text style={[styles.primaryButtonLabel, { color: colors.cardBackground }]}>
              {isEditing ? t('common.save', { defaultValue: 'Save' }) : t('common.create', { defaultValue: 'Create' })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  screenTitle: {
    ...typography.screenTitle,
  },
  screenSubtitle: {
    ...typography.body,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.cardTitle,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  helperText: {
    ...typography.micro,
  },
  sectionNote: {
    ...typography.micro,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  selectedList: {
    gap: spacing.md,
  },
  selectedRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  selectedRowBody: {
    flex: 1,
    gap: spacing.sm,
  },
  availableList: {
    gap: spacing.md,
  },
  availableRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  availableRowText: {
    flex: 1,
    gap: spacing.sm,
  },
  planTitle: {
    ...typography.bodyStrong,
  },
  planSubtitle: {
    ...typography.body,
  },
  planMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillLabel: {
    ...typography.micro,
  },
  reorderActions: {
    gap: spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  destructiveLabel: {
    ...typography.label,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    ...typography.label,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    ...typography.label,
  },
});
