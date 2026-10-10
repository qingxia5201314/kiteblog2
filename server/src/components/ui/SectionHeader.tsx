interface SectionHeaderProps {
  className?: string;
  eyebrow?: string;
  title: string;
  description?: string;
}

export function SectionHeader({ className = '', eyebrow, title, description }: SectionHeaderProps) {
  return (
    <header className={['ui-section-header', className].filter(Boolean).join(' ')}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}
