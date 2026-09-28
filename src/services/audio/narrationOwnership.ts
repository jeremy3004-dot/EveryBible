/** Bible, Gather, and feedback audio use separate native resources, but never run together. */
export interface NarrationClaim {
  ready: Promise<void>;
  isCurrent: () => boolean;
  cancel: () => void;
}

type Owner = 'bible' | 'lesson' | 'feedback';
type Suspension = () => Promise<void>;
interface Ticket {
  owner: Owner;
  identity: object;
  suspend: Suspension;
}
interface Drain extends Ticket {
  promise: Promise<void>;
  failed: boolean;
}

export const bibleNarrationOwner = {};
let current: Ticket | null = null;
const drains = new Set<Drain>();

function suspend(ticket: Ticket): void {
  // Invoke now: cancellation must precede any pending load/Play continuing.
  let promise: Promise<void>;
  try {
    promise = ticket.suspend();
  } catch (error) {
    promise = Promise.reject(error);
  }
  const drain: Drain = { ...ticket, promise, failed: false };
  drains.add(drain);
  void promise.then(
    () => drains.delete(drain),
    () => {
      drain.failed = true;
    }
  );
}

/** A new Play wins immediately, then waits for outgoing native playback to drain. */
export function claimNarration(
  owner: Owner,
  identity: object,
  suspension: Suspension
): NarrationClaim {
  const previous = current;
  const ticket: Ticket = { owner, identity, suspend: suspension };
  current = ticket;

  // A failed suspension keeps its resource available for an explicit retry. A
  // reclaim by that same owner needs no suspension, but still awaits pending drains.
  for (const drain of [...drains]) {
    if (!drain.failed) continue;
    drains.delete(drain);
    if (drain.identity !== identity) suspend(drain);
  }
  if (previous && previous.identity !== identity) suspend(previous);

  const ready = Promise.all(
    [...drains].map((drain) =>
      drain.identity === identity ? drain.promise.catch(() => undefined) : drain.promise
    )
  ).then(() => undefined);
  // A source change can cancel the caller before it reaches its await.
  void ready.catch(() => undefined);
  return {
    ready,
    isCurrent: () => current === ticket,
    cancel: () => {
      if (current !== ticket) return;
      current = null;
      suspend(ticket);
    },
  };
}

/** Tests reset only after their gated native operations have settled. */
export function resetNarrationOwnership(): void {
  current = null;
  drains.clear();
}
