/** The picture's shape: the preview frame is laid out at this width-to-height ratio. */
export const VERSE_IMAGE_ASPECT_RATIO = 1.08;

/** Social apps downscale past this, so a larger capture only costs memory and upload time. */
export const VERSE_IMAGE_CAPTURE_WIDTH = 1080;

export const VERSE_IMAGE_SHARE_MIME_TYPE = 'image/jpeg';
export const VERSE_IMAGE_SHARE_UTI = 'public.jpeg';

/**
 * Options for capturing the preview. Without an explicit size view-shot renders at the
 * device pixel ratio (a 3x phone or a tablet yields a multi-megabyte PNG); the photo
 * backgrounds compress far better as JPEG. A file, never base64, which would pass the
 * whole image through the JS thread.
 */
export const getVerseImageCaptureOptions = () => ({
  format: 'jpg' as const,
  quality: 0.9,
  result: 'tmpfile' as const,
  width: VERSE_IMAGE_CAPTURE_WIDTH,
  height: Math.round(VERSE_IMAGE_CAPTURE_WIDTH / VERSE_IMAGE_ASPECT_RATIO),
});
