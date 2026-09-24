import { memo } from 'react';
import { StyleSheet, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { radius, spacing, typography } from '../../../design/system';
import { FOLLOW_ALONG_VERSE_LINE_HEIGHT } from '../bibleReaderModel';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import type { Verse } from '../../../types';

export interface FollowAlongTextSheetProps {
  activeFollowAlongVerse: number | null;
  bookId: string;
  chapter: number;
  followAlongOffsetsRef: RefObject<Record<number, number>>;
  followAlongScrollViewRef: RefObject<ScrollView | null>;
  isShowingRouteChapter: boolean;
  setShowFollowAlongText: Dispatch<SetStateAction<boolean>>;
  showFollowAlongText: boolean;
  translationLabel: string;
  verses: Verse[];
}

/**
 * The chapter text over the listen page, following the audio verse by verse.
 * Memoized: it maps the whole chapter even while closed, and every prop is stable
 * across the reader's unrelated re-renders (audio status, sheets, selection).
 */
export const FollowAlongTextSheet = memo(function FollowAlongTextSheet({
  activeFollowAlongVerse,
  bookId,
  chapter,
  followAlongOffsetsRef,
  followAlongScrollViewRef,
  isShowingRouteChapter,
  setShowFollowAlongText,
  showFollowAlongText,
  translationLabel,
  verses,
}: FollowAlongTextSheetProps) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal
      visible={showFollowAlongText}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => setShowFollowAlongText(false)}
    >
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(200)}
        exiting={SlideOutDown.duration(250)}
        style={[styles.followAlongContainer, { backgroundColor: colors.bibleBackground }]}
      >
        <View
          style={[
            styles.followAlongHeader,
            {
              borderBottomColor: colors.bibleDivider,
              backgroundColor: colors.bibleBackground,
              paddingTop: safeInsets.top + spacing.md,
            },
          ]}
        >
          {/* Back to player — left */}
          <TouchableOpacity
            style={[
              styles.followAlongCloseButton,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={() => setShowFollowAlongText(false)}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color={colors.biblePrimaryText} />
            <Text style={[styles.followAlongCloseLabel, { color: colors.biblePrimaryText }]}>
              {t('bible.backToPlayer')}
            </Text>
          </TouchableOpacity>

          {/* Centered title */}
          <View style={styles.followAlongTitleCenter} pointerEvents="none">
            <Text style={[styles.followAlongEyebrow, { color: colors.bibleAccent }]}>
              {translationLabel}
            </Text>
            <Text style={[styles.followAlongTitle, { color: colors.biblePrimaryText }]}>
              {getTranslatedBookName(bookId, t)} {chapter}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={followAlongScrollViewRef}
          style={styles.followAlongScrollView}
          contentContainerStyle={styles.followAlongContent}
          showsVerticalScrollIndicator={false}
        >
          {verses.map((verse) => {
            const isActive = isShowingRouteChapter && verse.verse === activeFollowAlongVerse;

            return (
              <View
                key={verse.id}
                style={[styles.followAlongVerseRow]}
                onLayout={(event) => {
                  followAlongOffsetsRef.current[verse.verse] = event.nativeEvent.layout.y;
                }}
              >
                <View
                  style={[
                    styles.followAlongVerseIndicator,
                    {
                      backgroundColor: isActive ? colors.bibleAccent : 'transparent',
                    },
                  ]}
                />
                <View style={styles.followAlongVerseContent}>
                  {verse.heading ? (
                    <Text style={[styles.followAlongHeading, { color: colors.bibleSecondaryText }]}>
                      {verse.heading}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.followAlongVerseText,
                      {
                        color: isActive ? colors.biblePrimaryText : colors.bibleSecondaryText,
                      },
                    ]}
                  >
                    <Text style={[styles.followAlongVerseNumber, { color: colors.bibleAccent }]}>
                      {verse.verse}{' '}
                    </Text>
                    {verse.text}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  followAlongContainer: {
    flex: 1,
  },
  followAlongHeader: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  followAlongTitleCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  followAlongEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  followAlongTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  followAlongCloseButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 1,
  },
  followAlongCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  followAlongScrollView: {
    flex: 1,
  },
  followAlongContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  followAlongVerseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  followAlongVerseIndicator: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    minHeight: FOLLOW_ALONG_VERSE_LINE_HEIGHT,
  },
  followAlongVerseContent: {
    flex: 1,
    gap: 8,
  },
  followAlongHeading: {
    ...typography.readingHeading,
  },
  followAlongVerseText: {
    ...typography.readingBody,
    fontSize: 18,
    lineHeight: FOLLOW_ALONG_VERSE_LINE_HEIGHT,
  },
  followAlongVerseNumber: {
    ...typography.readingVerseNumber,
    fontSize: 12,
  },
});
