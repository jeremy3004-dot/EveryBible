import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FieldType, Group, GroupProgress } from '../types/course';
import { fourFieldsCourses } from '../data/fourFieldsCourses';

interface FourFieldsState {
  // Progress tracking
  completedLessons: Record<string, string[]>; // courseId -> lessonIds
  practiceCompleted: Record<string, boolean>; // lessonId -> done
  taughtCompleted: Record<string, boolean>; // lessonId -> taught to someone
  currentField: FieldType;
  currentCourseId: string | null;
  currentLessonId: string | null;

  // Group state
  groups: Group[];
  activeGroupId: string | null;
  groupProgress: Record<string, GroupProgress>;

  // Actions - Progress
  markLessonComplete: (courseId: string, lessonId: string) => void;
  markPracticeComplete: (lessonId: string) => void;
  markTaughtComplete: (lessonId: string) => void;
  setCurrentLesson: (courseId: string, lessonId: string) => void;
  setCurrentField: (field: FieldType) => void;

  // Computed getters - Progress
  isLessonComplete: (courseId: string, lessonId: string) => boolean;
  isPracticeComplete: (lessonId: string) => boolean;
  isTaughtComplete: (lessonId: string) => boolean;
  getFieldProgress: (field: FieldType) => number;
  getCourseProgress: (courseId: string) => number;
  isFieldUnlocked: (field: FieldType) => boolean;
  getCompletedLessonsCount: () => number;
  getTotalLessonsCount: () => number;
  getNextLesson: () => { courseId: string; lessonId: string } | null;

  // Actions - Groups
  createGroup: (name: string, creatorId: string, creatorName: string) => Group;
  joinGroup: (joinCode: string, userId: string, userName: string) => boolean;
  leaveGroup: (groupId: string, userId: string) => void;
  setActiveGroup: (groupId: string | null) => void;
  updateGroupLesson: (groupId: string, courseId: string, lessonId: string) => void;
  markGroupLessonComplete: (groupId: string, lessonId: string) => void;
  addGroupNote: (groupId: string, lessonId: string, note: string) => void;

  // Computed getters - Groups
  getGroup: (groupId: string) => Group | undefined;
  getGroupByCode: (joinCode: string) => Group | undefined;
  getActiveGroup: () => Group | null;
  getGroupProgress: (groupId: string) => GroupProgress | undefined;
}

// Generate a 6-character alphanumeric join code
const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars like O/0, I/1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Generate a unique ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

type PersistedFourFieldsState = Partial<
  Pick<
    FourFieldsState,
    | 'completedLessons'
    | 'practiceCompleted'
    | 'taughtCompleted'
    | 'currentField'
    | 'currentCourseId'
    | 'currentLessonId'
    | 'groups'
    | 'activeGroupId'
    | 'groupProgress'
  >
>;

const VALID_FIELDS: FieldType[] = ['entry', 'gospel', 'discipleship', 'church', 'multiplication'];

function normalizePersistedState(
  persistedState: PersistedFourFieldsState
): PersistedFourFieldsState {
  const currentField = persistedState.currentField;

  return {
    ...persistedState,
    currentField:
      currentField && VALID_FIELDS.includes(currentField) ? currentField : 'entry',
  };
}

