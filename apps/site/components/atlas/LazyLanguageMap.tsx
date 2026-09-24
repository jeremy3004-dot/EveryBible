'use client';

/* Entry point for the lazily loaded map chunk. MapLibre's stylesheet (83 KB)
   travels with the map code instead of being a render-blocking stylesheet on
   the homepage: nothing styled by it exists until this chunk has loaded. */
import 'maplibre-gl/dist/maplibre-gl.css';

export { LanguageMap } from '../../../admin/components/language-atlas/LanguageMap';
