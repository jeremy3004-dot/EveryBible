import Image from 'next/image';

import { HeroDeviceStack } from '../components/HeroDeviceStack';
import { getHomepageContent } from '../lib/homepage-content';
import {
  footerColumns,
  siteNavigation,
} from '../lib/site-content';
import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_SMART_DOWNLOAD_PATH,
  EVERYBIBLE_SMART_DOWNLOAD_URL,
} from '../lib/site-links';

export const dynamic = 'force-dynamic';

/* ── Icons ──────────────────────────────────────────────────── */
function ArrowRight() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Store Badge ─────────────────────────────────────────────── */
const STORE_BADGE_CONFIG = {
  'app-store': {
    src: '/everybible/badge-app-store.svg',
    alt: 'Download on the App Store',
    width: 135,
    height: 40,
  },
  'google-play': {
    src: '/everybible/badge-google-play.png',
    alt: 'Get it on Google Play',
    width: 152,
    height: 58,
  },
} as const;

function StoreBadge({
  href,
  platform,
}: {
  eyebrow: string;
  label: string;
  href: string;
  platform: 'google-play' | 'app-store';
}) {
  const badge = STORE_BADGE_CONFIG[platform];
  return (
    <a className="store-badge" href={href} aria-label={badge.alt}>
      <Image
        src={badge.src}
        alt={badge.alt}
        width={badge.width}
        height={badge.height}
        unoptimized={platform === 'app-store'}
      />
    </a>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default async function Home() {
  const { featureCards, heroContent, verseOfDay } = await getHomepageContent();

  return (
    <main>
      {/* ── Header ── */}
      <header className="site-header" aria-label="EveryBible navigation">
        <div className="site-header__inner">
          <a className="site-wordmark" href="/" aria-label="EveryBible">
            <Image
              className="site-wordmark__mark"
              src="/everylanguage/symbol-blue.png"
              alt=""
              width={42}
              height={30}
              priority
            />
            <span>EveryBible</span>
          </a>

          <nav className="site-nav" aria-label="Primary">
            {siteNavigation.map((item) => (
              <a key={item.label} href={item.href} className="site-nav__link">
                {item.label}
              </a>
            ))}
          </nav>

          <a className="site-nav__cta" href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>
            Get the App
          </a>

          <div className="site-mobile-menu">
            <a href="/about">Mission</a>
            <a className="site-mobile-menu__cta" href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>
              Get the App
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero" id="top">
        <div className="wrap hero__inner">

          {/* Left: text */}
          <div className="hero__text">
            <span className="hero__eyebrow" aria-hidden="true">
              <span className="hero__eyebrow-dot" />
              Free · No Ads · No Purchases
            </span>

            <h1 className="hero__headline">
              God&rsquo;s Word.<br />
              <span>Every Language.</span><br />
              Every Device.
            </h1>

            <p className="hero__sub">
              {heroContent.description}
            </p>

            <div className="hero__badges" id="download">
              {heroContent.storeLinks.map((store) => (
                <StoreBadge
                  key={store.label}
                  eyebrow={store.eyebrow}
                  label={store.label}
                  href={store.href}
                  platform={store.platform}
                />
              ))}
            </div>

            <a className="hero__link" href="/about">
              See the mission behind EveryBible <ArrowRight />
            </a>
          </div>

          {/* Right: devices */}
          <div className="hero__visual">
            <HeroDeviceStack />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div className="stats">
        <div className="wrap">
          <div className="stats__inner">
            <div className="stats__item">
              <span className="stats__number">233</span>
              <span className="stats__label">Bible Translations</span>
            </div>
            <div className="stats__item">
              <span className="stats__number">174</span>
              <span className="stats__label">Languages</span>
            </div>
            <div className="stats__item">
              <span className="stats__number">Free</span>
              <span className="stats__label">Forever</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="features" id="mission" aria-labelledby="features-title">
        <div className="wrap">
          <header className="features__header">
            <span className="features__eyebrow">Why EveryBible</span>
            <h2 className="features__title" id="features-title">
              Everything you need<br />from God&rsquo;s Word.
            </h2>
          </header>

          <div className="features__grid">
            {featureCards.map((card) => (
              <article key={card.title} className="feature-card">
                <Image
                  className="feature-card__icon"
                  src={card.iconSrc}
                  alt=""
                  width={48}
                  height={48}
                  aria-hidden="true"
                />
                <h3 className="feature-card__title">{card.title}</h3>
                <p className="feature-card__desc">{card.description}</p>
                <a className="feature-card__link" href={card.href}>
                  {card.actionLabel} <ArrowRight />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scripture ── */}
      <section className="scripture" id="verse-of-the-day" aria-label="Verse of the Day">
        <div className="wrap">
          <div className="scripture__inner">
            <p className="scripture__label">Verse of the Day</p>

            <blockquote className="scripture__quote">
              {verseOfDay.verse}
            </blockquote>

            <p className="scripture__ref">{verseOfDay.reference}</p>

            <a className="scripture__cta" href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>
              <DownloadIcon />
              Get Daily Verses Free
            </a>
          </div>
        </div>
      </section>

      {/* ── Download CTA ── */}
      <section className="download-cta" aria-label="Download EveryBible">
        <div className="wrap">
          <div className="download-cta__inner">
            <h2 className="download-cta__headline">
              Read it. Hear it.<br />Keep it.
            </h2>
            <p className="download-cta__sub">
              EveryBible is completely free — no ads, no purchases, no subscriptions. Just God&rsquo;s Word.
            </p>
            <div className="download-cta__actions">
              <div className="download-cta__badges">
                <StoreBadge
                  eyebrow="Download on the"
                  label="App Store"
                  href={EVERYBIBLE_APP_STORE_URL}
                  platform="app-store"
                />
                <StoreBadge
                  eyebrow="Get it on"
                  label="Google Play"
                  href={EVERYBIBLE_GOOGLE_PLAY_URL}
                  platform="google-play"
                />
              </div>

              <div className="download-cta__qr">
                <div className="download-cta__qr-card">
                  <Image
                    className="download-cta__qr-image"
                    src="/everybible/download-qr.svg"
                    alt="QR code that opens the right EveryBible store page for your phone."
                    width={220}
                    height={220}
                    unoptimized
                  />
                  <div className="download-cta__qr-icon-shell" aria-hidden="true">
                    <Image
                      className="download-cta__qr-icon"
                      src="/everybible/app-icon.png"
                      alt=""
                      width={56}
                      height={56}
                    />
                  </div>
                </div>
                <div className="download-cta__qr-copy">
                  <a className="download-cta__qr-link" href={EVERYBIBLE_SMART_DOWNLOAD_URL}>
                    {EVERYBIBLE_SMART_DOWNLOAD_URL.replace('https://', '')}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="site-footer" aria-label="Site footer">
        <div className="wrap site-footer__inner">
          <div className="site-footer__top">
            <div className="site-footer__brand">
              <h2>EveryBible</h2>
              <p>
                Encouraging and equipping every person to seek intimacy with God every day in their own language.
              </p>
            </div>

            <div className="site-footer__columns">
              {footerColumns.map((column) => (
                <div key={column.title} className="site-footer__column">
                  <h3>{column.title}</h3>
                  <ul>
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <a href={link.href}>{link.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="site-footer__bottom">
            <p className="site-footer__meta">
              A digital ministry. Free to use, free to share.
            </p>
            <div className="site-footer__legal">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
