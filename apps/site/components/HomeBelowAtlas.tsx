import Image from 'next/image';

import { projectSnapshot } from '../lib/public-atlas-projects';
import { EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL } from '../lib/site-links';

const PROMISES = ['Free, forever', 'No ads, no purchases', 'Works offline'];

/* Data partners credited on the homepage. The atlas sources panel carries
   the full registry, versions, and reuse notes. */
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
              Read and listen to Scripture in the language you understand best. Download it once and
              it works wherever you are, even without a signal.
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
          <div className="home-get">
            <a
              className="home-get__qr"
              href="/download"
              aria-label="Download EveryBible for your phone"
            >
              <Image
                src="/everybible/download-qr.svg"
                alt="Scan to download EveryBible"
                width={104}
                height={104}
                unoptimized
              />
            </a>
            <div>
              <h3>Get EveryBible</h3>
              <p>Scan with your phone, or choose your store.</p>
              <div className="home-stores">
                <a href={EVERYBIBLE_APP_STORE_URL}>
                  <Image
                    src="/everybible/badge-app-store.svg"
                    alt="Download on the App Store"
                    width={140}
                    height={42}
                    unoptimized
                  />
                </a>
                <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>
                  <Image
                    src="/everybible/badge-google-play.png"
                    alt="Get it on Google Play"
                    width={142}
                    height={42}
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-band" id="data" aria-label="About the atlas data">
        <div className="wrap">
          <p className="eyebrow">About the data</p>
          <h2>A research atlas, read with care.</h2>
          <div className="home-data">
            <div>
              <h3>Where it comes from</h3>
              <p>
                Language and dialect records, locations, and Scripture status are brought together
                from{' '}
                {DATA_PARTNERS.map((partner, position) => (
                  <span key={partner.label}>
                    {position > 0 && (position === DATA_PARTNERS.length - 1 ? ', and ' : ', ')}
                    <a href={partner.href} target="_blank" rel="noreferrer">
                      {partner.label}
                    </a>
                  </span>
                ))}
                . Basemap by CARTO and OpenStreetMap contributors.{' '}
                <a href="/#atlas-sources">Full source notes</a>
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
                Each dot is a language record. Teal has a full Bible, gold a New Testament, and
                copper has portions. Red means our sources have no documented Scripture.
              </p>
            </div>
            <div>
              <h3>Atlas versus app</h3>
              <p>
                The atlas is a research collection. The translations you can read and listen to in
                EveryBible are a separate, smaller set. <a href="#app">See the app languages</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
