import Image from 'next/image';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { listContentImages } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime, getError, getNotice } from '@/lib/format';

import { updateContentImageAction, uploadContentImageAction } from '../../actions';

interface ContentImagesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContentImagesPage({ searchParams }: ContentImagesPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const notice = getNotice(resolvedSearchParams);
  const error = getError(resolvedSearchParams);
  const images = await listContentImages();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Phase 5</p>
          <h2>Content image operations</h2>
          <p className="page-copy">
            Upload, schedule, and retire EveryBible-owned imagery without mixing those workflows
            into the upstream translation system.
          </p>
        </div>
      </section>

      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--danger">{error}</p> : null}

      <section className="two-column">
        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Upload</p>
              <h3>Add a new content image</h3>
            </div>
          </div>

          <form action={uploadContentImageAction} className="stack-form">
            <label>
              Image file
              <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
            <label>
              Title
              <input name="title" type="text" placeholder="Palm Sunday hero" required />
            </label>
            <label>
              Kind
              <select name="kind" defaultValue="promo">
                <option value="promo">promo</option>
                <option value="hero">hero</option>
                <option value="verse_of_day">verse_of_day</option>
                <option value="feature">feature</option>
                <option value="social">social</option>
              </select>
            </label>
            <label>
              Alt text
              <input name="altText" type="text" placeholder="Open Bible on a wooden table" required />
            </label>
            <label>
              Caption
              <textarea name="caption" rows={3} placeholder="Optional internal or promotional note" />
            </label>
            <div className="form-grid">
              <label>
                State
                <select name="state" defaultValue="draft">
                  <option value="draft">draft</option>
                  <option value="scheduled">scheduled</option>
                  <option value="live">live</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>
                Starts at
                <input name="startsAt" type="datetime-local" />
              </label>
            </div>
            <button type="submit" className="button button--primary">
              Upload image
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Current library</p>
              <h3>Live and draft artwork</h3>
            </div>
          </div>

          <div className="image-grid">
            {images.map((image) => (
              <article key={image.id} className="image-card">
                <div className="image-card__preview">
                  <Image
                    src={image.public_url}
                    alt={image.alt_text}
                    fill
                    sizes="(max-width: 900px) 100vw, 320px"
                  />
                </div>
                <div className="image-card__body">
                  <div className="stack-inline">
                    <h3>{image.title}</h3>
                    <StatusPill
                      tone={
                        image.state === 'live'
                          ? 'success'
                          : image.state === 'scheduled'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {image.state}
                    </StatusPill>
                  </div>
                  <p className="table-note">
                    {image.kind} · Updated {formatDateTime(image.updated_at)}
                  </p>
                  <form action={updateContentImageAction} className="stack-form stack-form--compact">
                    <input type="hidden" name="id" value={image.id} />
                    <label>
                      Title
                      <input name="title" type="text" defaultValue={image.title} />
                    </label>
                    <label>
                      Alt text
                      <input name="altText" type="text" defaultValue={image.alt_text} />
                    </label>
                    <label>
                      State
                      <select name="state" defaultValue={image.state}>
                        <option value="draft">draft</option>
                        <option value="scheduled">scheduled</option>
                        <option value="live">live</option>
                        <option value="archived">archived</option>
                      </select>
                    </label>
                    <label>
                      Starts at
                      <input name="startsAt" type="datetime-local" />
                    </label>
                    <button type="submit" className="button">
                      Save
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
