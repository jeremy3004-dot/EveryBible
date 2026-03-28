export interface ChapterFeedbackIdentity {
  name: string;
  role: string;
  idNumber: string;
}

export interface ChapterFeedbackIdentityDraft {
  name: string;
  role: string;
  idNumber: string;
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
  const idNumber = normalizeText(identity.idNumber);

  if (!name || !role || !idNumber) {
    return null;
  }

  return {
    name,
    role,
    idNumber,
  };
}

export function hasChapterFeedbackIdentity(
  identity: ChapterFeedbackIdentityDraft | ChapterFeedbackIdentity | null | undefined
): boolean {
  return normalizeChapterFeedbackIdentity(identity) != null;
}
