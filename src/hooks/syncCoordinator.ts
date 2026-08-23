export interface SyncIdentity {
  readonly userId: string;
  readonly generation: number;
}

type PullResult = { success: boolean };
type Operation = 'pull' | 'push';

export interface SyncCoordinator {
  enqueuePull(identity: SyncIdentity, run: () => Promise<PullResult>): Promise<boolean>;
  enqueuePush(
    identity: SyncIdentity,
    run: () => Promise<void>,
    pull: () => Promise<PullResult>
  ): Promise<void>;
}

interface Request {
  readonly identity: SyncIdentity;
  readonly operation: Operation;
  readonly run: () => Promise<unknown>;
  readonly promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const sameIdentity = (left: SyncIdentity, right: SyncIdentity): boolean =>
  left.userId === right.userId && left.generation === right.generation;

const succeeded = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'success' in value && value.success === true;

export const createSyncCoordinator = (): SyncCoordinator => {
  let active: Request | null = null;
  const queued: Request[] = [];
  let preparedIdentity: SyncIdentity | null = null;

  const resolveStaleQueue = (identity: SyncIdentity) => {
    if (preparedIdentity && !sameIdentity(preparedIdentity, identity)) {
      preparedIdentity = null;
    }
    for (let index = queued.length - 1; index >= 0; index -= 1) {
      const request = queued[index];
      if (!sameIdentity(request.identity, identity)) {
        queued.splice(index, 1);
        request.resolve(request.operation === 'pull' ? false : undefined);
      }
    }
  };

  const discardPendingPush = (identity: SyncIdentity) => {
    for (let index = queued.length - 1; index >= 0; index -= 1) {
      const request = queued[index];
      if (request.operation === 'push' && sameIdentity(request.identity, identity)) {
        queued.splice(index, 1);
        request.resolve(undefined);
      }
    }
  };

  const startNext = () => {
    if (active || queued.length === 0) {
      return;
    }

    const request = queued.shift()!;
    active = request;
    const completion = Promise.resolve()
      .then(request.run)
      .then(
        (value) => {
          if (request.operation === 'pull') {
            const pullSucceeded = succeeded(value);
            if (pullSucceeded) {
              preparedIdentity = request.identity;
            } else {
              if (preparedIdentity && sameIdentity(preparedIdentity, request.identity)) {
                preparedIdentity = null;
              }
              discardPendingPush(request.identity);
            }
            request.resolve(pullSucceeded);
          } else {
            request.resolve(value);
          }
        },
        (error) => {
          if (request.operation === 'pull') {
            if (preparedIdentity && sameIdentity(preparedIdentity, request.identity)) {
              preparedIdentity = null;
            }
            discardPendingPush(request.identity);
            request.resolve(false);
          } else {
            request.reject(error);
          }
        }
      )
      .finally(() => {
        active = null;
        startNext();
      });
    void completion.catch(() => undefined);
  };

  const createRequest = (
    identity: SyncIdentity,
    operation: Operation,
    run: () => Promise<unknown>
  ): Request => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<unknown>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { identity, operation, run, promise, resolve, reject };
  };

  const enqueuePull = (identity: SyncIdentity, run: () => Promise<PullResult>) => {
    resolveStaleQueue(identity);
    if (preparedIdentity && sameIdentity(preparedIdentity, identity)) {
      return Promise.resolve(true);
    }
    if (active && sameIdentity(active.identity, identity) && active.operation === 'pull') {
      return active.promise as Promise<boolean>;
    }
    const existing = queued.find(
      (request) => request.operation === 'pull' && sameIdentity(request.identity, identity)
    );
    if (existing) {
      return existing.promise as Promise<boolean>;
    }

    const request = createRequest(identity, 'pull', run);
    queued.unshift(request);
    startNext();
    return request.promise as Promise<boolean>;
  };

  const enqueuePush = (
    identity: SyncIdentity,
    run: () => Promise<void>,
    pull: () => Promise<PullResult>
  ) => {
    resolveStaleQueue(identity);
    if (!preparedIdentity || !sameIdentity(preparedIdentity, identity)) {
      void enqueuePull(identity, pull);
    }
    if (active && sameIdentity(active.identity, identity) && active.operation === 'push') {
      return active.promise as Promise<void>;
    }
    const existing = queued.find(
      (request) => request.operation === 'push' && sameIdentity(request.identity, identity)
    );
    if (existing) {
      return existing.promise as Promise<void>;
    }

    const request = createRequest(identity, 'push', run);
    queued.push(request);
    startNext();
    return request.promise as Promise<void>;
  };

  return { enqueuePull, enqueuePush };
};
