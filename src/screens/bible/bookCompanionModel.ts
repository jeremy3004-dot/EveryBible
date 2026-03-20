import { getBibleBookExperienceContent, type BibleCompanionItem, type BibleCompanionModuleKind } from '../../data/bibleBookExperience';

export interface BookCompanionTarget {
  bookId: string;
  chapter: number;
  focusVerse?: number;
}

export interface BookCompanionCardModel {
  id: string;
  kind: BibleCompanionModuleKind;
  title: string;
  summary: string;
  meta: string;
  artworkVariant: string;
  actionLabel: string;
  state: 'ready' | 'coming-soon';
  target: BookCompanionTarget;
}

export interface BookCompanionSectionModel {
  id: string;
  kind: BibleCompanionModuleKind;
  title: string;
  description?: string;
  layout: 'carousel' | 'stack';
  items: BookCompanionCardModel[];
}

const companionSectionOrder: BibleCompanionModuleKind[] = [
  'passages',
  'devotionals',
  'plans',
  'playlists',
  'figures',
];

export function buildBookCompanionSections(bookId: string): BookCompanionSectionModel[] {
  const content = getBibleBookExperienceContent(bookId);
  if (!content) {
    return [];
  }

  return [...content.modules]
    .filter((module) => module.items.length > 0)
    .sort(
      (left, right) =>
        companionSectionOrder.indexOf(left.kind) - companionSectionOrder.indexOf(right.kind)
    )
    .map((module) => ({
      id: module.id,
      kind: module.kind,
      title: module.title,
      description: module.description,
      layout: module.kind === 'devotionals' ? 'stack' : 'carousel',
      items: module.items.map((item) => buildBookCompanionCard(item)),
    }));
}

export function buildBookCompanionEmptyState(bookName: string) {
  return {
    title: 'More companion content is coming',
    body: `${bookName} will gain guided passages, figures, and playlists in a future update.`,
  };
}

function buildBookCompanionCard(item: BibleCompanionItem): BookCompanionCardModel {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    meta: getCompanionItemMeta(item),
    artworkVariant: item.artworkVariant ?? 'river',
    actionLabel: item.actionLabel ?? 'Open chapter',
    state: item.state ?? 'ready',
    target: getCompanionItemTarget(item),
  };
}

function getCompanionItemMeta(item: BibleCompanionItem) {
  switch (item.kind) {
    case 'passages':
    case 'devotionals':
      return formatReference(item.reference);
    case 'plans':
      return `${item.days} days`;
    case 'playlists':
      return `${item.itemCount} chapters`;
    case 'figures':
      return item.role;
    default:
      return '';
  }
}

function getCompanionItemTarget(item: BibleCompanionItem): BookCompanionTarget {
  switch (item.kind) {
    case 'passages':
    case 'devotionals':
      return {
        bookId: item.reference.bookId,
        chapter: item.reference.chapter,
        focusVerse: item.reference.verseStart,
      };
    case 'plans':
    case 'playlists': {
      const entry = item.entries[0] ?? { bookId: 'GEN', chapter: 1 };
      return {
        bookId: entry.bookId,
        chapter: entry.chapter,
        focusVerse: entry.verseStart,
      };
    }
    case 'figures': {
      const entry = item.references[0] ?? { bookId: 'GEN', chapter: 1 };
      return {
        bookId: entry.bookId,
        chapter: entry.chapter,
        focusVerse: entry.verseStart,
      };
    }
    default:
      return { bookId: 'GEN', chapter: 1 };
  }
}

function formatReference(reference: {
  bookId: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}) {
  if (!reference.verseStart) {
    return `${reference.bookId} ${reference.chapter}`;
  }

  if (!reference.verseEnd || reference.verseEnd === reference.verseStart) {
    return `${reference.bookId} ${reference.chapter}:${reference.verseStart}`;
  }

  return `${reference.bookId} ${reference.chapter}:${reference.verseStart}-${reference.verseEnd}`;
}
