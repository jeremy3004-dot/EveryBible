// Response shaping for review-chapter-feedback. Everything in these payloads is readable by
// anyone holding a translator passcode for that translation, so each field has to earn its place.

export type ReviewResolution = 'fixed' | 'no_change_needed';

export interface ChapterFeedbackReviewRow {
  contributor_category: 'community' | 'scripture_council' | null;
  id: string;
  created_at: string;
  translation_id: string;
  translation_language: string;
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  comment: string | null;
  participant_name: string | null;
  participant_role: string | null;
  participant_id_number: string | null;
  user_id: string | null;
  source_screen: string;
  audio_response_bucket: string | null;
  audio_response_path: string | null;
  audio_response_mime_type: string | null;
  audio_response_size_bytes: number | null;
  audio_response_duration_ms: number | null;
  audio_response_created_at: string | null;
  scripture_council_resolution: ReviewResolution | null;
  scripture_council_fixed_at: string | null;
  scripture_council_fixed_note: string | null;
}

// The v2 review screen requests a recording link (action 'audioUrl') immediately before it
// plays the clip, and clips are at most one minute long, so the link only needs to outlive
// one listen.
export const AUDIO_URL_TTL_SECONDS = 10 * 60;
// Pre-v2 builds play from the URL embedded in the list response, possibly long after
// loading it, so their one-hour lifetime stays until those builds are retired.
export const LEGACY_LIST_AUDIO_URL_TTL_SECONDS = 60 * 60;

// v2 clients never read list playback URLs. Signing one per row handed out a link to every
// recording on the page whether or not anyone listened.
export const signsListAudio = (apiVersion: number | undefined): boolean => apiVersion !== 2;

export function toReviewFeedbackItem(
  row: ChapterFeedbackReviewRow,
  apiVersion: number | undefined,
  playbackUrl: string | null
) {
  const v2 = apiVersion === 2;
  return {
    contributorCategory: row.contributor_category ?? null,
    id: row.id,
    createdAt: row.created_at,
    translationId: row.translation_id,
    translationLanguage: row.translation_language,
    bookId: row.book_id,
    chapter: row.chapter,
    sentiment: row.sentiment,
    comment: row.comment,
    participantName: row.participant_name,
    // The v2 screen shows neither field. Keys stay (as null) so the response type is unchanged.
    participantRole: v2 ? null : row.participant_role,
    // Legacy rows stored the raw Supabase UUID here; never surface it to translators (S4).
    // row.user_id is used ONLY for this comparison and is deliberately not emitted.
    participantIdNumber:
      v2 || (row.participant_id_number && row.participant_id_number === row.user_id)
        ? null
        : row.participant_id_number,
    sourceScreen: row.source_screen,
    resolution: row.scripture_council_resolution,
    resolvedAt: row.scripture_council_fixed_at,
    resolutionNote: row.scripture_council_fixed_note,
    audioResponse:
      row.audio_response_path && row.audio_response_duration_ms && row.audio_response_mime_type
        ? {
            createdAt: row.audio_response_created_at,
            durationMs: row.audio_response_duration_ms,
            mimeType: row.audio_response_mime_type,
            playbackUrl: v2 ? null : playbackUrl,
            sizeBytes: row.audio_response_size_bytes,
          }
        : null,
  };
}
