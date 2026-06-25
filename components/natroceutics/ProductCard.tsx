'use client';
import React, { useState } from 'react';
import { Badge } from './Badge';

export interface ProductCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  subheading?: string;
  category?: string;
  price: string;
  image?: string;
  sizeLabel?: string;
  onAdd?: () => void;
}

/** Storefront product card — image, category, name, subheading, price, add action. */
export function ProductCard({
  name, subheading, category, price, image, sizeLabel, onAdd, style, ...rest
}: ProductCardProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        transition: 'box-shadow var(--dur-normal) var(--ease-standard)', ...style,
      }}
      {...rest}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--surface-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {image
          ? <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--forest-500)', opacity: 0.7 }}>PRODUCT IMAGE</span>}
        {category && <div style={{ position: 'absolute', top: 12, left: 12 }}><Badge tone="neutral">{category}</Badge></div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-5)', flex: 1 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{name}</h3>
        {subheading && <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 300, color: 'var(--text-body)', lineHeight: 1.4, flex: 1 }}>{subheading}</p>}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-strong)' }}>{price}</span>
          {sizeLabel && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{sizeLabel}</span>}
        </div>
        <button
          onClick={onAdd}
          style={{
            marginTop: 10, height: 42, border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            background: hover ? 'var(--color-primary-hover)' : 'var(--color-primary)', color: 'var(--white)',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', transition: 'background var(--dur-normal) var(--ease-standard)',
          }}
        >Add to dispensary</button>
      </div>
    </div>
  );
}
