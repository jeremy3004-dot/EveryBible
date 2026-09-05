import type { ScriptureStatus } from './types';

export type ScriptureVisualCategory =
  | 'bible'
  | 'nt'
  | 'portions'
  | 'no-scripture'
  | 'unknown';

export const SCRIPTURE_VISUAL_ORDER: ScriptureVisualCategory[] = [
  'bible',
  'nt',
  'portions',
  'no-scripture',
  'unknown',
];

export const SCRIPTURE_PRESENTATION: Record<
  ScriptureVisualCategory,
  { label: string; color: string }
> = {
  bible: { label: 'Full Bible', color: '#10b981' },
  nt: { label: 'New Testament', color: '#eab308' },
  portions: { label: 'Portions', color: '#eb6a38' },
  'no-scripture': { label: 'No Scripture', color: '#ef4444' },
  unknown: { label: 'Unknown', color: '#94a3b8' },
};

export function scriptureVisualCategory(status: ScriptureStatus): ScriptureVisualCategory {
  if (status === 'started' || status === 'needed') return 'no-scripture';
  return status;
}
