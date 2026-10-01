import { homeCopyEn, type HomeCopy } from '../lib/home-copy';
import { siteNavigation } from '../lib/site-content';
import { EVERYBIBLE_SMART_DOWNLOAD_PATH } from '../lib/site-links';
import { HeaderScrollState } from './HeaderScrollState';
import { MobileMenu } from './MobileMenu';

/**
 * Shared marketing header. Used by the homepage and every static page so the
 * whole site carries the same navigation and brand chrome. `overlay` floats
 * it transparently over the homepage map until the page scrolls, when
 * `HeaderScrollState` gives it a solid surface.
 */
export function SiteHeader({
  overlay = false,
  mainId = 'main',
  nav = homeCopyEn.nav,
  homeHref = '/',
}: {
  overlay?: boolean;
  mainId?: string;
  nav?: HomeCopy['nav'];
  homeHref?: string;
} = {}) {
  const items = siteNavigation.map((item) => ({
    label: nav[item.key],
    href: item.href,
    emphasis: item.key === 'give',
  }));

  return (
    <header
      className={overlay ? 'site-header site-header--overlay' : 'site-header'}
      aria-label="EveryBible navigation"
    >
      {overlay ? <HeaderScrollState /> : null}
      {/* Keyboard users skip the seven header stops. Hidden until focused. */}
      <a className="skip-link" href={`#${mainId}`}>
        {nav.skipToContent}
      </a>
      <div className="site-header__inner">
        <a className="site-wordmark" href={homeHref} aria-label="EveryBible">
          <span>EveryBible</span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          {items.map((item) => (
            <a
              key={item.href + item.label}
              href={item.href}
              className={item.emphasis ? 'site-nav__link site-nav__link--give' : 'site-nav__link'}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a className="site-nav__cta" href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>
          {nav.getApp}
        </a>

        <MobileMenu
          items={items}
          ctaLabel={nav.getApp}
          ctaHref={EVERYBIBLE_SMART_DOWNLOAD_PATH}
          menuLabel={nav.menu}
          closeLabel={nav.closeMenu}
        />
      </div>
    </header>
  );
}
