import Image from 'next/image';

import { siteNavigation } from '../lib/site-content';
import { EVERYBIBLE_SMART_DOWNLOAD_PATH } from '../lib/site-links';

/**
 * Shared marketing header. Used by the homepage and every static page so the
 * whole site carries the same navigation and brand chrome.
 */
export function SiteHeader() {
  return (
    <header className="site-header" aria-label="EveryBible navigation">
      <div className="site-header__inner">
        <a className="site-wordmark" href="/" aria-label="EveryBible">
          <Image
            className="site-wordmark__mark"
            src="/everybible/app-icon.png"
            alt=""
            width={34}
            height={34}
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
  );
}
