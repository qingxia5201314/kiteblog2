export type AccountingEntryType = 'income' | 'expense';

export type AccountingCategoryId = string;

export interface AccountingCategory {
  id: AccountingCategoryId;
  name: string;
  type: AccountingEntryType | 'both';
  accent: string;
  custom?: boolean;
}

export const ACCOUNTING_PAYMENT_METHODS = ['微信', '支付宝', '银行卡', '现金', '花呗', '其他'] as const;
export const ACCOUNTING_ENTRY_COLLAPSE_LIMIT = 5;
export type BudgetHealth = 'good' | 'warn' | 'danger' | 'neutral';

export interface AccountingEntry {
  id: string;
  type: AccountingEntryType;
  amountCents: number;
  category: AccountingCategoryId;
  account: string;
  spentAt: string;
  note: string;
  includeInSaving: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingEntryDraft {
  type: AccountingEntryType;
  amountYuan: string;
  category: AccountingCategoryId;
  account: string;
  spentAt: string;
  note: string;
  includeInSaving: boolean;
}

export interface SavingGoalDraft {
  name: string;
  targetYuan?: string;
  savedYuan?: string;
  currentBalanceYuan?: string;
  targetBalanceYuan?: string;
  targetSavingYuan?: string;
  availableBudgetYuan?: string;
  startDate: string;
  endDate: string;
}

export interface SavingGoal {
  name: string;
  targetCents: number;
  savedCents: number;
  currentBalanceCents?: number;
  targetBalanceCents?: number;
  targetSavingCents?: number;
  plannedAvailableCents?: number;
  availableBudgetCents?: number;
  budgetLimitCents?: number;
  spentCents?: number;
  remainingAvailableCents?: number;
  overBudgetCents?: number;
  savingGapCents?: number;
  savingSurplusCents?: number;
  startDate: string;
  endDate: string;
  progressPercent: number;
  remainingCents: number;
  balanceDeltaCents?: number;
  safeToSpendCents?: number;
  daysLeft: number;
  dailyAvailableCents?: number;
  dailyRequiredCents: number;
  projectedSavingCents?: number;
}

export interface AccountingSettings {
  monthlyBudgetCents: number;
  savingGoal: SavingGoal | null;
}

export interface AccountingSettingsDraft {
  monthlyBudgetYuan: string;
  savingGoal: SavingGoalDraft | null;
}

export interface AccountingSummary {
  incomeCents: number;
  expenseCents: number;
  savingIncomeCents: number;
  savingExpenseCents: number;
  savingNetExpenseCents: number;
  balanceCents: number;
  dailyExpenseCents: number;
  budgetLimitCents: number;
  plannedAvailableCents: number;
  targetSavingCents: number;
  budgetUsedPercent: number;
  budgetRemainingCents: number;
  topExpenseCategory: { category: AccountingCategoryId; amountCents: number } | null;
}

export interface AccountingMonthData {
  entries: AccountingEntry[];
  categories?: AccountingCategory[];
  settings: AccountingSettings;
  summary: AccountingSummary;
  savingGoal: SavingGoal | null;
}

export const ACCOUNTING_CATEGORIES: AccountingCategory[] = [
  { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
  { id: 'transport', name: '交通', type: 'expense', accent: '#4266b2' },
  { id: 'shopping', name: '购物', type: 'expense', accent: '#8a5a19' },
  { id: 'study', name: '学习', type: 'expense', accent: '#2f7d67' },
  { id: 'entertainment', name: '娱乐', type: 'expense', accent: '#7b5aa6' },
  { id: 'rent', name: '房租', type: 'expense', accent: '#5e625f' },
  { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' },
  { id: 'saving', name: '存钱', type: 'both', accent: '#c08a2c' },
  { id: 'other', name: '其他', type: 'both', accent: '#68706a' }
];

export function getAccountingCategory(id: AccountingCategoryId, categories = ACCOUNTING_CATEGORIES): AccountingCategory {
  return categories.find((category) => category.id === id) ?? ACCOUNTING_CATEGORIES[8];
}

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthInput(): string {
  return todayDateInput().slice(0, 7);
}

export function formatMoney(cents = 0): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}¥${(absolute / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function sanitizeMoneyInput(value: string): string {
  let next = value.replace(/[^\d.]/g, '');
  const firstDot = next.indexOf('.');
  if (firstDot !== -1) {
    next = `${next.slice(0, firstDot + 1)}${next.slice(firstDot + 1).replace(/\./g, '')}`;
  }

  const [yuan, cents] = next.split('.');
  if (cents !== undefined) return `${yuan}.${cents.slice(0, 2)}`;
  return yuan;
}

export function getVisibleAccountingEntries<T>(entries: T[], expanded: boolean): T[] {
  return expanded ? entries : entries.slice(0, ACCOUNTING_ENTRY_COLLAPSE_LIMIT);
}

export function sortAccountingEntries<T extends { spentAt: string; createdAt?: string; updatedAt?: string; id?: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const spentDiff = Date.parse(`${right.spentAt}T00:00:00`) - Date.parse(`${left.spentAt}T00:00:00`);
    if (spentDiff !== 0) return spentDiff;

    const rightCreated = Date.parse(right.createdAt || right.updatedAt || '');
    const leftCreated = Date.parse(left.createdAt || left.updatedAt || '');
    if (Number.isFinite(rightCreated) && Number.isFinite(leftCreated) && rightCreated !== leftCreated) {
      return rightCreated - leftCreated;
    }

    return String(right.id || '').localeCompare(String(left.id || ''));
  });
}

export function getBudgetHealth({
  remainingCents,
  limitCents
}: {
  remainingCents: number;
  limitCents: number;
}): BudgetHealth {
  if (limitCents <= 0) return 'neutral';
  if (remainingCents < 0) return 'danger';
  if (remainingCents / limitCents <= 0.2) return 'warn';
  return 'good';
}
