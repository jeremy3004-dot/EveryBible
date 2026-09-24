import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import type { Verse } from '../../../types';
import { styles } from './readerStyles';

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

/** The chapter text over the listen page, following the audio verse by verse. */
export function FollowAlongTextSheet({
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
}
