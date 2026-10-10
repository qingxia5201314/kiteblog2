import { AccountingCategory, AccountingEntry, AccountingEntryDraft, AccountingMonthData, AccountingSettingsDraft } from './accounting';
import { apiFetch } from './apiClient';

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function getAccountingMonth({
  month,
  type,
  category
}: {
  month: string;
  type?: string;
  category?: string;
}): Promise<AccountingMonthData> {
  const params = new URLSearchParams({ month });
  if (type && type !== 'all') params.set('type', type);
  if (category && category !== 'all') params.set('category', category);
  return parseResponse<AccountingMonthData>(
    await apiFetch(`/api/accounting/month?${params.toString()}`)
  );
}

export async function createAccountingEntry(draft: AccountingEntryDraft): Promise<AccountingEntry> {
  const payload = await parseResponse<{ entry: AccountingEntry }>(
    await apiFetch('/api/accounting/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );
  return payload.entry;
}

export async function createAccountingCategory(
  draft: { name: string; type: AccountingCategory['type'] }
): Promise<AccountingCategory> {
  const payload = await parseResponse<{ category: AccountingCategory }>(
    await apiFetch('/api/accounting/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );
  return payload.category;
}

export async function updateAccountingCategory(
  id: string,
  patch: { name?: string; type?: AccountingCategory['type'] }
): Promise<AccountingCategory> {
  const payload = await parseResponse<{ category: AccountingCategory }>(
    await apiFetch(`/api/accounting/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  );
  return payload.category;
}

export async function deleteAccountingCategory(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/accounting/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}

export async function updateAccountingEntry(
  id: string,
  patch: Partial<AccountingEntryDraft>
): Promise<AccountingEntry> {
  const payload = await parseResponse<{ entry: AccountingEntry }>(
    await apiFetch(`/api/accounting/entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  );
  return payload.entry;
}

export async function deleteAccountingEntry(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/accounting/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}

export async function updateAccountingSettings(settings: AccountingSettingsDraft): Promise<AccountingMonthData> {
  return parseResponse<AccountingMonthData>(
    await apiFetch('/api/accounting/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings)
    })
  );
}
