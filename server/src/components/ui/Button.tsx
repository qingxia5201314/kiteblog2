import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function Button({ className = '', children, type = 'button', ...props }: ButtonProps) {
  return (
    <button className={['ui-button', className].filter(Boolean).join(' ')} type={type} {...props}>
      {children}
    </button>
  );
}
