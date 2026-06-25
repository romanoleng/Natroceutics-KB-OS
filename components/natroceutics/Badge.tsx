'use client';
import React from 'react';

export type BadgeTone = 'neutral' | 'forest' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

/** Small pill badge for product categories and status. */
export function Badge({ children, tone = 'neutral', dot = false, style, ...rest }: BadgeProps) {
  const tones: Record<BadgeTone, { background: string; color: string; dotColor: string }> = {
    neutral: { background: 'var(--forest-100)', color: 'var(--forest-800)', dotColor: 'var(--forest-600)' },
    forest:  { background: 'var(--forest-800)', color: 'var(--white)', dotColor: 'var(--forest-100)' },
    success: { background: 'var(--green-ok-bg)', color: 'var(--green-ok-fg)', dotColor: 'var(--green-ok)' },
    warning: { background: 'var(--amber-bg)', color: 'var(--amber-fg)', dotColor: 'var(--amber)' },
    danger:  { background: 'var(--red-bg)', color: 'var(--red-fg)', dotColor: 'var(--red)' },
    info:    { background: 'var(--blue-bg)', color: 'var(--blue-fg)', dotColor: 'var(--blue)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '4px 10px', borderRadius: 'var(--radius-pill)',
        background: t.background, color: t.color, ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dotColor }} />}
      {children}
    </span>
  );
}
