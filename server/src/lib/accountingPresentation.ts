import { AccountingCategory, AccountingEntry, getAccountingCategory } from './accounting';

export function getAccountingEntryTitle(
  entry: AccountingEntry,
  categories?: AccountingCategory[]
): string {
  const category = getAccountingCategory(entry.category, categories);
  const note = entry.note.trim();
  const subject = entry.category === 'other' && note ? note : category.name;
  return `${subject} · ${entry.account}`;
}

export function formatAccountingCreatedAt(entry: AccountingEntry): string {
  return new Date(entry.createdAt).toLocaleString('zh-CN');
}
