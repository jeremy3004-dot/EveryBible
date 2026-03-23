export type MeetingSectionType = 'fellowship' | 'story' | 'application';

export interface BibleReference {
  bookId: string; // e.g. 'GEN', 'EXO' — matches constants/books.ts IDs
  chapter: number;
  startVerse?: number;
  endVerse?: number;
}

export interface GatherLesson {
  id: string; // e.g. 'f1-01', 'f1-02', 't-courage-01'
  number: number; // 1-based index within parent
  title: string; // e.g. 'Creation'
  references: BibleReference[]; // one or more passage references
  referenceLabel: string; // human-readable e.g. 'Genesis 1:1-25'
}

export interface GatherFoundation {
  id: string; // e.g. 'foundation-1'
  number: number; // 1-7
  title: string;
  description: string;
  iconName: string; // Ionicons name
  lessons: GatherLesson[];
}

export interface GatherTopic {
  id: string; // e.g. 'topic-courage'
  title: string;
  iconName: string;
  lessonCount: number; // declared count (lessons may be stubs)
  lessons: GatherLesson[];
}

export type GatherTopicCategoryName = 'Truth' | 'Challenge' | 'Money' | 'People' | 'God';

export interface GatherTopicCategory {
  id: string;
  name: GatherTopicCategoryName;
  topics: GatherTopic[];
}
