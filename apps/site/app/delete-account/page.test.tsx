import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import DeleteAccountPage, { metadata } from './page';
import PrivacyPage from '../privacy/page';

function render(element: React.ReactElement): string {
  const reactDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'React');
  try {
    // tsx's JSX runtime in the Node test process uses React.createElement.
    Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
    return renderToStaticMarkup(element);
  } finally {
    if (reactDescriptor) Object.defineProperty(globalThis, 'React', reactDescriptor);
    else Reflect.deleteProperty(globalThis, 'React');
  }
}

test('/delete-account renders the in-app steps, the email route and what is kept', () => {
  const html = render(React.createElement(DeleteAccountPage));

  assert.match(html, /<h1>Delete your EveryBible account<\/h1>/);
  assert.match(
    html,
    /Scroll to the <strong>Data<\/strong> section and tap <strong>Delete Account<\/strong>/
  );
  assert.match(
    html,
    /href="mailto:hello@everybible.app\?subject=Delete%20my%20EveryBible%20account"/
  );
  assert.match(html, /What we keep, without your name/);
  assert.match(html, /href="\/privacy"/);
  // The shared footer links the page from every static page.
  assert.match(html, /<a href="\/delete-account">Delete your account<\/a>/);
  assert.deepEqual(metadata.alternates, { canonical: '/delete-account' });
});

test('/privacy renders from the shared document and links the deletion page', () => {
  const html = render(React.createElement(PrivacyPage));

  assert.match(html, /<h1>Privacy Policy<\/h1>/);
  assert.match(html, /Last updated: September 24, 2026/);
  assert.match(html, /<h2>Crash and error reports<\/h2>/);
  assert.match(html, /<a href="\/delete-account">account deletion page<\/a>/);
});
