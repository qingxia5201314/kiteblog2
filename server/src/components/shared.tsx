import React, { ReactNode, useEffect, useState } from 'react';
import { normalizeImageUrl } from '../lib/imageUrl';

export type UiIcon = 'calendar' | 'clock' | 'tag' | 'spark' | 'grid' | 'draft' | 'edit' | 'sun' | 'shield' | 'book' | 'hash';

export const safeImageAttributes = {
  decoding: 'async',
  loading: 'lazy',
  referrerPolicy: 'no-referrer'
} as const;

export function ImageWithFallback({
  alt,
  className,
  fallback,
  src,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className' | 'onError' | 'src'> & {
  alt: string;
  className?: string;
  fallback: ReactNode;
  src?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      alt={alt}
      className={className}
      src={src}
      {...safeImageAttributes}
      {...props}
      onError={() => setFailed(true)}
    />
  );
}

export function Icon({ className = '', name }: { className?: string; name: UiIcon }) {
  const paths: Record<UiIcon, ReactNode> = {
    calendar: (
      <>
        <rect height="15" rx="3" width="16" x="4" y="5" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    tag: (
      <>
        <path d="M4 5v6.4a3 3 0 0 0 .88 2.12l5.6 5.6a3 3 0 0 0 4.24 0l4.4-4.4a3 3 0 0 0 0-4.24l-5.6-5.6A3 3 0 0 0 11.4 4H5a1 1 0 0 0-1 1Z" />
        <circle cx="8.5" cy="8.5" r="1.2" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3l1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" />
        <path d="M18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16Z" />
      </>
    ),
    grid: (
      <>
        <rect height="5" rx="1.2" width="5" x="4" y="4" />
        <rect height="5" rx="1.2" width="5" x="15" y="4" />
        <rect height="5" rx="1.2" width="5" x="4" y="15" />
        <rect height="5" rx="1.2" width="5" x="15" y="15" />
      </>
    ),
    draft: (
      <>
        <path d="M5 19h14" />
        <path d="M7 15.5l8.8-8.8a2.1 2.1 0 0 1 3 3L10 18l-4 1 1-3.5Z" />
      </>
    ),
    edit: (
      <>
        <path d="M5 19h14" />
        <path d="M7 15.5l8.8-8.8a2.1 2.1 0 0 1 3 3L10 18l-4 1 1-3.5Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </>
    ),
    shield: <path d="M12 3l7 3v5.2c0 4.2-2.8 7.9-7 9.8-4.2-1.9-7-5.6-7-9.8V6l7-3Z" />,
    book: (
      <>
        <path d="M5 4h7a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3 3V4Z" />
        <path d="M19 4h-3a4 4 0 0 0-4 4v12h7V4Z" />
      </>
    ),
    hash: (
      <>
        <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
      </>
    )
  };

  return (
    <span aria-hidden="true" className={`ui-icon icon-${name} ${className}`}>
      <svg focusable="false" viewBox="0 0 24 24">
        {paths[name]}
      </svg>
    </span>
  );
}

export function FilterMenu({
  label,
  onSelect,
  options
}: {
  label: string;
  onSelect: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <details className="filter-menu">
      <summary>{label}</summary>
      <div>
        {options.map(([value, text]) => (
          <button
            key={value}
            onClick={(event) => {
              onSelect(value);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
    </details>
  );
}

export function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDateTime(value?: string): string {
  if (!value) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getSafeImageUrl(value?: string): string | undefined {
  return value ? normalizeImageUrl(value) : undefined;
}

export function permissionLabel(permission?: string): string {
  return permission === 'admin' ? '管理员' : '读者用户';
}
