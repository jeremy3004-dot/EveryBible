export function getMillisecondsUntilNextLocalMidnight(now = new Date()): number {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);

  return nextMidnight.getTime() - now.getTime();
}
