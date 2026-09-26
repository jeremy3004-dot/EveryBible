import { memo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// Drawn on a 24pt grid with one stroke weight for both shapes, so swapping play
// for pause never changes how heavy the glyph looks.
const VIEWBOX = '0 0 24 24';
export const OUTLINED_GLYPH_STROKE_WIDTH = 1.8;

// A triangle whose three corners are rounded, optically centred (its centroid,
// not its bounding box, sits on the middle of the grid).
const PLAY_PATH =
  'M8.2 5.9v12.2c0 1 1.1 1.6 1.9 1l8.9-6.1c.7-.5.7-1.5 0-2L10.1 4.9c-.8-.6-1.9 0-1.9 1z';

interface OutlinedPlayPauseGlyphProps {
  /** Pause bars while playing, the play triangle otherwise. */
  playing: boolean;
  size: number;
  color: string;
}

/**
 * The player's play/pause mark: two hollow rounded bars or a hollow rounded
 * triangle, stroked in `color`. Decorative only — the button around it carries
 * the label and the press.
 */
export const OutlinedPlayPauseGlyph = memo(function OutlinedPlayPauseGlyph({
  playing,
  size,
  color,
}: OutlinedPlayPauseGlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      fill="none"
      testID={playing ? 'outlined-glyph-pause' : 'outlined-glyph-play'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {playing ? (
        <>
          <Rect
            x={6.6}
            y={5.2}
            width={3.6}
            height={13.6}
            rx={1.4}
            stroke={color}
            strokeWidth={OUTLINED_GLYPH_STROKE_WIDTH}
          />
          <Rect
            x={13.8}
            y={5.2}
            width={3.6}
            height={13.6}
            rx={1.4}
            stroke={color}
            strokeWidth={OUTLINED_GLYPH_STROKE_WIDTH}
          />
        </>
      ) : (
        <Path
          d={PLAY_PATH}
          stroke={color}
          strokeWidth={OUTLINED_GLYPH_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
});
