import type { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle ? (
            <p className="muted mt-0" style={{ marginBottom: 0 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
