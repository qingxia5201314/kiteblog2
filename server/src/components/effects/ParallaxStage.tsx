import { HTMLAttributes, ReactNode } from 'react';

interface ParallaxStageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ParallaxStage({ className = '', children, ...props }: ParallaxStageProps) {
  return (
    <div className={['parallax-stage', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}
