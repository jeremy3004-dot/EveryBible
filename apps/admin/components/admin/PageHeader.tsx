import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  inline?: boolean;
}

export function PageHeader({ eyebrow, title, children, actions, inline = false }: PageHeaderProps) {
  const className = inline ? 'page-header page-header--inline' : 'page-header';

  return (
    <section className={className}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children ? <p className="page-copy">{children}</p> : null}
      </div>
      {actions}
    </section>
  );
}
