import type { AdminNavigationItem } from './shared-contracts';

export const adminNavigation: AdminNavigationItem[] = [
  {
    label: 'Overview',
    href: '/',
    description: 'Operational snapshot of the entire admin platform.',
  },
  {
    label: 'Translations',
    href: '/translations',
    description: 'Syncs, distribution state, and upstream catalog operations.',
  },
  {
    label: 'Verse of the Day',
    href: '/content/verse-of-day',
    description: 'Draft, schedule, publish, and archive daily Scripture cards.',
  },
  {
    label: 'Images',
    href: '/content/images',
    description: 'Upload and manage promotional and verse artwork.',
  },
  {
    label: 'Health',
    href: '/health',
    description: 'Catch stale syncs, missing content, and readiness problems early.',
  },
  {
    label: 'Support',
    href: '/support/users',
    description: 'Inspect account, device, and sync state without unsafe mutations.',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    description: 'Listening metrics and privacy-safe geography reporting.',
  },
  {
    label: 'Settings',
    href: '/settings',
    description: 'Admin roles, audit history, and future hardening seams.',
  },
];
