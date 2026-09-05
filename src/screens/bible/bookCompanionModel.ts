import type { TFunction } from 'i18next';
import { getTranslatedBookName } from '../../constants/books';
import {
  getBibleBookExperienceContent,
  type BibleCompanionItem,
  type BibleCompanionModuleKind,
} from '../../data/bibleBookExperience';

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
const hiddenCompanionSectionKinds: BibleCompanionModuleKind[] = ['passages', 'figures'];

export function buildBookCompanionSections(
  bookId: string,
  t?: TFunction
): BookCompanionSectionModel[] {
  const content = getBibleBookExperienceContent(bookId);
  if (!content) {
    return [];
  }

  return [...content.modules]
    .filter((module) => !hiddenCompanionSectionKinds.includes(module.kind))
    .filter((module) => module.items.length > 0)
    .sort(
      (left, right) =>
        companionSectionOrder.indexOf(left.kind) - companionSectionOrder.indexOf(right.kind)
    )
    .map((module) => ({
      id: module.id,
      kind: module.kind,
      title: t ? t(`interface.companions.${module.id}.title`) : module.title,
      description:
        t && module.description
          ? t(`interface.companions.${module.id}.description`)
          : module.description,
      layout: module.kind === 'devotionals' ? 'stack' : 'carousel',
      items: module.items.map((item) => buildBookCompanionCard(item, t)),
    }));
}

function buildBookCompanionCard(item: BibleCompanionItem, t?: TFunction): BookCompanionCardModel {
  return {
    id: item.id,
    kind: item.kind,
    title: t ? t(`interface.companions.${item.id}.title`) : item.title,
    summary: t ? t(`interface.companions.${item.id}.summary`) : item.summary,
    meta: getCompanionItemMeta(item, t),
    artworkVariant: item.artworkVariant ?? 'river',
    actionLabel: t
      ? item.actionLabel
        ? t(`interface.companions.${item.id}.actionLabel`)
        : t('common.continue')
      : (item.actionLabel ?? 'Open chapter'),
    state: item.state ?? 'ready',
    target: getCompanionItemTarget(item),
  };
}

function getCompanionItemMeta(item: BibleCompanionItem, t?: TFunction) {
  switch (item.kind) {
    case 'passages':
    case 'devotionals':
      return formatReference(item.reference, t);
    case 'plans':
      return t ? t('interface.daysShort', { count: item.days }) : `${item.days} days`;
    case 'playlists':
      return t
        ? t('readingPlans.chapterCount', { count: item.itemCount })
        : `${item.itemCount} chapters`;
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

function formatReference(
  reference: {
    bookId: string;
    chapter: number;
    verseStart?: number;
    verseEnd?: number;
  },
  t?: TFunction
) {
  const bookName = t ? getTranslatedBookName(reference.bookId, t) : reference.bookId;
  if (!reference.verseStart) {
    return `${bookName} ${reference.chapter}`;
  }

  if (!reference.verseEnd || reference.verseEnd === reference.verseStart) {
    return `${bookName} ${reference.chapter}:${reference.verseStart}`;
  }

  return `${bookName} ${reference.chapter}:${reference.verseStart}-${reference.verseEnd}`;
}
