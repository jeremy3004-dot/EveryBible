import type { ReactNode } from 'react';

type AdminCardElement = 'article' | 'section';

interface AdminCardProps {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  as?: AdminCardElement;
}

export function AdminCard({
  children,
  eyebrow,
  title,
  as: Component = 'section',
}: AdminCardProps) {
  const hasHeader = eyebrow || title;

  return (
    <Component className="card">
      {hasHeader ? (
        <div className="card__header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h3>{title}</h3> : null}
          </div>
        </div>
      ) : null}
      {children}
    </Component>
  );
}
