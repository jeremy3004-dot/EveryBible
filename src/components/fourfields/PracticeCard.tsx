import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

interface PracticeCardProps {
  activity: string;
  practiceCompleted: boolean;
  taughtCompleted: boolean;
  onPracticeComplete: () => void;
  onTaughtComplete: () => void;
}

export function PracticeCard({
  activity,
  practiceCompleted,
  taughtCompleted,
  onPracticeComplete,
  onTaughtComplete,
}: PracticeCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground }]}>
      <Text style={[styles.title, { color: colors.primaryText }]}>
        {t('harvest.weeklyPractice')}
      </Text>
      <Text style={[styles.activity, { color: colors.secondaryText }]}>{activity}</Text>

      <View style={styles.buttonsContainer}>
        {/* I Did It Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: colors.background,
              borderColor: colors.cardBorder,
            },
            practiceCompleted && {
              backgroundColor: colors.accentPrimary + '15',
              borderColor: colors.accentPrimary,
            },
          ]}
          onPress={onPracticeComplete}
          disabled={practiceCompleted}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.checkCircle,
              { backgroundColor: colors.cardBorder },
              practiceCompleted && { backgroundColor: colors.accentPrimary },
            ]}
          >
            {practiceCompleted ? (
              <Ionicons name="checkmark" size={16} color="#fff" />
            ) : (
              <View style={[styles.checkCircleEmpty, { backgroundColor: colors.secondaryText }]} />
            )}
          </View>
          <View style={styles.buttonTextContainer}>
            <Text
              style={[
                styles.buttonTitle,
                { color: colors.primaryText },
                practiceCompleted && { color: colors.accentPrimary },
              ]}
            >
              {practiceCompleted
                ? t('harvest.practiceDoneComplete')
                : t('harvest.practiceDone')}
            </Text>
            <Text style={[styles.buttonSubtitle, { color: colors.secondaryText }]}>
              {t('harvest.practiceDoneHint')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* I Taught This Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: colors.background,
              borderColor: colors.cardBorder,
            },
            taughtCompleted && {
              backgroundColor: colors.accentSecondary + '15',
              borderColor: colors.accentSecondary,
            },
          ]}
          onPress={onTaughtComplete}
          disabled={taughtCompleted}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.checkCircle,
              { backgroundColor: colors.accentSecondary + '20' },
              taughtCompleted && { backgroundColor: colors.accentSecondary },
            ]}
          >
            {taughtCompleted ? (
              <Ionicons name="checkmark" size={16} color="#fff" />
            ) : (
              <Ionicons name="people-outline" size={16} color={colors.accentSecondary} />
            )}
          </View>
          <View style={styles.buttonTextContainer}>
            <Text
              style={[
                styles.buttonTitle,
                { color: colors.primaryText },
                taughtCompleted && { color: colors.accentSecondary },
              ]}
            >
              {taughtCompleted
                ? t('harvest.taughtThisComplete')
                : t('harvest.taughtThis')}
            </Text>
            <Text style={[styles.buttonSubtitle, { color: colors.secondaryText }]}>
              {t('harvest.taughtThisHint')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Encouragement text */}
      {practiceCompleted && taughtCompleted && (
        <View style={[styles.encouragementContainer, { backgroundColor: colors.accentSecondary + '10' }]}>
          <Ionicons name="star" size={20} color={colors.accentSecondary} />
          <Text style={[styles.encouragementText, { color: colors.primaryText }]}>
            {t('harvest.encouragement222')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  activity: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  buttonsContainer: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleEmpty: {
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.3,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  buttonSubtitle: {
    fontSize: 13,
  },
  encouragementContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  encouragementText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
