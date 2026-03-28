export const config = {
  appName: 'Every Bible',
  version: '1.0.0',

  // Bible defaults
  defaultTranslation: 'BSB',
  defaultBook: 'GEN',
  defaultChapter: 1,

  // API endpoints (for future use)
  apiBaseUrl: '',

  // Feature flags
  features: {
    audioEnabled: true,
    multipleTranslations: true,
    socialSharing: true,
    chapterFeedbackInlineComposer: true,
    studyGroupsSync: false,
  },
} as const;
