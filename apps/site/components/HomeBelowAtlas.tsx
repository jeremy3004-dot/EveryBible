/* eslint-disable @next/next/no-img-element -- staticImageProps gives next/image's
   optimized srcset without its client component (see lib/static-image.ts). */
import { projectSnapshot } from '../lib/public-atlas-projects';
import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_DOWNLOAD_ANCHOR,
  EVERYBIBLE_GOOGLE_PLAY_URL,
} from '../lib/site-links';
import { staticImageProps } from '../lib/static-image';

const downloadQr = staticImageProps('/everybible/download-qr.svg', 104, 104, {
  unoptimized: true,
});
const appStoreBadge = staticImageProps('/everybible/badge-app-store.svg', 140, 42, {
  unoptimized: true,
});
const googlePlayBadge = staticImageProps('/everybible/badge-google-play.png', 141, 42);

const PROMISES = ['Free, forever', 'No ads, no purchases', 'Works offline'];

/* Data partners credited on the homepage and in the atlas source credits. */
const DATA_PARTNERS = [
  { label: 'Joshua Project', href: 'https://joshuaproject.net' },
  { label: 'Global Recordings Network', href: 'https://globalrecordings.net/en/rolv' },
  { label: 'Glottolog', href: 'https://glottolog.org' },
];

const SCRIPTURE_SWATCHES = ['reef', 'ochre', 'clay', 'danger'];

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * The two bands under the full-screen atlas: the app download strip and a
 * plain-language explanation of the map data.
 */
export function HomeBelowAtlas() {
  return (
    <>
      <section className="home-band home-band--surface" id="app" aria-label="The EveryBible app">
        <div className="wrap home-band__grid">
          <div>
            <p className="eyebrow">The app</p>
            <h2>Built for the heart of Africa and the heights of the Himalayas.</h2>
            <p className="home-band__lede">
              Read or listen in your language. Download Scripture to use it without a signal.
            </p>
            <div className="home-band__pills">
              {PROMISES.map((promise) => (
                <span key={promise}>
                  <Check />
                  {promise}
                </span>
              ))}
              <span>
                <Check />
                {projectSnapshot.projects.length} languages
              </span>
            </div>
          </div>
          {/* /download sends desktop browsers here (resolveSmartDownloadTarget). */}
          <div className="home-get" id={EVERYBIBLE_DOWNLOAD_ANCHOR}>
            <a
              className="home-get__qr"
              href="/download"
              aria-label="Download EveryBible for your phone"
            >
              <img {...downloadQr} alt="Scan to download EveryBible" />
            </a>
            <div>
              <h3>Get EveryBible</h3>
              <p>Scan with your phone, or choose your store.</p>
              <div className="home-stores">
                <a href={EVERYBIBLE_APP_STORE_URL}>
                  <img {...appStoreBadge} alt="Download on the App Store" />
                </a>
                <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>
                  <img {...googlePlayBadge} alt="Get it on Google Play" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-band" id="data" aria-label="About the atlas data">
        <div className="wrap">
          <p className="eyebrow">About the data</p>
          <h2>Explore the map</h2>
          <div className="home-data">
            <div>
              <h3>Where it comes from</h3>
              <p>
                Language and Scripture information comes from{' '}
                {DATA_PARTNERS.map((partner, position) => (
                  <span key={partner.label}>
                    {position > 0 && (position === DATA_PARTNERS.length - 1 ? ', and ' : ', ')}
                    <a href={partner.href} target="_blank" rel="noreferrer">
                      {partner.label}
                    </a>
                  </span>
                ))}
                . Basemap by CARTO and OpenStreetMap contributors.{' '}
                <a href="/#atlas-sources">Sources & credits</a>
              </p>
            </div>
            <div>
              <div className="home-data__swatches" aria-hidden="true">
                {SCRIPTURE_SWATCHES.map((token) => (
                  <i key={token} style={{ background: `hsl(var(--${token}))` }} />
                ))}
              </div>
              <h3>What the colors mean</h3>
              <p>
                Each dot represents a language or dialect. Teal means a full Bible, gold a New
                Testament, copper portions, and red no known Scripture.
              </p>
            </div>
            <div>
              <h3>Read and listen</h3>
              <p>
                The map covers more languages than the app currently offers.{' '}
                <a href="#app">Get EveryBible</a> to read and listen.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
