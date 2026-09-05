'use client';
export default function LanguagesError({ reset }: { reset: () => void }) {
  return (
    <div className="language-atlas la-loading">
      <p className="eyebrow">Language atlas</p>
      <h1>The atlas could not open.</h1>
      <p>Please try loading the collection again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
