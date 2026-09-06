import type { AtlasRecordKind, ScriptureStatus } from './types';

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

// Hex mirrors of the canonical FIELD data tokens. MapLibre cannot consume the
// space-separated hsl(var(--token)) values used by the stylesheets.
export const SCRIPTURE_COLORS = {
  light: {
    bible: '#1e8a7a', // --reef
    nt: '#db9b1a', // --ochre
    portions: '#bf6d3b', // --clay
    'no-scripture': '#c62a3a', // --danger
    unknown: '#7e7972', // --neutral
  },
  dark: {
    bible: '#36c9b3',
    nt: '#efb748',
    portions: '#d68b5c',
    'no-scripture': '#e34f5b',
    unknown: '#a39b8a',
  },
} as const satisfies Record<'light' | 'dark', Record<ScriptureVisualCategory, string>>;

export const SCRIPTURE_PRESENTATION: Record<
  ScriptureVisualCategory,
  { label: string; color: string }
> = {
  bible: { label: 'Full Bible', color: SCRIPTURE_COLORS.light.bible },
  nt: { label: 'New Testament', color: SCRIPTURE_COLORS.light.nt },
  portions: { label: 'Portions', color: SCRIPTURE_COLORS.light.portions },
  'no-scripture': {
    label: 'No known Scripture',
    color: SCRIPTURE_COLORS.light['no-scripture'],
  },
  unknown: { label: 'Unknown', color: SCRIPTURE_COLORS.light.unknown },
};

export function scriptureVisualCategory(
  status: ScriptureStatus,
  kind?: AtlasRecordKind
): ScriptureVisualCategory {
  // Red is a presentation default, not a claim that an unverified dialect has no Scripture.
  if (kind === 'dialect' && status === 'unknown') return 'no-scripture';
  if (status === 'started' || status === 'needed') return 'no-scripture';
  return status;
}
