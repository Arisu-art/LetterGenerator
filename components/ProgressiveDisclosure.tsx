'use client';

import { useId, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  summary?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

/** Accessible disclosure primitive with a CSS-grid reveal that preserves context without abrupt reflow. */
export default function ProgressiveDisclosure({ open, onToggle, title, summary, badge, children, className = '', disabled = false }: Props) {
  const contentId = useId();
  return (
    <section className={`progressive-disclosure ${open ? 'is-open' : ''} ${className}`.trim()}>
      <button
        className="progressive-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="progressive-copy">
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        {badge && <span className="progressive-badge-slot">{badge}</span>}
        <span className="progressive-chevron" aria-hidden="true" />
      </button>
      <div id={contentId} className="progressive-region" aria-hidden={!open}>
        <div className="progressive-region-inner">{children}</div>
      </div>
    </section>
  );
}
