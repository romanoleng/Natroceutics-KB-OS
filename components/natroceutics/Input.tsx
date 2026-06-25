'use client';
import React, { useId, useState } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}

/** Labelled text input, styled for cream surfaces. */
export function Input({ label, helper, error, id, type = 'text', style, ...rest }: InputProps) {
  const [focus, setFocus] = useState(false);
  const auto = useId();
  const inputId = id || auto;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <label htmlFor={inputId} style={{
          fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>{label}</label>
      )}
      <input
        id={inputId} type={type}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--text-strong)',
          height: 46, padding: '0 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--white)', boxSizing: 'border-box',
          border: `1.5px solid ${error ? 'var(--red)' : focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
          boxShadow: focus ? 'var(--shadow-focus)' : 'none', outline: 'none',
          transition: 'border-color var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)',
          ...style,
        }}
        {...rest}
      />
      {(error || helper) && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: error ? 'var(--red-fg)' : 'var(--text-muted)' }}>
          {error || helper}
        </span>
      )}
    </div>
  );
}
