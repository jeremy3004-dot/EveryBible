export interface SiteAssetSlot {
  id: string;
  label: string;
  description: string;
  requiredForPhase2: boolean;
}

export const siteAssetSlots: SiteAssetSlot[] = [
  {
    id: 'hero-device-primary',
    label: 'Primary hero device',
    description: 'A high-quality EveryBible app screenshot or composite used as the main hero visual.',
    requiredForPhase2: true,
  },
  {
    id: 'hero-device-secondary',
    label: 'Secondary supporting device',
    description: 'Optional secondary screenshot for layered composition or crossfade support in the hero.',
    requiredForPhase2: false,
  },
  {
    id: 'mission-texture',
    label: 'Mission texture or background treatment',
    description: 'A non-generic atmospheric treatment that supports the hero without fighting the app imagery.',
    requiredForPhase2: true,
  },
  {
    id: 'app-proof-screenshot-set',
    label: 'Product proof screenshots',
    description: 'A set of app screenshots used below the hero to establish credibility and product depth.',
    requiredForPhase2: true,
  },
];
