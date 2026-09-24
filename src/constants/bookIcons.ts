export interface BookIconVector {
  viewBox: string;
  paths: readonly string[];
}

interface BookIconCatalog {
  icons: Record<string, BookIconVector>;
  bookToIcon: Record<string, string>;
}

// The vector catalog is ~290 KB of path strings. The `constants` barrel re-exports
// this module, so a static import put the whole table into every closure that
// touches the barrel: the onboarding flow, the Bible data warmup that runs after
// every launch, and most screens. Load it when the first book icon is drawn.
let bookIcons: Readonly<Record<string, BookIconVector>> | null = null;

function loadBookIcons(): Readonly<Record<string, BookIconVector>> {
  if (!bookIcons) {
    const catalog = require('./bookIconVectors.generated.json') as BookIconCatalog;
    // Numbered books share the same drawing object and stored paths.
    bookIcons = Object.fromEntries(
      Object.entries(catalog.bookToIcon).map(([bookId, iconId]) => [bookId, catalog.icons[iconId]])
    );
  }
  return bookIcons;
}

export function getBookIcon(bookId: string): BookIconVector | null {
  return loadBookIcons()[bookId.toUpperCase()] ?? null;
}
