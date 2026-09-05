export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Masks a sensitive token (e.g. a push token) for display in support tooling.
 * Keeps only a short suffix so staff can correlate a device without exposing
 * the full credential in the admin UI.
 */
export function maskToken(value: string | null | undefined): string {
  if (!value) {
    return 'None';
  }

  const trimmed = value.trim();
  if (trimmed.length <= 6) {
    return '••••';
  }

  return `••••${trimmed.slice(-6)}`;
}

export function getNotice(searchParams: Record<string, string | string[] | undefined>): string | null {
  const value = searchParams.notice;
  return typeof value === 'string' ? value : null;
}

export function getError(searchParams: Record<string, string | string[] | undefined>): string | null {
  const value = searchParams.error;
  return typeof value === 'string' ? value : null;
}
