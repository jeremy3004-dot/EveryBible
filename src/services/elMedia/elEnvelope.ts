import type { SignedCatalogEnvelope } from '../../types/bible';

export interface ElJwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid: string;
  alg?: string;
  use?: string;
}

// The shared SignedCatalogEnvelope type allows 'ES256' | 'RS256' for the app's other
// (PEM-based) verification path. The EL contract is ES256-only, so narrow to that here.
export type ElSignedEnvelope = SignedCatalogEnvelope & { algorithm: 'ES256' };

// EL contract is ES256-only; compact JWS has exactly three dot-separated segments.
export function isElEnvelopeShape(value: unknown): value is ElSignedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.keyId === 'string' &&
    v.keyId.length > 0 &&
    v.algorithm === 'ES256' &&
    typeof v.compactJws === 'string' &&
    v.compactJws.split('.').length === 3
  );
}

export async function verifyElEnvelope(
  envelope: ElSignedEnvelope,
  keys: ElJwk[]
): Promise<unknown | null> {
  const jwk = keys.find((key) => key.kid === envelope.keyId);
  if (!jwk) return null;
  try {
    const { importJWK, compactVerify } = await import('jose');
    const publicKey = await importJWK(jwk as Parameters<typeof importJWK>[0], 'ES256');
    const { payload, protectedHeader } = await compactVerify(envelope.compactJws, publicKey, {
      algorithms: ['ES256'],
    });
    if (protectedHeader.kid !== envelope.keyId) return null;
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch {
    return null;
  }
}
