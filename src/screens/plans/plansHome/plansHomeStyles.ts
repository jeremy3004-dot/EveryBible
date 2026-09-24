import { StyleSheet } from 'react-native';

/** The 16:10 cover frame on the two-up rhythm cards. */
export const RHYTHM_COVER_ASPECT = 16 / 10;
/** The square cover on every list row. */
export const ROW_COVER_SIZE = 52;

// At large text a row's trailing chip or Start button squeezed its title to a word
// per line; it moves under the title and meta instead, left-aligned with them.
export const belowTitleStyles = StyleSheet.create({
  trailing: {
    alignSelf: 'flex-start',
  },
});
