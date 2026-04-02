import Image from 'next/image';

import { getHomepageContent } from '../lib/homepage-content';
import {
  footerColumns,
  footerSocialLinks,
  mobileTabs,
  siteNavigation,
} from '../lib/site-content';

export const dynamic = 'force-dynamic';

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11.293 18.26a1 1 0 0 0 1.414 1.415l6.647-6.647a1.5 1.5 0 0 0 0-2.121L12.707 4.26a1 1 0 1 0-1.414 1.415l4.899 4.898a.25.25 0 0 1-.177.427H5a1 1 0 0 0 0 2h10.95a.25.25 0 0 1 .177.427l-4.834 4.833Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.5 19a7.5 7.5 0 1 1 5.963-2.95l3.336 3.335a1 1 0 0 1-1.414 1.414l-3.336-3.336A7.467 7.467 0 0 1 10.5 19Zm0-2.031a5.469 5.469 0 1 1 0-10.938 5.469 5.469 0 0 1 0 10.938Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.765 18.636C8.89 16.748 8.363 14.867 8.21 13H5.07a7.008 7.008 0 0 0 4.694 5.636ZM13.78 13c-.172 1.816-.762 3.698-1.781 5.648-1.019-1.95-1.609-3.832-1.781-5.648h3.562Zm-3.583-2c.141-1.836.729-3.645 1.802-5.43 1.073 1.785 1.66 3.594 1.802 5.43h-3.604Zm5.591 2c-.152 1.867-.68 3.748-1.554 5.636A7.009 7.009 0 0 0 18.93 13h-3.14Zm-1.622-7.658A7.008 7.008 0 0 1 18.929 11h-3.122c-.127-1.94-.674-3.829-1.64-5.658Zm-4.334 0C8.867 7.172 8.32 9.06 8.193 11H5.071a7.008 7.008 0 0 1 4.762-5.658Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5A1 1 0 0 1 4 7Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM5 19.5A5.5 5.5 0 0 1 10.5 14h3A5.5 5.5 0 0 1 19 19.5a1 1 0 1 1-2 0 3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 19.5a1 1 0 1 1-2 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 15.5a3.5 3.5 0 0 0-2.74 1.31L10 14.56a3.51 3.51 0 0 0 0-5.12l4.26-2.25A3.5 3.5 0 1 0 13.5 5c0 .42.08.82.22 1.19L9.46 8.44a3.5 3.5 0 1 0 0 7.12l4.26 2.25A3.5 3.5 0 1 0 17 15.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AppStoreLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.398 2.737c.43-.521 1.156-.884 1.781-.95.078.742-.207 1.5-.617 2.031-.43.57-1.137.971-1.851.914-.098-.713.234-1.471.687-1.995ZM17.18 12.447c.02 2.215 1.942 2.951 1.963 2.961-.016.051-.307 1.033-1.01 2.043-.609.873-1.242 1.742-2.238 1.762-.977.02-1.291-.568-2.412-.568-1.123 0-1.473.549-2.394.588-.957.039-1.687-.938-2.301-1.807-1.252-1.771-2.207-5.008-.922-7.197.639-1.084 1.785-1.771 3.031-1.791.947-.02 1.842.617 2.412.617.568 0 1.633-.764 2.752-.652.469.02 1.781.189 2.625 1.396-.07.043-1.566.902-1.506 2.648Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlayStoreLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 3.8 13.93 13.2 4.7 22.4a1.2 1.2 0 0 1-.2-.67V4.42c0-.23.08-.45.22-.62Z" fill="#34A853" />
      <path d="M18.03 10.94 15.13 9.3 11.7 12.73l3.52 3.5 2.8-1.58c1.33-.76 1.33-2.95.01-3.7Z" fill="#FBBC04" />
      <path d="M15.22 16.23 11.7 12.73 13.93 10.5l1.2.68 2.9 1.66-2.8 1.58Z" fill="#EA4335" />
      <path d="M4.7 3.6 15.13 9.3 11.7 12.73 4.5 5.54V4.42c0-.3.07-.58.2-.82Z" fill="#4285F4" />
    </svg>
  );
}

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
  const Logo = platform === 'app-store' ? AppStoreLogo : PlayStoreLogo;

  return (
    <a className="store-badge" href={href} aria-label={label}>
      <span className="store-badge__logo" aria-hidden="true">
        <Logo />
      </span>
      <span className="store-badge__copy">
        <span className="store-badge__eyebrow">{eyebrow}</span>
        <span className="store-badge__label">{label}</span>
      </span>
    </a>
  );
}

function TabIcon({ icon }: { icon: 'home' | 'bible' | 'plans' | 'videos' }) {
  const paths = {
    home: 'M4.5 10.75 12 4l7.5 6.75V19a1 1 0 0 1-1 1H14v-5h-4v5H5.5a1 1 0 0 1-1-1v-8.25Z',
    bible:
      'M7 5.5A2.5 2.5 0 0 1 9.5 3H18v16h-8.5A2.5 2.5 0 0 0 7 21V5.5Zm2.5-.5a.5.5 0 0 0-.5.5V17a4.43 4.43 0 0 1 .5-.03H16V5H9.5Z',
    plans:
      'M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14l-2.5-1.5L13 19l-2.5-1.5L8 19 6 17.8V5Zm3 2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Zm0 4a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H9Z',
    videos:
      'M7 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Zm3.5 3.5 4 2.5-4 2.5v-5Z',
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[icon]} fill="currentColor" />
    </svg>
  );
}

