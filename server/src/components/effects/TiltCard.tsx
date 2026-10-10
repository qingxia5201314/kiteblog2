import { HTMLAttributes, ReactNode } from 'react';

interface TiltCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TiltCard({ className = '', children, ...props }: TiltCardProps) {
  return (
    <div className={['tilt-card', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}
