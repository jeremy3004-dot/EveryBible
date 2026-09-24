interface ErrorPageScreenProps {
  statusCode: number;
}

const errorCopy: Record<number, { title: string; intro: string }> = {
  404: {
    title: 'Page not found',
    intro: 'Check the address or return to the homepage.',
  },
  500: {
    title: 'Something went wrong',
    intro: 'Please try loading this page again.',
  },
};

export function ErrorPageScreen({ statusCode }: ErrorPageScreenProps) {
  const copy = errorCopy[statusCode] ?? errorCopy[500];

  return (
    <main className="static-page" id="main">
      <div className="container static-page__container">
        <section className="static-page__hero">
          <p className="eyebrow">Error</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        <article className="static-page__content">
          <section>
            <p>
              <a href="/">Go home</a>
              {' · '}
              <a href="/languages">Browse languages</a>
              {' · '}
              <a href="/support">Get support</a>
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
