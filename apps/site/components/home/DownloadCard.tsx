'use client';

/* eslint-disable @next/next/no-img-element -- staticImageProps gives next/image's
   optimized srcset without its client component (see lib/static-image.ts). */
import { useEffect, useState } from 'react';

import type { HomeCopy } from '../../lib/home-copy';
import {
  detectPlatform,
  type DevicePlatform,
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_DOWNLOAD_ANCHOR,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_SMART_DOWNLOAD_PATH,
} from '../../lib/site-links';
import { staticImageProps } from '../../lib/static-image';

const downloadQr = staticImageProps('/everybible/download-qr.svg', 104, 104, {
  unoptimized: true,
});
const appStoreBadge = staticImageProps('/everybible/badge-app-store.svg', 140, 42, {
  unoptimized: true,
});
const googlePlayBadge = staticImageProps('/everybible/badge-google-play.png', 141, 42);

/**
 * Platform-aware download card. The server renders the desktop variant (QR
 * plus both stores); phones swap to their own store after hydration, and the
 * QR is hidden under 760px by CSS so a phone never sees it first.
 * /download sends desktop browsers to this card's anchor.
 */
export function DownloadCard({ copy }: { copy: HomeCopy['app']['download'] }) {
  const [platform, setPlatform] = useState<DevicePlatform>('other');

  useEffect(() => {
    // Platform is only knowable in the browser; the server render stays "other".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform(navigator.userAgent));
  }, []);

  const hint =
    platform === 'ios'
      ? copy.iosHint
      : platform === 'android'
        ? copy.androidHint
        : copy.desktopHint;

  return (
    <div className="home-download" id={EVERYBIBLE_DOWNLOAD_ANCHOR}>
      {platform === 'other' && (
        <a
          className="home-download__qr"
          href={EVERYBIBLE_SMART_DOWNLOAD_PATH}
          aria-label={copy.qrAlt}
        >
          <img {...downloadQr} alt={copy.qrAlt} />
        </a>
      )}
      <div className="home-download__body">
        <h3>{copy.title}</h3>
        <p>{hint}</p>
        <div className="home-download__stores">
          {platform !== 'android' && (
            <a href={EVERYBIBLE_APP_STORE_URL}>
              <img {...appStoreBadge} alt={copy.appStoreAlt} />
            </a>
          )}
          {platform !== 'ios' && (
            <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>
              <img {...googlePlayBadge} alt={copy.googlePlayAlt} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
