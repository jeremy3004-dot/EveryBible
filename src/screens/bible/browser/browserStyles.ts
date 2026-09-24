import { StyleSheet } from 'react-native';
import { typography } from '../../../design/system';

/** Styles more than one browser section uses. */
export const browserStyles = StyleSheet.create({
  // Books and chapters with no content in the current translation.
  unavailable: {
    opacity: 0.45,
  },
  // Search result cards and the reference jump card share their heading row.
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultReference: {
    ...typography.label,
  },
});
