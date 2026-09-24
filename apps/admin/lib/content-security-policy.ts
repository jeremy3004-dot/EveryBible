// The admin's enforced Content-Security-Policy. Every admin page is rendered per request (the
// root layout reads the nonce from headers()), so scripts are allowed by a fresh nonce rather
// than 'unsafe-inline': Next.js stamps the nonce on its own bootstrap and chunk scripts, and
// 'strict-dynamic' extends trust to the chunks those scripts load.

export const CSP_NONCE_HEADER = 'x-nonce';

/** CARTO serves the atlas basemap: style JSON, sprites and glyphs, and vector tiles on
 * tiles-{a..d}. See lib/atlas-basemap.ts. */
export const MAP_CONNECT_SOURCES = [
  'https://basemaps.cartocdn.com',
  'https://*.basemaps.cartocdn.com',
];

export interface AdminCspOptions {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL. Feedback audio plays from signed Storage URLs on this origin. */
  supabaseUrl?: string;
  dev?: boolean;
}

function supabaseOrigins(supabaseUrl: string | undefined): { https: string[]; wss: string[] } {
  if (!supabaseUrl) return { https: [], wss: [] };
  try {
    const url = new URL(supabaseUrl);
    return { https: [url.origin], wss: [`wss://${url.host}`] };
  } catch {
    return { https: [], wss: [] };
  }
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildAdminContentSecurityPolicy({
  nonce,
  supabaseUrl,
  dev = false,
}: AdminCspOptions): string {
  const supabase = supabaseOrigins(supabaseUrl);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // `next dev` evaluates modules for React Refresh.
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // React server-renders style="" attributes, so inline styles stay allowed. A nonce here
    // would switch 'unsafe-inline' off, so styles deliberately carry none.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'data:', 'blob:', ...supabase.https],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      ...supabase.https,
      ...supabase.wss,
      ...MAP_CONNECT_SOURCES,
      ...(dev ? ['ws:'] : []),
    ],
    'media-src': ["'self'", ...supabase.https],
    // MapLibre runs its tile worker from /maplibre/maplibre-gl-worker.mjs.
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
