'use client';

import { useEffect } from 'react';

// Without this, a failed read of the translator team table (for example a permission change
// or a transient database error) would surface as an unhandled 500.
export default function TranslatorAccessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Translator access page failed to load:', error);
  }, [error]);

  return (
    <div className="page-stack">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Translator access</p>
            <h3>Couldn&rsquo;t load translator access</h3>
          </div>
        </div>
        <p className="page-copy">
          The translator teams, the shared passcode switch or its usage log failed to load. No
          passcode was changed. Retry below. If it keeps failing, check the admin logs and that the
          translator_team_passcodes migration is applied.
        </p>
        <button type="button" className="button button--primary" onClick={() => reset()}>
          Retry
        </button>
      </section>
    </div>
  );
}
