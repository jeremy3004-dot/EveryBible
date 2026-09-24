import { StyleSheet } from 'react-native';
import { layout, radius, spacing } from '../../../design/system';

/** Styles more than one part of the reader draws with. */
export const readerSharedStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  feedbackModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  audioShareBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  feedbackModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  feedbackSentimentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackErrorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  feedbackActionButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  feedbackActionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
