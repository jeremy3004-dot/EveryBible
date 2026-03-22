import React from 'react';
import { View, ScrollView, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import { FieldType } from '../../types/course';
import { FIELD_ORDER, fieldInfo } from '../../data/fourFieldsCourses';
import { FieldCard } from './FieldCard';

interface JourneyPathProps {
  currentField: FieldType;
  fieldProgress: Record<FieldType, number>;
  isFieldUnlocked: (field: FieldType) => boolean;
  onFieldPress: (field: FieldType) => void;
}

export function JourneyPath({
  currentField,
  fieldProgress,
  isFieldUnlocked,
  onFieldPress,
}: JourneyPathProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Calculate overall progress
  const totalProgress = FIELD_ORDER.reduce((sum, field) => sum + (fieldProgress[field] || 0), 0);
  const averageProgress = Math.round(totalProgress / FIELD_ORDER.length);

  // Count completed fields
  const completedFields = FIELD_ORDER.filter(f => fieldProgress[f] === 100).length;

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerLabel, { color: colors.secondaryText }]}>
            {t('harvest.progressLabel')}
          </Text>
          <Text style={[styles.title, { color: colors.primaryText }]}>
            {t('harvest.fiveFieldsTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {t('harvest.fiveFieldsSubtitle')}
          </Text>
        </View>

        {/* Premium progress indicator */}
        <View style={[styles.progressCard, { backgroundColor: colors.cardBackground }]}>
          <LinearGradient
            colors={[colors.accentPrimary + '15', colors.accentSecondary + '05', 'transparent']}
            style={styles.progressCardGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Text style={[styles.progressPercent, { color: colors.accentPrimary }]}>
            {averageProgress}
            <Text style={styles.progressPercentSign}>%</Text>
          </Text>
          <View style={styles.progressMeta}>
            <View style={styles.progressDots}>
              {FIELD_ORDER.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressDot,
                    {
                      backgroundColor: i < completedFields
                        ? colors.success
                        : i === completedFields
                          ? colors.accentPrimary
                          : colors.cardBorder,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>
              {t('harvest.fieldsComplete', { count: completedFields })}
            </Text>
          </View>
        </View>
      </View>

      {/* Journey cards with premium scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={154} // card width (140) + margin (14)
        snapToAlignment="start"
      >
        {FIELD_ORDER.map((fieldKey, index) => {
          const field = fieldInfo[fieldKey];
          const isUnlocked = isFieldUnlocked(fieldKey);
          const isCurrent = fieldKey === currentField;
          const progress = fieldProgress[fieldKey] || 0;

          return (
            <View key={field.id} style={styles.cardWrapper}>
              <FieldCard
                field={field}
                progress={progress}
                isUnlocked={isUnlocked}
                isCurrent={isCurrent}
                onPress={() => onFieldPress(fieldKey)}
              />
              {/* Field number indicator */}
              <View style={[styles.fieldNumber, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.fieldNumberText, { color: colors.secondaryText }]}>
                  {index + 1}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Minimal legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: colors.accentPrimary }]} />
          <Text style={[styles.legendText, { color: colors.secondaryText }]}>
            {t('harvest.active')}
          </Text>
        </View>
        <View style={[styles.legendDivider, { backgroundColor: colors.cardBorder }]} />
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.secondaryText }]}>
            {t('common.done')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerContent: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.7,
  },
  progressCard: {
    borderRadius: radius.lg,
    padding: 14,
    minWidth: 90,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  progressCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  progressPercent: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  progressPercentSign: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressMeta: {
    alignItems: 'center',
    marginTop: 6,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  cardWrapper: {
    position: 'relative',
  },
  fieldNumber: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldNumberText: {
    fontSize: 10,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  legendDivider: {
    width: 1,
    height: 12,
    marginHorizontal: 16,
  },
});
