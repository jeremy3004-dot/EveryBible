import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { gatherFoundations } from '../../data/gatherFoundations';
import { gatherTopicCategories } from '../../data/gatherTopics';
import { useGatherStore } from '../../stores/gatherStore';
import type { LearnStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<LearnStackParamList, 'GatherHome'>;

type ActiveTab = 'foundations' | 'topics';

export function GatherScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { width: screenWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<ActiveTab>('foundations');

  const infoBannerDismissed = useGatherStore((state) => state.infoBannerDismissed);
  const dismissInfoBanner = useGatherStore((state) => state.dismissInfoBanner);
  const getCompletedCount = useGatherStore((state) => state.getCompletedCount);

  const topicCardWidth = (screenWidth - 2 * layout.screenPadding - spacing.sm) / 2;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Sub-tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('foundations')}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'foundations' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'foundations'
                ? { ...typography.bodyStrong, color: colors.primaryText }
                : { ...typography.body, color: colors.secondaryText },
            ]}
          >
            {t('gather.foundations')}
          </Text>
          {activeTab === 'foundations' && (
            <View style={[styles.tabUnderline, { backgroundColor: colors.accentPrimary }]} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('topics')}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'topics' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'topics'
                ? { ...typography.bodyStrong, color: colors.primaryText }
                : { ...typography.body, color: colors.secondaryText },
            ]}
          >
            {t('gather.topics')}
          </Text>
          {activeTab === 'topics' && (
            <View style={[styles.tabUnderline, { backgroundColor: colors.accentPrimary }]} />
          )}
        </TouchableOpacity>
      </View>

      {/* Foundations sub-tab */}
      {activeTab === 'foundations' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.foundationsContent, { padding: layout.screenPadding, gap: spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Dismissable info banner */}
          {!infoBannerDismissed && (
            <View
              style={[
                styles.infoBanner,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.infoBannerContent}>
                <Text style={[styles.infoBannerText, { color: colors.secondaryText }]}>
                  {t('gather.infoBanner')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismissInfoBanner}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Ionicons name="close-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          )}

          {/* Foundation cards */}
          {gatherFoundations.map((foundation, index) => {
            const completedCount = getCompletedCount(foundation.id);
            const isFirst = index === 0;

            return (
              <View key={foundation.id}>
                {isFirst && (
                  <Text
                    style={[styles.getStartedLabel, { color: colors.accentPrimary }]}
                  >
                    {t('gather.getStarted')}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('FoundationDetail', { foundationId: foundation.id })
                  }
                  activeOpacity={0.85}
                  style={[
                    styles.foundationCard,
                    isFirst
                      ? {
                          backgroundColor: colors.accentPrimary + '15',
                          borderColor: colors.accentPrimary + '40',
                        }
                      : {
                          backgroundColor: colors.cardBackground,
                          borderColor: colors.cardBorder,
                        },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={foundation.title}
                >
                  {/* Icon */}
                  <View
                    style={[
                      styles.foundationIconContainer,
                      { backgroundColor: colors.accentPrimary + '18' },
                    ]}
                  >
                    <Ionicons
                      name={foundation.iconName as React.ComponentProps<typeof Ionicons>['name']}
                      size={24}
                      color={colors.accentPrimary}
                    />
                  </View>

                  {/* Content */}
                  <View style={styles.foundationCardContent}>
                    <Text style={[styles.foundationNumber, { color: colors.secondaryText }]}>
                      {`Foundations ${foundation.number}`}
                    </Text>
                    <Text style={[styles.foundationTitle, { color: colors.primaryText }]}>
                      {foundation.title}
                    </Text>
                  </View>

                  {/* Progress */}
                  <Text style={[styles.foundationProgress, { color: colors.secondaryText }]}>
                    {`${completedCount}/${foundation.lessons.length}`}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Topics sub-tab */}
      {activeTab === 'topics' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.topicsContent, { padding: layout.screenPadding, gap: spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Topics dismissable info banner */}
          {!infoBannerDismissed && (
            <View
              style={[
                styles.infoBanner,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.infoBannerContent}>
                <Text style={[styles.infoBannerText, { color: colors.secondaryText }]}>
                  {t('gather.topicsBanner')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismissInfoBanner}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Ionicons name="close-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          )}

          {/* Category sections */}
          {gatherTopicCategories.map((category) => (
            <View key={category.id}>
              <Text style={[styles.categoryHeader, { color: colors.primaryText }]}>
                {category.name}
              </Text>
              <View style={styles.topicsGrid}>
                {category.topics.map((topic) => {
                  const completedCount = getCompletedCount(topic.id);
                  return (
                    <TouchableOpacity
                      key={topic.id}
                      onPress={() =>
                        navigation.navigate('FoundationDetail', { foundationId: topic.id })
                      }
                      activeOpacity={0.85}
                      style={[
                        styles.topicCard,
                        {
                          width: topicCardWidth,
                          backgroundColor: colors.cardBackground,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={topic.title}
                    >
                      <View
                        style={[
                          styles.topicIconContainer,
                          { backgroundColor: colors.accentPrimary + '18' },
                        ]}
                      >
                        <Ionicons
                          name={topic.iconName as React.ComponentProps<typeof Ionicons>['name']}
                          size={20}
                          color={colors.accentPrimary}
                        />
                      </View>
                      <Text
                        style={[styles.topicTitle, { color: colors.primaryText }]}
                        numberOfLines={2}
                      >
                        {topic.title}
                      </Text>
                      <Text style={[styles.topicProgress, { color: colors.secondaryText }]}>
                        {`${completedCount}/${topic.lessonCount}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Sub-tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  tabText: {
    textAlign: 'center',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  // Scroll views
  scrollView: {
    flex: 1,
  },
  foundationsContent: {
    paddingBottom: spacing.xxxl,
  },
  topicsContent: {
    paddingBottom: spacing.xxxl,
  },
  // Info banner
  infoBanner: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerText: {
    ...typography.body,
    lineHeight: 21,
  },
  // Foundation cards
  getStartedLabel: {
    ...typography.micro,
    marginBottom: spacing.xs,
  },
  foundationCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  foundationIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundationCardContent: {
    flex: 1,
    gap: 2,
  },
  foundationNumber: {
    ...typography.micro,
  },
  foundationTitle: {
    ...typography.bodyStrong,
  },
  foundationProgress: {
    ...typography.label,
  },
  // Topics
  categoryHeader: {
    ...typography.cardTitle,
    marginBottom: spacing.sm,
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  topicCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  topicIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTitle: {
    ...typography.label,
    textAlign: 'center',
  },
  topicProgress: {
    ...typography.micro,
  },
});
