interface AdminSetupCardProps {
  missingKeys: string[];
}

export function AdminSetupCard({ missingKeys }: AdminSetupCardProps) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">EveryBible Admin</p>
        <h1>Admin setup is not finished yet.</h1>
        <p className="lede">
          The admin interface is built, but this environment still needs the credentials and
          endpoints that power sign-in and live operations data.
        </p>

        <div className="notice notice--warning">
          <strong>Missing environment variables</strong>
          <ul className="setup-list">
            {missingKeys.map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="notice">
          <p className="setup-copy">
            Copy the admin values from <code>.env.example</code> into the deployment or local env,
            then reload this page. Once those keys are present, the normal login and dashboard flows
            will come online automatically.
          </p>
        </div>
      </section>
    </main>
  );
}
