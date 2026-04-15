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

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.398 2.737c.43-.521 1.156-.884 1.781-.95.078.742-.207 1.5-.617 2.031-.43.57-1.137.971-1.851.914-.098-.713.234-1.471.687-1.995ZM17.18 12.447c.02 2.215 1.942 2.951 1.963 2.961-.016.051-.307 1.033-1.01 2.043-.609.873-1.242 1.742-2.238 1.762-.977.02-1.291-.568-2.412-.568-1.123 0-1.473.549-2.394.588-.957.039-1.687-.938-2.301-1.807-1.252-1.771-2.207-5.008-.922-7.197.639-1.084 1.785-1.771 3.031-1.791.947-.02 1.842.617 2.412.617.568 0 1.633-.764 2.752-.652.469.02 1.781.189 2.625 1.396-.07.043-1.566.902-1.506 2.648Z" />
    </svg>
  );
}

function GooglePlayLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 3.8 13.93 13.2 4.7 22.4a1.2 1.2 0 0 1-.2-.67V4.42c0-.23.08-.45.22-.62Z" fill="#34A853" />
      <path d="M18.03 10.94 15.13 9.3 11.7 12.73l3.52 3.5 2.8-1.58c1.33-.76 1.33-2.95.01-3.7Z" fill="#FBBC04" />
      <path d="M15.22 16.23 11.7 12.73 13.93 10.5l1.2.68 2.9 1.66-2.8 1.58Z" fill="#EA4335" />
      <path d="M4.7 3.6 15.13 9.3 11.7 12.73 4.5 5.54V4.42c0-.3.07-.58.2-.82Z" fill="#4285F4" />
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
function StoreBadge({
  eyebrow,
  label,
  href,
  platform,
}: {
  eyebrow: string;
  label: string;
  href: string;
  platform: 'google-play' | 'app-store';
}) {
  return (
    <a className="store-badge" href={href} aria-label={label}>
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
        {platform === 'app-store' ? <AppleLogo /> : <GooglePlayLogo />}
      </span>
      <span className="store-badge__text">
        <span className="store-badge__eyebrow">{eyebrow}</span>
        <span className="store-badge__label">{label}</span>
      </span>
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
            EveryBible
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
              <em>Every Language.</em><br />
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
                <div className="feature-card__accent" aria-hidden="true" />
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
              &ldquo;{verseOfDay.verse}&rdquo;
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
                </div>
                <div className="download-cta__qr-copy">
                  <p className="download-cta__qr-eyebrow">Scan on your phone</p>
                  <p className="download-cta__qr-text">
                    Android opens Google Play. iPhone opens the App Store.
                  </p>
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
