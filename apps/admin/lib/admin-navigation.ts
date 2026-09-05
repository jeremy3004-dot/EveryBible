import {
  adminNavigationGroupOrder,
  type AdminNavigationItem,
  type AdminNavigationSection,
} from './shared-contracts';

export const adminNavigation: AdminNavigationItem[] = [
  {
    label: 'Overview',
    href: '/',
    description: 'Operational snapshot of the entire admin platform.',
    group: 'Overview',
  },
  {
    label: 'Verse of the Day',
    href: '/content/verse-of-day',
    description: 'Draft, schedule, publish, and archive daily Scripture cards.',
    group: 'Content',
  },
  {
    label: 'Images',
    href: '/content/images',
    description: 'Upload and manage promotional and verse artwork.',
    group: 'Content',
  },
  {
    label: 'Translations',
    href: '/translations',
    description: 'Syncs, distribution state, and upstream catalog operations.',
    group: 'Delivery',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    description: 'Listening metrics and privacy-safe geography reporting.',
    group: 'Insights',
  },
  {
    label: 'Languages',
    href: '/languages',
    description: 'Explore languages, dialects, people groups, and Scripture coverage.',
    group: 'Insights',
  },
  {
    label: 'Chapter Feedback',
    href: '/feedback',
    description: 'Review chapter feedback submitted from the mobile reader and listener.',
    group: 'Insights',
  },
  {
    label: 'Health',
    href: '/health',
    description: 'Catch stale syncs, missing content, and readiness problems early.',
    group: 'Operations',
  },
  {
    label: 'Support',
    href: '/support/users',
    description: 'Inspect account, device, and sync state without unsafe mutations.',
    group: 'Operations',
  },
  {
    label: 'Settings',
    href: '/settings',
    description: 'Admin roles, audit history, and future hardening seams.',
    group: 'Admin',
  },
];

/**
 * Groups the flat navigation list into ordered sections so the sidebar can
 * render labeled groups instead of a flat list of ten links.
 */
export function getAdminNavigationSections(): AdminNavigationSection[] {
  return adminNavigationGroupOrder
    .map((group) => ({
      group,
      items: adminNavigation.filter((item) => item.group === group),
    }))
    .filter((section) => section.items.length > 0);
}
