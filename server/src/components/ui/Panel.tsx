import { ReactNode } from 'react';

interface PanelProps {
  className?: string;
  children: ReactNode;
}

export function Panel({ className = '', children }: PanelProps) {
  return <section className={['ui-panel', className].filter(Boolean).join(' ')}>{children}</section>;
}
