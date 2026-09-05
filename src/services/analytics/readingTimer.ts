// The screen owns focus/AppState; this clock owns only unreported active time.
export function createReadingTimer(emit: (seconds: number) => void, now = Date.now) {
  let startedAt: number | null = null;
  let pendingMs = 0;
  const checkpoint = () => {
    const current = now();
    if (startedAt !== null) {
      pendingMs += Math.max(0, current - startedAt);
      startedAt = current;
    }
    const seconds = Math.floor(pendingMs / 1000);
    if (seconds >= 5) {
      emit(seconds);
      pendingMs -= seconds * 1000;
    }
  };
  return {
    checkpoint,
    setActive(active: boolean) {
      checkpoint();
      startedAt = active ? (startedAt ?? now()) : null;
    },
    finish() {
      checkpoint();
      startedAt = null;
      pendingMs = 0;
    },
  };
}
