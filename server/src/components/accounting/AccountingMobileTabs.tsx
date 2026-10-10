import type { KeyboardEvent } from 'react';

export type AccountingPanel = 'overview' | 'entry' | 'ledger' | 'plan';

type AccountingMobileTabsProps = {
  active: AccountingPanel;
  onChange: (panel: AccountingPanel) => void;
};

const ACCOUNTING_TABS: Array<{ panel: AccountingPanel; label: string }> = [
  { panel: 'overview', label: '概览' },
  { panel: 'entry', label: '记一笔' },
  { panel: 'ledger', label: '流水' },
  { panel: 'plan', label: '计划' }
];

export function AccountingMobileTabs({ active, onChange }: AccountingMobileTabsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % ACCOUNTING_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + ACCOUNTING_TABS.length) % ACCOUNTING_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ACCOUNTING_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextPanel = ACCOUNTING_TABS[nextIndex].panel;
    onChange(nextPanel);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-accounting-tab="${nextPanel}"]`)
      ?.focus();
  };

  return (
    <div aria-label="记账工作区" className="accounting-mobile-tabs" role="group">
      {ACCOUNTING_TABS.map(({ panel, label }, index) => {
        const selected = panel === active;

        return (
          <button
            aria-controls={`accounting-panel-${panel}`}
            aria-pressed={selected}
            data-accounting-tab={panel}
            id={`accounting-tab-${panel}`}
            key={panel}
            onClick={() => onChange(panel)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
