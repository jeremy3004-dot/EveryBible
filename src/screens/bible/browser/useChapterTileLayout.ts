import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { layout, spacing } from '../../../design/system';
import { getChapterTileLayout } from '../chapterTileLayout';
import { estimateChapterPanelWidth, measuredChapterPanelWidth } from './bibleBrowserModel';

/** Inset of the expanded book's chapter panel; the tile maths subtracts it. */
export const CHAPTER_GRID_HORIZONTAL_INSET = spacing.xs;

export interface ChapterTileSizeStyle {
  width: number;
  height: number;
}

/**
 * The expanded book's chapter tiles share the panel width evenly. The window
 * gives a first estimate (list padding plus the panel's own inset); the panel's
 * measured width replaces it once laid out.
 */
export function useChapterTileLayout(): {
  tileSizeStyle: ChapterTileSizeStyle;
  onPanelLayout: (event: LayoutChangeEvent) => void;
} {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const panelWidth =
    measuredWidth ??
    estimateChapterPanelWidth(windowWidth, layout.screenPadding, CHAPTER_GRID_HORIZONTAL_INSET);
  const tiles = useMemo(() => getChapterTileLayout(panelWidth, fontScale), [panelWidth, fontScale]);
  const tileSizeStyle = useMemo(
    () => ({ width: tiles.tileSize, height: tiles.tileSize }),
    [tiles.tileSize]
  );
  const onPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const width = measuredChapterPanelWidth(
      event.nativeEvent.layout.width,
      CHAPTER_GRID_HORIZONTAL_INSET
    );
    if (width !== null) {
      setMeasuredWidth(width);
    }
  }, []);

  return { tileSizeStyle, onPanelLayout };
}
