import { timingSafeEqual } from 'node:crypto';

const APPSMITH_OPS_API_KEY = 'APPSMITH_OPS_API_KEY';

type EnvMap = Record<string, string | undefined>;

export type TranslationCatalogOpsRow = {
  abbreviation: string;
  catalog?: Record<string, unknown> | null;
  distribution_state?: 'draft' | 'ready' | 'published' | 'hidden';
  has_audio: boolean;
  has_text: boolean;
  is_available: boolean;
  language_name: string;
  name: string;
  translation_id: string;
  updated_at: string;
  upstream_last_synced_at?: string | null;
};

export interface OpsAuthResult {
  ok: boolean;
  reason?: 'missing_key' | 'unauthorized';
}

export function getAppsmithOpsApiKey(env: EnvMap = process.env): string | null {
  const value = env[APPSMITH_OPS_API_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readPresentedToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const apiKey = request.headers.get('x-api-key');
  return apiKey && apiKey.trim().length > 0 ? apiKey.trim() : null;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeAppsmithOpsRequest(
  request: Request,
  env: EnvMap = process.env
): OpsAuthResult {
  const configuredKey = getAppsmithOpsApiKey(env);
  if (!configuredKey) {
    return { ok: false, reason: 'missing_key' };
  }

  const presentedToken = readPresentedToken(request);
  if (!presentedToken || !constantTimeEquals(presentedToken, configuredKey)) {
    return { ok: false, reason: 'unauthorized' };
  }

  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNestedString(
  value: Record<string, unknown> | null | undefined,
  path: readonly string[]
): string | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return typeof cursor === 'string' && cursor.trim().length > 0 ? cursor.trim() : null;
}

export function buildMediaHealthIssues(row: TranslationCatalogOpsRow): string[] {
  const catalog = row.catalog ?? null;
  const issues: string[] = [];

  if (row.has_text) {
    if (!readNestedString(catalog, ['text', 'downloadUrl'])) {
      issues.push('missing_text_download_url');
    }
    if (!readNestedString(catalog, ['text', 'sha256'])) {
      issues.push('missing_text_sha256');
    }
  }

  if (row.has_audio) {
    if (!readNestedString(catalog, ['audio', 'strategy'])) {
      issues.push('missing_audio_strategy');
    }
    const hasDownloadUrl = Boolean(readNestedString(catalog, ['audio', 'downloadUrl']));
    const hasTemplate =
      Boolean(readNestedString(catalog, ['audio', 'baseUrl'])) &&
      Boolean(readNestedString(catalog, ['audio', 'chapterPathTemplate']));
    const hasProvider = Boolean(readNestedString(catalog, ['audio', 'provider']));

    if (!hasDownloadUrl && !hasTemplate && !hasProvider) {
      issues.push('missing_audio_delivery_reference');
    }
    if (!readNestedString(catalog, ['audio', 'fileExtension'])) {
      issues.push('missing_audio_file_extension');
    }
    if (!readNestedString(catalog, ['audio', 'mimeType'])) {
      issues.push('missing_audio_mime_type');
    }
  }

  if (row.is_available && !row.has_text && !row.has_audio) {
    issues.push('available_without_text_or_audio');
  }

  return issues;
}
