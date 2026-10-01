import type { FormattedStoryStats } from '../../lib/atlas-story';
import { fillCopy, type HomeCopy } from '../../lib/home-copy';

export type { FormattedStoryStats as AtlasStoryStats } from '../../lib/atlas-story';

/**
 * The hero and the three scroll steps told over the pinned globe. Server
 * rendered with build-time counts, so the numbers never flash in.
 */
export function AtlasStorySteps({
  copy,
  stats,
  hidden,
  onExplore,
  onSources,
}: {
  copy: HomeCopy;
  stats: FormattedStoryStats;
  hidden: boolean;
  onExplore: () => void;
  onSources: () => void;
}) {
  const { hero, story } = copy;
  return (
    <div className="pa-steps" aria-hidden={hidden || undefined} inert={hidden}>
      <div className="pa-step pa-step--hero" data-story-step="0">
        <div className="pa-hero">
          <p className="pa-eyebrow">
            <span /> {hero.eyebrow}
          </p>
          <h1>
            {hero.titleLine1}
            <br />
            <em>{hero.titleLine2}</em>
          </h1>
          <p className="pa-hero-lede">{hero.lede}</p>
          <div className="pa-hero-actions">
            <a className="pa-button pa-button--primary" href="/download">
              {hero.primaryCta}
            </a>
            <button type="button" className="pa-button pa-button--quiet" onClick={onExplore}>
              {hero.exploreCta}
              <span className="pa-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </div>
        <p className="pa-scroll-hint" aria-hidden="true">
          {hero.scrollHint}
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </p>
      </div>

      <section className="pa-step" data-story-step="1" aria-labelledby="pa-step-1">
        <div className="pa-step-card">
          <p className="pa-step-eyebrow">{story.languages.eyebrow}</p>
          <h2 id="pa-step-1">{story.languages.title}</h2>
          <p>{fillCopy(story.languages.body, { languages: stats.languages })}</p>
        </div>
      </section>

      <section className="pa-step" data-story-step="2" aria-labelledby="pa-step-2">
        <div className="pa-step-card">
          <p className="pa-step-eyebrow">
            <i className="pa-dot pa-dot--need" aria-hidden="true" />
            {story.noScripture.eyebrow}
          </p>
          <h2 id="pa-step-2">{fillCopy(story.noScripture.title, { count: stats.noScripture })}</h2>
          <p>{story.noScripture.body}</p>
        </div>
      </section>

      <section className="pa-step" data-story-step="3" aria-labelledby="pa-step-3">
        <div className="pa-step-card">
          <p className="pa-step-eyebrow">
            <i className="pa-dot pa-dot--app" aria-hidden="true" />
            {story.inTheApp.eyebrow}
          </p>
          <h2 id="pa-step-3">{fillCopy(story.inTheApp.title, { count: stats.inApp })}</h2>
          <p>{story.inTheApp.body}</p>
          <div className="pa-step-actions">
            <a className="pa-button pa-button--primary" href="#app">
              {story.inTheApp.cta}
            </a>
            <button type="button" className="pa-button pa-button--quiet" onClick={onExplore}>
              {hero.exploreCta}
              <span className="pa-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </div>
        <p className="pa-sources-line">
          {story.sources}{' '}
          <button type="button" onClick={onSources}>
            {story.sourcesLink}
          </button>
        </p>
      </section>
    </div>
  );
}
