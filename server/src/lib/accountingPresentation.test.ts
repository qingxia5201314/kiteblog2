import { describe, expect, it } from 'vitest';
import { AccountingCategory, AccountingEntry } from './accounting';
import { formatAccountingCreatedAt, getAccountingEntryTitle } from './accountingPresentation';

function createEntry(overrides: Partial<AccountingEntry> = {}): AccountingEntry {
  return {
    id: 'entry-1',
    type: 'expense',
    amountCents: 1000,
    category: 'food',
    account: '微信',
    spentAt: '2026-07-12',
    note: '',
    includeInSaving: false,
    createdAt: '2026-07-13T08:09:10.000Z',
    updatedAt: '2026-07-13T08:09:10.000Z',
    ...overrides
  };
}

describe('accounting presentation helpers', () => {
  it('uses a trimmed note as the subject for the built-in other category', () => {
    const entry = createEntry({ category: 'other', note: '  住房  ' });

    expect(getAccountingEntryTitle(entry)).toBe('住房 · 微信');
  });

  it('falls back to the other category name when its note is blank', () => {
    const entry = createEntry({ category: 'other', note: '   ' });

    expect(getAccountingEntryTitle(entry)).toBe('其他 · 微信');
  });

  it('ignores notes for normal categories', () => {
    const entry = createEntry({ category: 'food', note: '工作午餐' });

    expect(getAccountingEntryTitle(entry)).toBe('餐饮 · 微信');
  });

  it('uses the supplied custom category list', () => {
    const categories: AccountingCategory[] = [
      { id: 'housing', name: '住房', type: 'expense', accent: '#123456', custom: true }
    ];
    const entry = createEntry({ category: 'housing', account: '银行卡', note: '房租' });

    expect(getAccountingEntryTitle(entry, categories)).toBe('住房 · 银行卡');
  });

  it('keeps the displayed creation time unchanged when updatedAt changes', () => {
    const entry = createEntry();
    const editedEntry = createEntry({ updatedAt: '2026-07-13T12:34:56.000Z' });

    expect(formatAccountingCreatedAt(editedEntry)).toBe(formatAccountingCreatedAt(entry));
  });

  it('does not include the occurrence label or spentAt in ledger text', () => {
    const entry = createEntry({ spentAt: '1999-12-31' });
    const ledgerText = `${getAccountingEntryTitle(entry)} ${formatAccountingCreatedAt(entry)}`;

    expect(ledgerText).not.toContain('发生');
    expect(ledgerText).not.toContain(entry.spentAt);
  });
});