export const useFourFieldsStore = create<FourFieldsState>()(
  persist(
    (set, get) => ({
      // Initial state
      completedLessons: {},
      practiceCompleted: {},
      taughtCompleted: {},
      currentField: 'entry',
      currentCourseId: null,
      currentLessonId: null,
      groups: [],
      activeGroupId: null,
      groupProgress: {},

      // Progress Actions
      markLessonComplete: (courseId, lessonId) => {
        set((state) => {
          const courseProgress = state.completedLessons[courseId] || [];
          if (courseProgress.includes(lessonId)) {
            return state; // Already completed
          }
          return {
            completedLessons: {
              ...state.completedLessons,
              [courseId]: [...courseProgress, lessonId],
            },
          };
        });
      },

      markPracticeComplete: (lessonId) => {
        set((state) => ({
          practiceCompleted: {
            ...state.practiceCompleted,
            [lessonId]: true,
          },
        }));
      },

      markTaughtComplete: (lessonId) => {
        set((state) => ({
          taughtCompleted: {
            ...state.taughtCompleted,
            [lessonId]: true,
          },
        }));
      },

      setCurrentLesson: (courseId, lessonId) => {
        set({ currentCourseId: courseId, currentLessonId: lessonId });
      },

      setCurrentField: (field) => {
        set({ currentField: field });
      },

      // Progress Getters
      isLessonComplete: (courseId, lessonId) => {
        const { completedLessons } = get();
        return completedLessons[courseId]?.includes(lessonId) || false;
      },

      isPracticeComplete: (lessonId) => {
        return get().practiceCompleted[lessonId] || false;
      },

      isTaughtComplete: (lessonId) => {
        return get().taughtCompleted[lessonId] || false;
      },

      getFieldProgress: (field) => {
        const { completedLessons } = get();
        const fieldCourses = fourFieldsCourses.filter((c) => c.field === field);
        const totalLessons = fieldCourses.reduce((sum, c) => sum + c.lessons.length, 0);
        if (totalLessons === 0) return 0;

        const completedCount = fieldCourses.reduce((sum, course) => {
          const completed = completedLessons[course.id] || [];
          return sum + completed.length;
        }, 0);

        return Math.round((completedCount / totalLessons) * 100);
      },

      getCourseProgress: (courseId) => {
        const { completedLessons } = get();
        const course = fourFieldsCourses.find((c) => c.id === courseId);
        if (!course) return 0;

        const completed = completedLessons[courseId] || [];
        return Math.round((completed.length / course.lessons.length) * 100);
      },

      isFieldUnlocked: (_field) => {
        // All fields are now unlocked - users can explore freely
        return true;
      },

      getCompletedLessonsCount: () => {
        const { completedLessons } = get();
        return Object.values(completedLessons).reduce(
          (sum, lessons) => sum + lessons.length,
          0
        );
      },

      getTotalLessonsCount: () => {
        return fourFieldsCourses.reduce((sum, course) => sum + course.lessons.length, 0);
      },

      getNextLesson: () => {
        const { completedLessons, isFieldUnlocked } = get();
        const fields: FieldType[] = ['entry', 'gospel', 'discipleship', 'church', 'multiplication'];

        for (const field of fields) {
          if (!isFieldUnlocked(field)) continue;

          const fieldCourses = fourFieldsCourses.filter((c) => c.field === field);
          for (const course of fieldCourses) {
            const completed = completedLessons[course.id] || [];
            for (const lesson of course.lessons) {
              if (!completed.includes(lesson.id)) {
                return { courseId: course.id, lessonId: lesson.id };
              }
            }
          }
        }

        return null; // All lessons complete
      },

      // Group Actions
      createGroup: (name, creatorId, creatorName) => {
        const newGroup: Group = {
          id: generateId(),
          name,
          joinCode: generateJoinCode(),
          createdAt: Date.now(),
          createdBy: creatorId,
          currentCourseId: 'entry-course',
          currentLessonId: 'entry-1',
          members: [
            {
              id: creatorId,
              name: creatorName,
              role: 'leader',
              joinedAt: Date.now(),
            },
          ],
        };

        set((state) => ({
          groups: [...state.groups, newGroup],
          activeGroupId: newGroup.id,
          groupProgress: {
            ...state.groupProgress,
            [newGroup.id]: {
              groupId: newGroup.id,
              completedLessons: [],
              notes: {},
            },
          },
        }));

        return newGroup;
      },

      joinGroup: (joinCode, userId, userName) => {
        const { groups } = get();
        const group = groups.find((g) => g.joinCode === joinCode.toUpperCase());

        if (!group) return false;
        if (group.members.some((m) => m.id === userId)) return false; // Already a member

        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === group.id
              ? {
                  ...g,
                  members: [
                    ...g.members,
                    {
                      id: userId,
                      name: userName,
                      role: 'member' as const,
                      joinedAt: Date.now(),
                    },
                  ],
                }
              : g
          ),
          activeGroupId: group.id,
        }));

        return true;
      },

      leaveGroup: (groupId, userId) => {
        set((state) => {
          const group = state.groups.find((g) => g.id === groupId);
          if (!group) return state;

          const remainingMembers = group.members.filter((m) => m.id !== userId);

          // If no members left, remove the group
          if (remainingMembers.length === 0) {
            const remainingProgress = { ...state.groupProgress };
            delete remainingProgress[groupId];
            return {
              groups: state.groups.filter((g) => g.id !== groupId),
              activeGroupId: state.activeGroupId === groupId ? null : state.activeGroupId,
              groupProgress: remainingProgress,
            };
          }

          // If leader left, promote the oldest member
          let updatedMembers = remainingMembers;
          if (!remainingMembers.some((m) => m.role === 'leader')) {
            const oldestMember = [...remainingMembers].sort(
              (a, b) => a.joinedAt - b.joinedAt
            )[0];
            updatedMembers = remainingMembers.map((m) =>
              m.id === oldestMember.id ? { ...m, role: 'leader' as const } : m
            );
          }

          return {
            groups: state.groups.map((g) =>
              g.id === groupId ? { ...g, members: updatedMembers } : g
            ),
            activeGroupId: state.activeGroupId === groupId ? null : state.activeGroupId,
          };
        });
      },

      setActiveGroup: (groupId) => {
        set({ activeGroupId: groupId });
      },

      updateGroupLesson: (groupId, courseId, lessonId) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? { ...g, currentCourseId: courseId, currentLessonId: lessonId }
              : g
          ),
        }));
      },

      markGroupLessonComplete: (groupId, lessonId) => {
        set((state) => {
          const progress = state.groupProgress[groupId] || {
            groupId,
            completedLessons: [],
            notes: {},
          };

          if (progress.completedLessons.includes(lessonId)) {
            return state;
          }

          return {
            groupProgress: {
              ...state.groupProgress,
              [groupId]: {
                ...progress,
                completedLessons: [...progress.completedLessons, lessonId],
              },
            },
          };
        });
      },

      addGroupNote: (groupId, lessonId, note) => {
        set((state) => {
          const progress = state.groupProgress[groupId] || {
            groupId,
            completedLessons: [],
            notes: {},
          };

          return {
            groupProgress: {
              ...state.groupProgress,
              [groupId]: {
                ...progress,
                notes: {
                  ...progress.notes,
                  [lessonId]: note,
                },
              },
            },
          };
        });
      },

      // Group Getters
      getGroup: (groupId) => {
        return get().groups.find((g) => g.id === groupId);
      },

      getGroupByCode: (joinCode) => {
        return get().groups.find((g) => g.joinCode === joinCode.toUpperCase());
      },

      getActiveGroup: () => {
        const { groups, activeGroupId } = get();
        if (!activeGroupId) return null;
        return groups.find((g) => g.id === activeGroupId) || null;
      },

      getGroupProgress: (groupId) => {
        return get().groupProgress[groupId];
      },
    }),
    {
      name: 'four-fields-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1, // Increment version to trigger migration
      migrate: (persistedState: unknown, _version: number) => {
        return normalizePersistedState((persistedState ?? {}) as PersistedFourFieldsState);
      },
      partialize: (state) => ({
        completedLessons: state.completedLessons,
        practiceCompleted: state.practiceCompleted,
        taughtCompleted: state.taughtCompleted,
        currentField: state.currentField,
        currentCourseId: state.currentCourseId,
        currentLessonId: state.currentLessonId,
        groups: state.groups,
        activeGroupId: state.activeGroupId,
        groupProgress: state.groupProgress,
      }),
    }
  )
);
