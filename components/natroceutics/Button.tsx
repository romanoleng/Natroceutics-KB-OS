'use client';
import React, { useState } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

/** Primary action button — uppercase, wide-tracked label per brand house style. */
export function Button({
  children, variant = 'primary', size = 'md', fullWidth = false,
  disabled = false, type = 'button', iconLeft = null, iconRight = null, style, ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  const sizes: Record<ButtonSize, React.CSSProperties> = {
    sm: { padding: '0 14px', height: 36, fontSize: 13 },
    md: { padding: '0 22px', height: 44, fontSize: 14 },
    lg: { padding: '0 30px', height: 52, fontSize: 15 },
  };
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.04em',
    textTransform: 'uppercase', borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer', border: '1.5px solid transparent',
    transition: 'background var(--dur-normal) var(--ease-standard), color var(--dur-normal) var(--ease-standard), border-color var(--dur-normal) var(--ease-standard)',
    width: fullWidth ? '100%' : 'auto', whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1,
    ...sizes[size],
  };
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: active ? 'var(--color-primary-active)' : hover ? 'var(--color-primary-hover)' : 'var(--color-primary)', color: 'var(--text-on-primary)' },
    secondary: { background: hover ? 'var(--forest-050)' : 'transparent', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
    ghost: { background: hover ? 'var(--forest-050)' : 'transparent', color: 'var(--color-secondary)' },
    inverse: { background: hover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)', color: 'var(--text-on-dark)', borderColor: 'rgba(255,255,255,0.28)' },
  };
  return (
    <button
      type={type} disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      {...rest}
    >
      {iconLeft}{children}{iconRight}
    </button>
  );
}
