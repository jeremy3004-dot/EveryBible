// Public API barrel for the Every Language (EL) media source.
//
// Import cost note: this barrel is intended for STATIC/light imports (e.g. elMediaConfig,
// which only reads a feature flag + runtime config). The HEAVY modules — elCatalogService,
// elManifestService, elTranslationMapping — pull in `jose` (via elEnvelope) and the JWKS
// trust store. Startup-critical callers must reach those through a lazy dynamic `import()`
// of the specific module (e.g. `import('./elCatalogService')`) rather than through this
// barrel, so a flag-off launch never loads the EL/jose graph. See runtimeTranslationBootstrap.

// Config resolution (light — flag + runtime config only, safe to import statically).
export { resolveElCatalogUrl } from './elMediaConfig';
export type { ResolveElCatalogUrlDeps } from './elMediaConfig';

// Catalog service (heavy — prefer lazy `import('./elCatalogService')` on hot paths).
export { refreshElCatalog, getLastVerifiedElCatalog } from './elCatalogService';
export type { ElCatalogServiceDeps, ElCatalogStorage } from './elCatalogService';

// Manifest service (heavy — prefer lazy `import('./elManifestService')` on hot paths).
export { getElManifest } from './elManifestService';
export type { ElManifestServiceDeps, ElManifestStorage } from './elManifestService';

// Catalog → BibleTranslation mapping (heavy — prefer lazy import on hot paths).
export { mapElCatalogToBibleTranslations, mapElLanguageCode } from './elTranslationMapping';

// Key types.
export type { ElCatalog, ElCatalogTranslation } from './elCatalogModel';
export type { ElAudioManifest, ElManifestChapter, ElResolvedChapter } from './elManifestModel';
export type { ElJwk, ElSignedEnvelope } from './elEnvelope';
