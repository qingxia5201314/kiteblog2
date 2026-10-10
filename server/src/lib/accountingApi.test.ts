import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAccountingCategory,
  createAccountingEntry,
  deleteAccountingCategory,
  deleteAccountingEntry,
  getAccountingMonth,
  updateAccountingCategory,
  updateAccountingEntry,
  updateAccountingSettings
} from './accountingApi';

describe('accounting api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses same-origin cookies for private accounting reads and writes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      entries: [],
      summary: {},
      settings: {},
      savingGoal: null,
      entry: { id: 'entry-1' },
      category: { id: 'custom-1' },
      ok: true
    })));
    vi.stubGlobal('fetch', fetchMock);
    const entry = {
      type: 'expense' as const,
      amountYuan: '25',
      category: 'food',
      account: '支付宝',
      spentAt: '2026-06-13',
      note: '午饭',
      includeInSaving: true
    };
    const settings = {
      monthlyBudgetYuan: '3000',
      savingGoal: {
        name: '六月存钱',
        targetYuan: '5000',
        savedYuan: '1200',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    };

    await getAccountingMonth({ month: '2026-06', type: 'expense', category: 'food' });
    await createAccountingEntry(entry);
    await updateAccountingEntry('entry-1', { note: '晚饭' });
    await deleteAccountingEntry('entry-1');
    await createAccountingCategory({ name: '咖啡', type: 'expense' });
    await updateAccountingCategory('custom-1', { name: '咖啡馆', type: 'both' });
    await deleteAccountingCategory('custom-1');
    await updateAccountingSettings(settings);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/accounting/month?month=2026-06&type=expense&category=food', {
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/accounting/entries', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/accounting/entries/entry-1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: '晚饭' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/accounting/entries/entry-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/accounting/categories', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '咖啡', type: 'expense' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/accounting/categories/custom-1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '咖啡馆', type: 'both' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/accounting/categories/custom-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/accounting/settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings)
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });
});
