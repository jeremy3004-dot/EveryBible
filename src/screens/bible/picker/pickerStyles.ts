import { StyleSheet } from 'react-native';
import { layout, radius, spacing, typography } from '../../../design/system';

// Shared by the picker list, its rows, the languages list and the manage sheet, so every
// surface in the sheet draws rows, headings and progress the same way.

// The download rule keeps its original 3pt hairline; ProgressBar owns the
// radius, clipping, and the animated fill.
export const DOWNLOAD_PROGRESS_HEIGHT = 3;

export const pickerStyles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    paddingTop: layout.cardPadding,
    height: '82%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.sm,
  },
  modalHeaderText: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    ...typography.cardTitle,
  },
  catalogHydrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xs,
  },
  catalogHydrationText: {
    ...typography.caption,
  },
  translationList: {
    flex: 1,
    minHeight: 0,
  },
  translationListContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: layout.sectionGap,
  },
  searchInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  clearSearchButton: {
    marginLeft: spacing.xs,
  },
  preferenceRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: 10,
    // minHeight so the language name grows with Dynamic Type instead of clipping.
    minHeight: 34,
  },
  languagePillLabel: {
    ...typography.label,
  },
  // The single heading style in the sheet: one eyebrow, indented to the row text.
  sectionEyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  languageModeBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  languageModeBackText: {
    ...typography.label,
  },
  // Rows in a section share one outline and divide with hairlines, so a section
  // reads as one object rather than a stack of separate cards.
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 10,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manageRow: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  languageRow: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  selectedRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  // Three type levels only: title, meta (code and formats), description.
  rowTitle: {
    ...typography.rowTitle,
  },
  rowMeta: {
    ...typography.caption,
    marginTop: 1,
  },
  rowDescription: {
    ...typography.caption,
    opacity: 0.8,
  },
  rowValue: {
    ...typography.mono,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 24,
    justifyContent: 'flex-end',
  },
  rowProgress: {
    marginTop: 6,
  },
  rowProgressLabel: {
    ...typography.mono,
  },
  moreButton: {
    width: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  downloadProgressTrack: {
    marginTop: 6,
  },
});

// Outer corners only on the first/last row of a group; inner rows butt up
// against each other with a shared hairline.
export const groupRowStyle = StyleSheet.create({
  only: {
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 0,
  },
  middle: {
    borderBottomWidth: 0,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    marginBottom: spacing.xs,
  },
});
