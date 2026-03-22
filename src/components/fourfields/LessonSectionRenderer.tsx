import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';
import { LessonSection } from '../../types/course';

interface LessonSectionRendererProps {
  section: LessonSection;
  onScripturePress?: (reference: string) => void;
}

interface SectionAccentColors {
  discussion: string;
  activity: string;
  prayer: string;
}

export function LessonSectionRenderer({
  section,
  onScripturePress,
}: LessonSectionRendererProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Tibetan-inspired accent colors for different section types
  const sectionColors = {
    discussion: colors.accentSecondary, // Saffron Gold - community/discussion
    activity: colors.accentTertiary,    // Sky Blue - practice/clarity
    prayer: colors.accentPrimary,       // Tibetan Maroon - spiritual/prayer
  };

  switch (section.type) {
    case 'text':
      return <TextSection content={section.content} colors={colors} />;
    case 'scripture':
      return (
        <ScriptureSection
          content={section.content}
          reference={section.reference}
          onPress={onScripturePress}
          colors={colors}
          readInContextLabel={t('harvest.readInContext')}
        />
      );
    case 'bullets':
      return <BulletsSection content={section.content} items={section.items} colors={colors} />;
    case 'discussion':
      return (
        <DiscussionSection
          content={section.content}
          colors={colors}
          sectionColors={sectionColors}
          label={t('harvest.discussionLabel')}
        />
      );
    case 'activity':
      return (
        <ActivitySection
          content={section.content}
          colors={colors}
          sectionColors={sectionColors}
          label={t('harvest.practiceActivity')}
        />
      );
    case 'prayer':
      return (
        <PrayerSection
          content={section.content}
          colors={colors}
          sectionColors={sectionColors}
          label={t('harvest.prayerLabel')}
        />
      );
    default:
      return <TextSection content={section.content} colors={colors} />;
  }
}

function TextSection({ content, colors }: { content: string; colors: ThemeColors }) {
  return (
    <View style={styles.textContainer}>
      <Text style={[styles.text, { color: colors.primaryText }]}>{content}</Text>
    </View>
  );
}

interface ScriptureSectionProps {
  content: string;
  reference?: string;
  onPress?: (reference: string) => void;
  colors: ThemeColors;
  readInContextLabel: string;
}

function ScriptureSection({
  content,
  reference,
  onPress,
  colors,
  readInContextLabel,
}: ScriptureSectionProps) {
  return (
    <TouchableOpacity
      style={[styles.scriptureContainer, {
        backgroundColor: colors.accentPrimary + '15',
        borderLeftColor: colors.accentPrimary,
      }]}
      onPress={() => reference && onPress?.(reference)}
      activeOpacity={0.7}
      disabled={!onPress || !reference}
    >
      <View style={styles.scriptureHeader}>
        <Ionicons name="book-outline" size={16} color={colors.accentPrimary} />
        {reference && <Text style={[styles.reference, { color: colors.accentPrimary }]}>{reference}</Text>}
      </View>
      <Text style={[styles.scriptureText, { color: colors.primaryText }]}>{content}</Text>
      {reference && onPress && (
        <View style={styles.readInContext}>
          <Text style={[styles.readInContextText, { color: colors.accentPrimary }]}>
            {readInContextLabel}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accentPrimary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

interface BulletsSectionProps {
  content: string;
  items?: string[];
  colors: ThemeColors;
}

function BulletsSection({ content, items, colors }: BulletsSectionProps) {
  return (
    <View style={styles.bulletsContainer}>
      {content && <Text style={[styles.bulletsTitle, { color: colors.primaryText }]}>{content}</Text>}
      {items?.map((item, index) => (
        <View key={index} style={styles.bulletItem}>
          <View style={[styles.bullet, { backgroundColor: colors.accentPrimary }]} />
          <Text style={[styles.bulletText, { color: colors.primaryText }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DiscussionSection({
  content,
  colors,
  sectionColors,
  label,
}: {
  content: string;
  colors: ThemeColors;
  sectionColors: SectionAccentColors;
  label: string;
}) {
  return (
    <View style={[styles.discussionContainer, { backgroundColor: sectionColors.discussion + '15' }]}>
      <View style={styles.iconLabel}>
        <Ionicons name="chatbubbles-outline" size={18} color={sectionColors.discussion} />
        <Text style={[styles.iconLabelText, { color: colors.secondaryText }]}>{label}</Text>
      </View>
      <Text style={[styles.discussionText, { color: colors.primaryText }]}>{content}</Text>
    </View>
  );
}

function ActivitySection({
  content,
  colors,
  sectionColors,
  label,
}: {
  content: string;
  colors: ThemeColors;
  sectionColors: SectionAccentColors;
  label: string;
}) {
  return (
    <View style={[styles.activityContainer, { backgroundColor: sectionColors.activity + '15' }]}>
      <View style={styles.iconLabel}>
        <Ionicons name="hand-right-outline" size={18} color={sectionColors.activity} />
        <Text style={[styles.iconLabelText, { color: colors.secondaryText }]}>{label}</Text>
      </View>
      <Text style={[styles.activityText, { color: colors.primaryText }]}>{content}</Text>
    </View>
  );
}

function PrayerSection({
  content,
  colors,
  sectionColors,
  label,
}: {
  content: string;
  colors: ThemeColors;
  sectionColors: SectionAccentColors;
  label: string;
}) {
  return (
    <View style={[styles.prayerContainer, { backgroundColor: sectionColors.prayer + '15' }]}>
      <View style={styles.iconLabel}>
        <Ionicons name="heart-outline" size={18} color={sectionColors.prayer} />
        <Text style={[styles.iconLabelText, { color: colors.secondaryText }]}>{label}</Text>
      </View>
      <Text style={[styles.prayerText, { color: colors.primaryText }]}>{content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textContainer: {
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
  },
  scriptureContainer: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
  },
  scriptureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  reference: {
    fontSize: 14,
    fontWeight: '600',
  },
  scriptureText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  readInContext: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  readInContextText: {
    fontSize: 14,
  },
  bulletsContainer: {
    marginBottom: 16,
  },
  bulletsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    marginRight: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  discussionContainer: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  iconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  iconLabelText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  discussionText: {
    fontSize: 16,
    lineHeight: 24,
  },
  activityContainer: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  activityText: {
    fontSize: 16,
    lineHeight: 24,
  },
  prayerContainer: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  prayerText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
});
