import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById } from '../../constants/books';
import {
  downloadAudioBook,
  downloadAudioTranslation,
  getChapterAudioFileUri,
  getDownloadedChapterAudioUri,
  type AudioFileSystemAdapter,
} from './audioDownloadService';

const createFileSystemDouble = () => {
  const files = new Set<string>();
  const directories = new Set<string>();
  const downloads: Array<{ from: string; to: string }> = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async (directoryUri) => {
      directories.add(directoryUri);
    },
    fileExists: async (fileUri) => files.has(fileUri),
    downloadFile: async (from, to) => {
      downloads.push({ from, to });
      files.add(to);
    },
  };

  return { fileSystem, files, directories, downloads };
};

test('getDownloadedChapterAudioUri returns a local file when it has been downloaded', async () => {
  const { fileSystem, files } = createFileSystemDouble();
  const fileUri = getChapterAudioFileUri('bsb', 'JHN', 3);
  files.add(fileUri);

  const localUri = await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem);

  assert.equal(localUri, fileUri);
});

test('downloadAudioBook downloads each chapter once and creates the book directory', async () => {
  const { fileSystem, directories, downloads } = createFileSystemDouble();
  const philemon = getBookById('PHM');

  assert.ok(philemon);

  const result = await downloadAudioBook({
    translationId: 'bsb',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
  });

  assert.equal(result.bookId, 'PHM');
  assert.equal(downloads.length, 1);
  assert.equal(directories.size, 1);
  assert.deepEqual(downloads[0], {
    from: 'https://audio.test/PHM/1.mp3',
    to: getChapterAudioFileUri('bsb', 'PHM', 1),
  });
});

test('downloadAudioTranslation returns every fully-downloaded book id in order', async () => {
  const { fileSystem, downloads } = createFileSystemDouble();
  const selectedBooks = ['2JN', '3JN']
    .map((bookId) => getBookById(bookId))
    .filter((book) => book !== undefined);

  const result = await downloadAudioTranslation({
    translationId: 'bsb',
    books: selectedBooks,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
  });

  assert.deepEqual(result.downloadedBookIds, ['2JN', '3JN']);
  assert.equal(downloads.length, 2);
});
