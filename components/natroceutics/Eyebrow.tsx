import React from 'react';

export interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  color?: string;
  as?: keyof JSX.IntrinsicElements;
}

/** Signature uppercase, wide-tracked eyebrow / section label. */
export function Eyebrow({ children, color = 'var(--color-secondary)', as = 'div', style, ...rest }: EyebrowProps) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      style={{
        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', color, ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
