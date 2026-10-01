import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import {
  BibleAppSection,
  BibleAttribution,
  BibleLayout,
} from '../../../../components/bible/BibleLayout';
import {
  bibleBookBySlug,
  bibleChapterPath,
  parseChapterParam,
  type SiteBibleBook,
} from '../../../../lib/bible-books';
import {
  adjacentChapters,
  bibleBreadcrumbs,
  bibleBreadcrumbStructuredData,
  bibleChapterLabel,
  bibleChapterMetadata,
  prerenderedChapters,
  type ChapterRef,
} from '../../../../lib/bible-pages';
import { getBibleChapterText } from '../../../../lib/bible-text';
import {
  chapterBlocks,
  chapterDescription,
  footnoteLabel,
  type ChapterBlock,
  type ChapterInline,
  type ShardChapter,
} from '../../../../lib/bible-text-model';
import { serializeJsonLd } from '../../../../lib/site-metadata';
import '../../bible.css';

/**
 * About 150 of the most-read chapters are built ahead of time. Every other
 * chapter renders on its first request from its book's shard and is then
 * served from the cache like a static page, so the build stays short.
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return prerenderedChapters().map(({ book, chapter }) => ({
    book: book.slug,
    chapter: String(chapter),
  }));
}

interface ChapterRouteProps {
  params: Promise<{ book: string; chapter: string }>;
}

/** Null for an unknown book, a chapter outside it, or a non-canonical number ("03"). */
async function loadChapter(
  params: ChapterRouteProps['params']
): Promise<{ book: SiteBibleBook; chapter: number; text: ShardChapter } | null> {
  const { book: slug, chapter: value } = await params;
  const book = bibleBookBySlug(slug);
  const chapter = book ? parseChapterParam(book, value) : null;
  if (!book || !chapter) return null;
  const text = await getBibleChapterText(book.id, chapter);
  return text && { book, chapter, text };
}

export async function generateMetadata({ params }: ChapterRouteProps): Promise<Metadata> {
  const page = await loadChapter(params);
  // Without this the browser re-applies the homepage title and canonical over the 404.
  if (!page) notFound();
  return bibleChapterMetadata(page.book, page.chapter, chapterDescription(page.text));
}

/** Verse numbers carry the #v16 anchors; footnote markers link to their note and back. */
function Inlines({ parts }: { parts: readonly ChapterInline[] }) {
  return parts.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return part.text;
      case 'verse':
        return (
          <sup key={index} className="bible-verse" id={`v${part.number}`}>
            {part.number}
          </sup>
        );
      case 'note': {
        const label = footnoteLabel(part.index);
        return (
          <sup key={index} className="bible-note-ref">
            <a href={`#fn-${label}`} id={`fr-${label}`} aria-label={`Footnote ${label}`}>
              {label}
            </a>
          </sup>
        );
      }
      case 'break':
        return <br key={index} />;
    }
  });
}

function Block({ block }: { block: ChapterBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h2 className="bible-heading">{block.text}</h2>;
    case 'superscription':
      return (
        <p className="bible-superscription">
          <Inlines parts={block.parts} />
        </p>
      );
    case 'paragraph':
      return (
        <p>
          <Inlines parts={block.parts} />
        </p>
      );
    case 'poetry':
      return (
        <p className="bible-poetry">
          {/* The newline between lines is invisible between block-level lines,
              but keeps them apart in copied text, reader modes and search snippets. */}
          {block.lines.map((line, index) => (
            <Fragment key={index}>
              {index > 0 && '\n'}
              <span className="bible-line" data-indent={line.indent}>
                <Inlines parts={line.parts} />
              </span>
            </Fragment>
          ))}
        </p>
      );
  }
}

function PagerLink({ to, rel }: { to: ChapterRef; rel: 'prev' | 'next' }) {
  return (
    <a
      href={bibleChapterPath(to.book, to.chapter)}
      rel={rel}
      className={`bible-pager__link bible-pager__link--${rel}`}
    >
      <span className="bible-pager__hint">
        {rel === 'prev' ? 'Previous chapter' : 'Next chapter'}
      </span>{' '}
      <span className="bible-pager__label">{bibleChapterLabel(to.book, to.chapter)}</span>
    </a>
  );
}

export default async function BibleChapterPage({ params }: ChapterRouteProps) {
  const page = await loadChapter(params);
  if (!page) notFound();

  const { book, chapter, text } = page;
  const label = bibleChapterLabel(book, chapter);
  const trail = bibleBreadcrumbs(book, chapter);
  const { previous, next } = adjacentChapters(book, chapter);
  const notes = text.n ?? [];

  return (
    <BibleLayout
      trail={trail}
      eyebrow="Berean Standard Bible"
      title={label}
      intro={<a href="#app">Read and listen to {label} free in the EveryBible app</a>}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(bibleBreadcrumbStructuredData(trail)) }}
      />

      <article className="bible-text" aria-label={`${label}, Berean Standard Bible`}>
        {chapterBlocks(text).map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </article>

      {notes.length > 0 && (
        <section className="bible-notes" aria-labelledby="notes-heading">
          <h2 id="notes-heading">Footnotes</h2>
          <ol>
            {notes.map((note, index) => {
              const noteLabel = footnoteLabel(index);
              return (
                <li key={noteLabel} id={`fn-${noteLabel}`}>
                  <a
                    href={`#fr-${noteLabel}`}
                    className="bible-notes__label"
                    aria-label={`Back to footnote ${noteLabel}${note.v ? ` in verse ${note.v}` : ''}`}
                  >
                    {noteLabel}
                  </a>{' '}
                  {note.v > 0 && (
                    <span className="bible-notes__verse">
                      {chapter}:{note.v}
                    </span>
                  )}{' '}
                  {note.t}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <nav className="bible-pager" aria-label="Chapters">
        {previous && <PagerLink to={previous} rel="prev" />}
        {next && <PagerLink to={next} rel="next" />}
      </nav>

      <BibleAppSection subject={label} />
      <BibleAttribution />
    </BibleLayout>
  );
}