export default async function Home() {
  const { featureCards, heroContent, verseOfDay } = await getHomepageContent();

  return (
    <main className="site-home" id="top">
      <header className="site-header" aria-label="EveryBible navigation">
        <div className="site-header__inner">
          <a className="site-wordmark" href="#top" aria-label="EveryBible homepage">
            EveryBible
          </a>

          <nav className="site-nav" aria-label="Primary">
            {siteNavigation.map((item) => (
              <a key={item.label} href={item.href} className="site-nav__link">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="site-search" aria-label="Search">
            <input
              aria-label="Search"
              name="Search"
              placeholder="Search verses, topics, and questions..."
              type="search"
            />
            <button type="button" aria-label="Search">
              <SearchIcon />
            </button>
          </div>

          <a className="site-nav__link site-nav__link--cta" href="#download">
            Get the app
          </a>

          <a className="site-language" href="#footer-language" aria-label="Language Selector">
            <GlobeIcon />
          </a>

          <a className="site-profile" href="#download" aria-label="Profile">
            <ProfileIcon />
          </a>

          <div className="site-mobile-tools">
            <button type="button" aria-label="Search">
              <SearchIcon />
            </button>
            <button type="button" aria-label="Menu">
              <MenuIcon />
            </button>
            <button type="button" aria-label="Profile">
              <ProfileIcon />
            </button>
          </div>
        </div>
      </header>

      <section className="download-hero">
        <div className="container container--hero">
          <a className="skip-button" href="#mission">
            Skip this page in the future
          </a>

          <div className="download-hero__content">
            <a className="download-hero__copy" href="#download">
              <h1>{heroContent.title}</h1>
              <h2>{heroContent.description}</h2>
            </a>

            <div className="hero-visual" aria-hidden="true">
              <Image
                src={heroContent.visual.src}
                alt={heroContent.visual.alt}
                width={768}
                height={768}
                priority
              />
            </div>

            <div className="store-badges" id="download" aria-label="Download EveryBible">
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

            <a className="inline-arrow-link" href={heroContent.inlineLink.href}>
              <span>{heroContent.inlineLink.label}</span>
              <ArrowRightIcon />
            </a>
          </div>
        </div>
      </section>

      <nav className="mobile-tabs" aria-label="Mobile">
        {mobileTabs.map((tab) => (
          <a
            key={tab.label}
            href={tab.href}
            className={tab.active ? 'mobile-tabs__item mobile-tabs__item--active' : 'mobile-tabs__item'}
          >
            <TabIcon icon={tab.icon} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>

      <section className="feature-strip" id="mission" aria-labelledby="mission-title">
        <div className="container container--features">
          {featureCards.map((card, index) => (
            <article
              key={card.title}
              className="feature-card"
              aria-labelledby={index === 0 ? 'mission-title' : undefined}
            >
              <div className="feature-card__icon">
                <Image src={card.iconSrc} alt={card.iconAlt} width={48} height={48} />
              </div>
              <h2 id={index === 0 ? 'mission-title' : undefined}>{card.title}</h2>
              <p>{card.description}</p>
              <a href={card.href}>{card.actionLabel}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="verse-section" id="bible-online">
        <div className="verse-section__backdrop" />
        <div className="container verse-section__inner">
          <div className="verse-card" id="verse-of-the-day">
            <div className="verse-card__image">
              <Image
                src={verseOfDay.imageSrc}
                alt={verseOfDay.imageAlt}
                fill
                sizes="(max-width: 768px) 100vw, 40vw"
              />
            </div>

            <div className="verse-card__content">
              <div className="verse-card__label">
                <Image
                  src="/everybible/icons/verse-of-day.svg"
                  alt="Verse of the Day"
                  width={30}
                  height={30}
                />
                <a href="#verse-of-the-day">{verseOfDay.label}</a>
              </div>

              <a className="verse-card__copy" href="#verse-of-the-day">
                <h2>{verseOfDay.verse}</h2>
                <p>{verseOfDay.reference}</p>
              </a>

              <div className="verse-card__actions">
                <a className="button button--primary" href={verseOfDay.primaryAction.href}>
                  <ShareIcon />
                  <span>{verseOfDay.primaryAction.label}</span>
                </a>
                <a className="button button--secondary" href={verseOfDay.secondaryAction.href}>
                  {verseOfDay.secondaryAction.label}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="download-cta" id="plans">
        <div className="container container--cta">
          <h2>Install the App Now</h2>
          <p>EveryBible is completely free, with no advertising and no in-app purchases.</p>
          <a className="button button--dark" href="#download">
            Download the Free EveryBible App
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <div className="site-footer__top">
            <div className="site-footer__brand">
              <h2>EveryBible</h2>
              <p>
                Encouraging and equipping every person to seek intimacy with God every day in
                their own language.
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
            <div className="site-footer__meta">
              <p>A digital ministry helping provide the Word of God free of charge.</p>
              <div className="site-footer__legal">
                <a href="/privacy">Privacy Policy</a>
                <a href="/terms">Terms</a>
              </div>
            </div>

            <div className="site-footer__actions">
              <a className="language-pill" href="#top" id="footer-language">
                <GlobeIcon />
                <span>English (US)</span>
              </a>
              {footerSocialLinks.length > 0 ? (
                <div className="site-footer__socials">
                  {footerSocialLinks.map((link) => (
                    <a key={link.label} href={link.href} aria-label={link.label}>
                      {link.label.slice(0, 2).toUpperCase()}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
