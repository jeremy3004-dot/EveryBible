import { StyleSheet } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useLargeText } from '../../../hooks/useLargeText';
import { layout, radius, spacing, typography } from '../../../design/system';

/** Matches ListRow's own leading glyph so block rows line up with list rows. */
export const ROW_ICON_SIZE = 18;
export const ICON_STROKE = 2;
/** ListRow insets its separator past the glyph; blocks in the card must match. */
export const ROW_SEPARATOR_INSET = ROW_ICON_SIZE + spacing.md;

/**
 * The on/off colours every Settings switch shares. The off track is the only outline
 * an off switch has, so it takes the 3:1 control boundary rather than a translucent
 * tint of body text (1.6:1 light, 1.95:1 dark).
 */
export function useSettingSwitchColors() {
  const { colors } = useTheme();
  const offColor = colors.controlBorder;
  return {
    trackColor: { false: offColor, true: colors.accentPrimary },
    ios_backgroundColor: offColor,
    thumbColor: colors.cardBackground,
  };
}

/**
 * Cancel/Save pairs split a ~300pt modal in half; at large text sizes each label
 * wrapped inside its half, so the pair stacks (primary on top).
 */
export function useModalButtonsStyle() {
  const { isLargeText } = useLargeText();
  return [modalStyles.modalButtons, isLargeText && modalStyles.modalButtonsStacked];
}

/** The screen's grouped sections: an eyebrow over a card of rows. */
export const sectionStyles = StyleSheet.create({
  group: {
    marginBottom: spacing.xl,
  },
  groupEyebrow: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
  },
  groupCard: {
    paddingHorizontal: layout.cardPadding,
  },
});

/** The centred dialog every Settings modal is drawn in. */
export const modalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    ...typography.pageTitle,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  // column-reverse keeps Cancel (the first child) at the bottom, as stacked
  // system alerts do.
  modalButtonsStacked: {
    flexDirection: 'column-reverse',
  },
  modalButtonFlex: {
    flex: 1,
  },
  inlineError: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
});
