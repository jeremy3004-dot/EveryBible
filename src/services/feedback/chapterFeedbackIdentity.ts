export interface ChapterFeedbackIdentity {
  name: string;
  role: string;
}

export interface ChapterFeedbackIdentityDraft {
  name: string;
  role: string;
}

const normalizeText = (value: string | null | undefined): string => value?.trim() ?? '';

export function normalizeChapterFeedbackIdentity(
  identity: ChapterFeedbackIdentityDraft | ChapterFeedbackIdentity | null | undefined
): ChapterFeedbackIdentity | null {
  if (!identity) {
    return null;
  }

  const name = normalizeText(identity.name);
  const role = normalizeText(identity.role);

  if (!name || !role) {
    return null;
  }

  return {
    name,
    role,
  };
}

export function hasChapterFeedbackIdentity(
  identity: ChapterFeedbackIdentityDraft | ChapterFeedbackIdentity | null | undefined
): boolean {
  return normalizeChapterFeedbackIdentity(identity) != null;
}
