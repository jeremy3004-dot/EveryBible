import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookById } from '../../constants/books';
import * as service from './audioDownloadService';

async function flush() {
  for (let i = 0; i < 80; i += 1) await Promise.resolve();
}

// Two collection runs of one translation (e.g. Old Testament, then whole Bible) share the
// translation job id, so the first run to finish must not mark the job completed while the
// other one is still transferring.
test('a finished collection run does not complete the shared job while another run is active', async () => {
  const jobs = new Map<string, service.AudioDownloadJobRecord>();
  const jobStore: service.AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (id) => jobs.get(id) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (id) => {
      jobs.delete(id);
    },
  };
  const releases = new Map<string, () => void>();
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    downloadFile: async (_from, _to, options) => {
      await new Promise<void>((resolve) => {
        releases.set(String(options?.bookId), resolve);
        options?.signal?.addEventListener('abort', () => resolve());
      });
      if (options?.signal?.aborted) throw new service.AudioDownloadCancelledError();
    },
  };
  const run = (bookIds: string[]) =>
    service.downloadAudioTranslation({
      translationId: 'overlap',
      books: bookIds.map((id) => {
        const book = getBookById(id);
        assert.ok(book);
        return book;
      }),
      fileSystem,
      jobStore,
      resolveRemoteAudio: async (_t, bookId, chapter) => ({
        url: `https://audio.test/${bookId}/${chapter}.mp3`,
        duration: 10,
      }),
    });

  const first = run(['PHM']);
  await flush();
  const second = run(['JUD']);
  await flush();

  releases.get('PHM')?.();
  await first;
  await flush();

  const translationStatuses = [...jobs.values()]
    .filter((job) => job.scope === 'translation')
    .map((job) => job.status);
  // Release the second run before asserting so a failure reports instead of hanging the runner.
  releases.get('JUD')?.();
  await flush();
  releases.get('JUD')?.();
  await second;
  assert.equal(
    translationStatuses.includes('completed'),
    false,
    'no translation job may be completed while the second run is still downloading'
  );
});
