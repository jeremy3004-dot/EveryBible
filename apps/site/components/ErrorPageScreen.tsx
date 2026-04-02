interface ErrorPageScreenProps {
  statusCode: number;
}

const errorCopy: Record<number, { title: string; intro: string }> = {
  404: {
    title: 'Page not found',
    intro: 'The page you were looking for could not be found.',
  },
  500: {
    title: 'Something went wrong',
    intro: 'We hit an unexpected problem while loading this page.',
  },
};

export function ErrorPageScreen({ statusCode }: ErrorPageScreenProps) {
  const copy = errorCopy[statusCode] ?? errorCopy[500];

  return (
    <main className="static-page">
      <div className="container static-page__container">
        <section className="static-page__hero">
          <p className="eyebrow">Error</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        <article className="static-page__content">
          <section>
            <p>You can return to the homepage, or visit the support page if you need help getting back on track.</p>
            <p>
              <a href="/">Go home</a>
              {' · '}
              <a href="/support">Get support</a>
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
