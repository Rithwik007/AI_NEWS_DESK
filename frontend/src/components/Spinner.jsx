import React from 'react';

/**
 * Reusable animated spinner matching the editorial ink aesthetic.
 * Sizes: 'sm' (16px), 'md' (24px), 'lg' (36px).
 */
export default function Spinner({ size = 'md', className = '', style = {} }) {
  const sizeClass = `spinner-${size}`;
  return (
    <span
      className={`spinner ${sizeClass} ${className}`.trim()}
      style={style}
      role="status"
      aria-label="Loading"
    />
  );
}
