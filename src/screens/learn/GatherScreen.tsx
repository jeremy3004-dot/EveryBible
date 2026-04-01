import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
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
import { gatherFoundations, FOUNDATION_TITLE_KEYS } from '../../data/gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_CATEGORY_NAME_KEYS,
  WISDOM_TITLE_KEYS,
} from '../../data/gatherWisdom';
import { gatherIconImages } from '../../data/gatherIcons';
import { useGatherStore } from '../../stores/gatherStore';
import type { LearnStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<LearnStackParamList, 'GatherHome'>;

type ActiveTab = 'foundations' | 'wisdom';


export function GatherScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { width: screenWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<ActiveTab>('foundations');

  const getCompletedCount = useGatherStore((state) => state.getCompletedCount);

  const wisdomCardWidth = (screenWidth - 2 * layout.screenPadding - spacing.sm) / 2;

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
          onPress={() => setActiveTab('wisdom')}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'wisdom' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'wisdom'
                ? { ...typography.bodyStrong, color: colors.primaryText }
                : { ...typography.body, color: colors.secondaryText },
            ]}
          >
            {t('gather.wisdom')}
          </Text>
          {activeTab === 'wisdom' && (
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
                  accessibilityLabel={FOUNDATION_TITLE_KEYS[foundation.id] ? t(FOUNDATION_TITLE_KEYS[foundation.id]) : foundation.title}
                >
                  {/* Icon */}
                  <View
                    style={[
                      styles.foundationIconContainer,
                      foundation.iconImage && gatherIconImages[foundation.iconImage]
                        ? undefined
                        : { backgroundColor: colors.accentPrimary + '18' },
                    ]}
                  >
                    {foundation.iconImage && gatherIconImages[foundation.iconImage] ? (
                      <Image
                        source={gatherIconImages[foundation.iconImage]}
                        style={styles.foundationIconImage}
                      />
                    ) : (
                      <Ionicons
                        name={foundation.iconName as React.ComponentProps<typeof Ionicons>['name']}
                        size={24}
                        color={colors.accentPrimary}
                      />
                    )}
                  </View>

                  {/* Content */}
                  <View style={styles.foundationCardContent}>
                    <Text style={[styles.foundationNumber, { color: colors.secondaryText }]}>
                      {t('gather.foundationLabel', { number: foundation.number })}
                    </Text>
                    <Text style={[styles.foundationTitle, { color: colors.primaryText }]}>
                      {FOUNDATION_TITLE_KEYS[foundation.id] ? t(FOUNDATION_TITLE_KEYS[foundation.id]) : foundation.title}
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

      {/* Wisdom sub-tab */}
      {activeTab === 'wisdom' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.wisdomContent, { padding: layout.screenPadding, gap: spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >


          {/* Category sections */}
          {gatherWisdomCategories.map((category) => (
            <View key={category.id}>
              <View style={styles.categoryHeaderRow}>
                {category.iconImage && gatherIconImages[category.iconImage] && (
                  <Image
                    source={gatherIconImages[category.iconImage]}
                    style={styles.categoryIconImage}
                  />
                )}
                <Text style={[styles.categoryHeader, { color: colors.primaryText }]}>
                  {WISDOM_CATEGORY_NAME_KEYS[category.id]
                    ? t(WISDOM_CATEGORY_NAME_KEYS[category.id])
                    : category.name}
                </Text>
              </View>
              <View style={styles.wisdomGrid}>
                {category.wisdoms.map((wisdom) => {
                  const completedCount = getCompletedCount(wisdom.id);
                  return (
                    <TouchableOpacity
                      key={wisdom.id}
                      onPress={() =>
                        navigation.navigate('FoundationDetail', { foundationId: wisdom.id })
                      }
                      activeOpacity={0.85}
                      style={[
                        styles.wisdomCard,
                        {
                          width: wisdomCardWidth,
                          backgroundColor: colors.cardBackground,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        WISDOM_TITLE_KEYS[wisdom.id]
                          ? t(WISDOM_TITLE_KEYS[wisdom.id])
                          : wisdom.title
                      }
                    >
                      <View
                        style={[
                          styles.wisdomIconContainer,
                          wisdom.iconImage && gatherIconImages[wisdom.iconImage]
                            ? undefined
                            : { backgroundColor: colors.accentPrimary + '18' },
                        ]}
                      >
                        {wisdom.iconImage && gatherIconImages[wisdom.iconImage] ? (
                          <Image
                            source={gatherIconImages[wisdom.iconImage]}
                            style={styles.wisdomIconImage}
                          />
                        ) : (
                          <Ionicons
                            name={wisdom.iconName as React.ComponentProps<typeof Ionicons>['name']}
                            size={20}
                            color={colors.accentPrimary}
                          />
                        )}
                      </View>
                      <Text
                        style={[styles.wisdomTitle, { color: colors.primaryText }]}
                        numberOfLines={2}
                      >
                        {WISDOM_TITLE_KEYS[wisdom.id] ? t(WISDOM_TITLE_KEYS[wisdom.id]) : wisdom.title}
                      </Text>
                      <Text style={[styles.wisdomProgress, { color: colors.secondaryText }]}>
                        {`${completedCount}/${wisdom.lessonCount}`}
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
  wisdomContent: {
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
    overflow: 'hidden',
  },
  foundationIconImage: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
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
  // Wisdom
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryIconImage: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
  },
  categoryHeader: {
    ...typography.cardTitle,
  },
  wisdomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wisdomCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  wisdomIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wisdomIconImage: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
  },
  wisdomTitle: {
    ...typography.label,
    textAlign: 'center',
  },
  wisdomProgress: {
    ...typography.micro,
  },
});
