import type { ReactNode } from 'react';

/**
 * The detail card that floats on the void: bold uppercase title, an optional
 * 16:9 preview, then body copy. Updates as focus moves through a list.
 */
export function Panel({
  title,
  body,
  preview,
  variant = 'default',
  children,
}: {
  title: string;
  body?: string;
  preview?: ReactNode;
  variant?: 'default' | 'alt';
  children?: ReactNode;
}) {
  return (
    <aside className={`fc-panel ${variant === 'alt' ? 'fc-panel--alt' : ''}`}>
      <h2 className="fc-panel__title">{title}</h2>
      {preview !== undefined && <div className="fc-panel__preview">{preview}</div>}
      {body !== undefined && <p className="fc-panel__body">{body}</p>}
      {children}
    </aside>
  );
}
