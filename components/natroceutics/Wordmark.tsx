import React from 'react';

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Render mode: solid green on light, or reversed white (for dark/green fields). */
  variant?: 'primary' | 'reversed';
  /** Font size of the wordmark in px. Default 24. */
  size?: number;
}

/**
 * Natroceutics® wordmark — the ONLY logo. Typographic, Helvetica Neue Bold,
 * superscript ®. Per the Brand Standards Manual there is no graphic symbol.
 * Only ever primary green (solid) or reversed white on green. Do not recolour,
 * outline, skew, or add effects.
 *
 *   <Wordmark />                          // green on light
 *   <Wordmark variant="reversed" />       // white, on a green field
 */
export function Wordmark({ variant = 'primary', size = 24, style, ...rest }: WordmarkProps) {
  const color = variant === 'reversed' ? 'var(--white)' : 'var(--color-primary)';
  return (
    <span
      aria-label="Natroceutics"
      style={{
        fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: size,
        letterSpacing: '-0.01em', color, whiteSpace: 'nowrap', lineHeight: 1,
        display: 'inline-block', ...style,
      }}
      {...rest}
    >
      Natroceutics
      <sup style={{ fontSize: '0.42em', fontWeight: 500, top: '-0.9em', position: 'relative' }}>®</sup>
    </span>
  );
}
