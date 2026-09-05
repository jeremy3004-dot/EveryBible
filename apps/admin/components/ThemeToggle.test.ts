import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeToggle } from './ThemeToggle';

test('theme toggle initial markup stays identical when saved browser theme is dark', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const reactDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'React');
  try {
    // tsx's JSX runtime in the Node test process uses React.createElement.
    Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
    const serverMarkup = renderToStaticMarkup(React.createElement(ThemeToggle));
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset: { theme: 'dark' } } },
    });
    const hydrationMarkup = renderToStaticMarkup(React.createElement(ThemeToggle));
    assert.equal(
      hydrationMarkup,
      serverMarkup,
      'initial hydration must use the same snapshot; the saved theme is synchronized after hydration'
    );
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
    if (reactDescriptor) Object.defineProperty(globalThis, 'React', reactDescriptor);
    else Reflect.deleteProperty(globalThis, 'React');
  }
});
