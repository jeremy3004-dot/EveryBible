export const CHAPTER_GRID_COLUMNS = 5;
export const CHAPTER_GRID_HORIZONTAL_PADDING = 72;
export const CHAPTER_GRID_ROW_GAP = 8;

export function getChapterGridItemSize(windowWidth: number) {
  return (windowWidth - CHAPTER_GRID_HORIZONTAL_PADDING) / CHAPTER_GRID_COLUMNS;
}

export function buildChapterGridRows(chapterCount: number) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => index + 1);
  const rows: number[][] = [];

  for (let index = 0; index < chapters.length; index += CHAPTER_GRID_COLUMNS) {
    rows.push(chapters.slice(index, index + CHAPTER_GRID_COLUMNS));
  }

  return rows;
}
