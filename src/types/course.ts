export interface Lesson {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  lessons: Lesson[];
  featured: boolean;
}

export interface CourseProgress {
  courseId: string;
  started: boolean;
  completed: boolean;
  currentLesson: number;
  completedLessons: string[];
}

// Four Fields Types
export type FieldType = 'entry' | 'gospel' | 'discipleship' | 'church' | 'multiplication';

export interface LessonSection {
  type: 'text' | 'scripture' | 'bullets' | 'discussion' | 'activity' | 'prayer';
  content: string;
  reference?: string;
  items?: string[];
}

export interface ExtendedLesson extends Lesson {
  sections: LessonSection[];
  keyVerse?: { text: string; reference: string };
  practiceActivity?: string;
  discussionQuestions?: string[];
  takeaway: string;
}

export interface FourFieldsCourse extends Course {
  field: FieldType;
  fieldOrder: number;
  estimatedMinutes: number;
  keyVerse: { text: string; reference: string };
  practiceActivity: string;
  lessons: ExtendedLesson[];
}

export interface FieldInfo {
  id: FieldType;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  order: number;
}

// Group Types
export interface GroupMember {
  id: string;
  name: string;
  role: 'leader' | 'member';
  joinedAt: number;
}

export interface Group {
  id: string;
  name: string;
  joinCode: string;
  createdAt: number;
  createdBy: string;
  currentCourseId: string;
  currentLessonId: string;
  members: GroupMember[];
}

export interface GroupProgress {
  groupId: string;
  completedLessons: string[];
  notes: Record<string, string>;
}
