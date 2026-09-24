// Client-safe: the passcode forms import these, so this module must not import node:crypto.

/**
 * Team passcodes are digits only, typed on the app's 10-digit keypad (Settings).
 *
 * App builds released before the 2026-09-24 keypad change stop that keypad at six digits, so six
 * stays the default: a longer code cannot be entered on those builds. The first release after
 * that change accepts up to twelve digits. Switch new codes to 10 or 12 digits once nearly every translator has
 * updated; a six-digit space (one million codes) leans entirely on the per-client lockout in
 * review-chapter-feedback (10 failures per 15 minutes), which rotating IPs can spread out.
 */
export const TEAM_PASSCODE_LENGTHS = [6, 10, 12] as const;
export type TeamPasscodeLength = (typeof TEAM_PASSCODE_LENGTHS)[number];
export const DEFAULT_TEAM_PASSCODE_LENGTH: TeamPasscodeLength = 6;
