'use client';

import { useState } from 'react';

import { getOperatorLauncherConfig } from '../lib/operator-launcher';

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12.612 2.64a.75.75 0 0 1 .707.51l1.339 4.018a1.75 1.75 0 0 0 1.107 1.108l4.017 1.339a.75.75 0 0 1 0 1.423l-4.017 1.339a1.75 1.75 0 0 0-1.107 1.107l-1.339 4.018a.75.75 0 0 1-1.423 0l-1.34-4.018a1.75 1.75 0 0 0-1.106-1.107L5.433 11.04a.75.75 0 0 1 0-1.423L9.45 8.278a1.75 1.75 0 0 0 1.106-1.108l1.34-4.017a.75.75 0 0 1 .716-.512Z"
        fill="currentColor"
      />
      <path
        d="M5.75 16.75a.75.75 0 0 1 .71.508l.398 1.195a1 1 0 0 0 .634.634l1.195.398a.75.75 0 0 1 0 1.423l-1.195.398a1 1 0 0 0-.634.634l-.398 1.195a.75.75 0 0 1-1.423 0l-.398-1.195a1 1 0 0 0-.634-.634l-1.195-.398a.75.75 0 0 1 0-1.423l1.195-.398a1 1 0 0 0 .634-.634l.398-1.195a.75.75 0 0 1 .713-.508Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function OperatorLauncher() {
  const config = getOperatorLauncherConfig();
  const [isOpen, setIsOpen] = useState(false);

  if (!config) {
    return null;
  }

  return (
    <div className="operator-launcher" data-open={isOpen ? 'true' : 'false'}>
      {isOpen ? (
        <div className="operator-launcher__panel" role="dialog" aria-label={config.title}>
          <p className="operator-launcher__eyebrow">Guided support</p>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
          <div className="operator-launcher__actions">
            <a
              className="operator-launcher__cta"
              href={config.chatUrl}
              target="_blank"
              rel="noreferrer"
            >
              {config.primaryActionLabel}
            </a>
            <button type="button" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="operator-launcher__toggle"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close EveryBible AI chat launcher' : 'Open EveryBible AI chat launcher'}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="operator-launcher__icon" aria-hidden="true">
          <SparkIcon />
        </span>
        <span className="operator-launcher__label">AI</span>
      </button>
    </div>
  );
}
