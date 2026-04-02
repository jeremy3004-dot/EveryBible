export type SiteAnalyticsEvent =
  | 'site_primary_cta_clicked'
  | 'site_secondary_cta_clicked'
  | 'site_app_store_cta_clicked'
  | 'site_section_viewed';

export interface SiteAnalyticsBoundary {
  event: SiteAnalyticsEvent;
  description: string;
}

export const siteAnalyticsBoundaries: SiteAnalyticsBoundary[] = [
  {
    event: 'site_primary_cta_clicked',
    description: 'Tracks engagement with the main hero CTA without introducing user-level identity assumptions.',
  },
  {
    event: 'site_secondary_cta_clicked',
    description: 'Tracks exploration intent for secondary story/navigation actions.',
  },
  {
    event: 'site_app_store_cta_clicked',
    description: 'Tracks app-download intent from the marketing surface.',
  },
  {
    event: 'site_section_viewed',
    description: 'Tracks major section exposure only if implemented in a lightweight, privacy-respecting way.',
  },
];
