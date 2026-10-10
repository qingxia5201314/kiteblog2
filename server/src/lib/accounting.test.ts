import { describe, expect, it } from 'vitest';
import {
  ACCOUNTING_ENTRY_COLLAPSE_LIMIT,
  getBudgetHealth,
  sortAccountingEntries,
  getVisibleAccountingEntries,
  sanitizeMoneyInput
} from './accounting';

describe('accounting helpers', () => {
  it('keeps money inputs numeric with two decimal places', () => {
    expect(sanitizeMoneyInput('abc12.345元')).toBe('12.34');
    expect(sanitizeMoneyInput('1..2')).toBe('1.2');
    expect(sanitizeMoneyInput('001.20')).toBe('001.20');
    expect(sanitizeMoneyInput('')).toBe('');
  });

  it('shows only the latest collapsed accounting entries by default', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ id: `entry-${index + 1}` }));

    expect(ACCOUNTING_ENTRY_COLLAPSE_LIMIT).toBe(5);
    expect(getVisibleAccountingEntries(entries, false).map((entry) => entry.id)).toEqual([
      'entry-1',
      'entry-2',
      'entry-3',
      'entry-4',
      'entry-5'
    ]);
    expect(getVisibleAccountingEntries(entries, true)).toHaveLength(8);
  });

  it('sorts accounting entries by spent date and creation time newest first', () => {
    const entries = [
      { id: 'older-same-day', spentAt: '2026-06-17', createdAt: '2026-06-17T08:00:00.000Z' },
      { id: 'newer-same-day', spentAt: '2026-06-17', createdAt: '2026-06-17T09:00:00.000Z' },
      { id: 'previous-day', spentAt: '2026-06-16', createdAt: '2026-06-17T10:00:00.000Z' }
    ];

    expect(sortAccountingEntries(entries).map((entry) => entry.id)).toEqual([
      'newer-same-day',
      'older-same-day',
      'previous-day'
    ]);
  });

  it('classifies budget health for dashboard styling', () => {
    expect(getBudgetHealth({ remainingCents: 70000, limitCents: 100000 })).toBe('good');
    expect(getBudgetHealth({ remainingCents: 15000, limitCents: 100000 })).toBe('warn');
    expect(getBudgetHealth({ remainingCents: -1, limitCents: 100000 })).toBe('danger');
    expect(getBudgetHealth({ remainingCents: 0, limitCents: 0 })).toBe('neutral');
  });
});
