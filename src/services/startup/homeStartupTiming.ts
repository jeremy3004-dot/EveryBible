interface HomeReadyDependencies {
  schedule: (callback: () => void) => () => void;
  report: () => void;
}

/** Layout plus an idle JS turn is a readiness proxy, not measured tap latency. */
export function createHomeReadyReporter({ schedule, report }: HomeReadyDependencies) {
  let scheduled = false;
  let finished = false;
  let cancelScheduled: (() => void) | undefined;

  return {
    onLayout: () => {
      if (scheduled || finished) return;
      scheduled = true;
      cancelScheduled = schedule(() => {
        if (finished) return;
        finished = true;
        report();
      });
    },
    cancel: () => {
      finished = true;
      cancelScheduled?.();
    },
  };
}
