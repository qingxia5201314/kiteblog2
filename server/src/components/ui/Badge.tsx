import { HTMLAttributes, ReactNode } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function Badge({ className = '', children, ...props }: BadgeProps) {
  return (
    <span className={['ui-badge', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </span>
  );
}
