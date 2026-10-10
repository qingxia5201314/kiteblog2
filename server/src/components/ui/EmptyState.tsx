interface EmptyStateProps {
  className?: string;
  title: string;
  description?: string;
}

export function EmptyState({ className = '', title, description }: EmptyStateProps) {
  return (
    <div className={['ui-empty-state', className].filter(Boolean).join(' ')}>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
