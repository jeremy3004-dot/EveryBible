import Image from 'next/image';

import { appStoreScreenshots } from '../lib/site-content';

export function AppStoreScreenshotShowcase() {
  return (
    <section className="app-showcase" id="screenshots" aria-labelledby="app-showcase-title">
      <div className="wrap">
        <header className="app-showcase__header">
          <span className="app-showcase__eyebrow">Inside EveryBible</span>
          <h2 className="app-showcase__title" id="app-showcase-title">
            A calmer way to stay close to Scripture.
          </h2>
          <p className="app-showcase__sub">
            Read, grow, and build a daily rhythm in an app designed to keep God&rsquo;s Word within
            reach.
          </p>
        </header>

        <div className="app-showcase__grid">
          {appStoreScreenshots.map((screenshot, index) => (
            <figure className="app-showcase__card" key={screenshot.src}>
              <div className="app-showcase__image-shell">
                <Image
                  src={screenshot.src}
                  alt={screenshot.alt}
                  width={1320}
                  height={2868}
                  priority={index === 0}
                  sizes="(max-width: 560px) 46vw, (max-width: 980px) 46vw, 280px"
                />
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
