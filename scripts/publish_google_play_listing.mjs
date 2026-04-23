import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const packageName = 'com.everybible.app';
const language = 'en-US';
const serviceAccountFile = path.resolve('google-play-service-account.json');
const listingMd = fs.readFileSync(path.resolve('store-assets/google-play-listing.md'), 'utf8');

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function sectionValue(title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`);
  const match = listingMd.match(re);
  if (!match) {
    throw new Error(`Missing section: ${title}`);
  }
  return match[1].trim();
}

async function getToken() {
  const key = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )}`;
  const assertion = `${unsigned}.${base64url(
    crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key)
  )}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to acquire token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function api(token, method, url, { json } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(
      `${method} ${url} failed ${res.status}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

async function upload(token, editId, imageType, filePath, label) {
  const url =
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3` +
    `/applications/${packageName}/edits/${editId}/listings/${encodeURIComponent(language)}` +
    `/${imageType}?uploadType=media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png',
    },
    body: fs.readFileSync(filePath),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(
      `Upload ${label} failed ${res.status}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }

  console.log(`Uploaded ${label}`);
  return data;
}

async function main() {
  const appName = sectionValue('App Name (50 characters max)');
  const shortDescription = sectionValue('Short Description (80 characters max)');
  const fullDescription = sectionValue('Full Description (4000 characters max)');

  const generatedRoot = path.resolve('.tmp/google-play-listing');
  fs.mkdirSync(generatedRoot, { recursive: true });

  const iconPath = path.join(generatedRoot, 'icon-512.png');
  await sharp(path.resolve('assets/icon.png')).resize(512, 512).png().toFile(iconPath);

  const screenshotsDir = path.resolve('store-metadata/screenshots/google-play');
  const featureGraphicPath = path.join(screenshotsDir, 'feature-graphic.png');
  const screenshotFiles = [
    '01-read-offline.png',
    '02-track-habit.png',
    '03-highlight-verses.png',
    '04-share-verse-cards.png',
    '05-save-notes.png',
    '06-grow-foundations.png',
    '07-find-wisdom.png',
  ].map((file) => path.join(screenshotsDir, file));

  for (const file of [iconPath, featureGraphicPath, ...screenshotFiles]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing required asset: ${file}`);
    }
  }

  const token = await getToken();
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
  const edit = await api(token, 'POST', `${base}/applications/${packageName}/edits`);
  const editId = edit.id;
  if (!editId) {
    throw new Error(`No edit id in response: ${JSON.stringify(edit)}`);
  }
  console.log(`Created edit ${editId}`);

  await api(
    token,
    'PUT',
    `${base}/applications/${packageName}/edits/${editId}/listings/${encodeURIComponent(language)}`,
    {
      json: {
        language,
        title: appName,
        shortDescription,
        fullDescription,
      },
    }
  );
  console.log('Updated listing text');

  for (const imageType of ['icon', 'featureGraphic', 'phoneScreenshots']) {
    try {
      await api(
        token,
        'DELETE',
        `${base}/applications/${packageName}/edits/${editId}/listings/${encodeURIComponent(
          language
        )}/${imageType}`
      );
      console.log(`Cleared ${imageType}`);
    } catch (error) {
      console.log(`Could not clear ${imageType}: ${error.message}`);
    }
  }

  await upload(token, editId, 'icon', iconPath, 'icon');
  await upload(token, editId, 'featureGraphic', featureGraphicPath, 'feature graphic');
  for (const file of screenshotFiles) {
    await upload(token, editId, 'phoneScreenshots', file, path.basename(file));
  }

  try {
    const validation = await api(
      token,
      'POST',
      `${base}/applications/${packageName}/edits/${editId}:validate`
    );
    console.log(`Validation response: ${JSON.stringify(validation)}`);
  } catch (error) {
    console.log(`Validation skipped: ${error.message}`);
  }

  const commit = await api(
    token,
    'POST',
    `${base}/applications/${packageName}/edits/${editId}:commit`
  );
  console.log(`Commit response: ${JSON.stringify(commit)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
