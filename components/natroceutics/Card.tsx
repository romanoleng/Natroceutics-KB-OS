'use client';
import React, { useState } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: string;
  interactive?: boolean;
}

/** White elevated surface on cream — hairline border, soft warm shadow. */
export function Card({ children, padding = 'var(--space-5)', interactive = false, style, ...rest }: CardProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding, transition: 'box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)',
        transform: hover ? 'translateY(-2px)' : 'none', cursor: interactive ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
