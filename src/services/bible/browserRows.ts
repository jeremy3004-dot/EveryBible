import type { BibleBook, Testament } from '../../constants/books';

export type BibleBrowserRow =
  | {
      type: 'books';
      id: string;
      books: BibleBook[];
    }
  | {
      type: 'divider';
      id: string;
      testament: Testament;
    };

const chunkBooks = (books: BibleBook[]): BibleBrowserRow[] => {
  const rows: BibleBrowserRow[] = [];

  for (let index = 0; index < books.length; index += 2) {
    rows.push({
      type: 'books',
      id: `books-${books[index]?.id ?? index}`,
      books: books.slice(index, index + 2),
    });
  }

  return rows;
};

export const buildBibleBrowserRows = (books: BibleBook[]): BibleBrowserRow[] => {
  const oldTestamentBooks = books.filter((book) => book.testament === 'OT');
  const newTestamentBooks = books.filter((book) => book.testament === 'NT');

  return [
    ...chunkBooks(oldTestamentBooks),
    {
      type: 'divider',
      id: 'divider-NT',
      testament: 'NT',
    },
    ...chunkBooks(newTestamentBooks),
  ];
};
