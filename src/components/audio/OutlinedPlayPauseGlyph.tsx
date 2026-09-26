import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

export interface OutlinedPlayPauseGlyphProps {
  playing: boolean;
  size: number;
  color: string;
}

// ~1.8 on a 24 grid, the same for both shapes so swapping them never jumps.
const STROKE_WIDTH = 1.8;
const PAUSE_BARS =
  'M7.5 5h1.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 17.5v-11A1.5 1.5 0 0 1 7.5 5z' +
  'M15 5h1.5A1.5 1.5 0 0 1 18 6.5v11a1.5 1.5 0 0 1-1.5 1.5H15a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 15 5z';
const PLAY_TRIANGLE =
  'M8 5.8v12.4a1.2 1.2 0 0 0 1.82 1.03l10.1-6.2a1.2 1.2 0 0 0 0-2.06l-10.1-6.2A1.2 1.2 0 0 0 8 5.8z';

/**
 * Stand-in for the player-bar lane's glyph, at the path and with the props of the
 * shared contract; the player-bar lane's version replaces this file. Hollow rounded
 * pause bars while playing, a hollow rounded triangle otherwise. Drawing only: the
 * caller supplies the touchable and its label.
 */
export const OutlinedPlayPauseGlyph = memo(function OutlinedPlayPauseGlyph({
  playing,
  size,
  color,
}: OutlinedPlayPauseGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={playing ? PAUSE_BARS : PLAY_TRIANGLE}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
});
