import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';

export type ToolMenuItem = {
  active: boolean;
  label: string;
  to: string;
};

type ToolMenuProps = {
  items: ToolMenuItem[];
  routeKey: string;
};

export function ToolMenu({ items, routeKey }: ToolMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [routeKey]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      summaryRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSummaryClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setIsOpen((current) => !current);
  };

  return (
    <details className="tool-menu" open={isOpen} ref={menuRef}>
      <summary
        aria-controls={menuId}
        aria-expanded={isOpen}
        onClick={handleSummaryClick}
        ref={summaryRef}
      >
        工具
      </summary>
      <div id={menuId}>
        {items.map((item) => (
          <Link
            aria-current={item.active ? 'page' : undefined}
            className={item.active ? 'active' : ''}
            key={item.to}
            onClick={() => setIsOpen(false)}
            to={item.to}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
