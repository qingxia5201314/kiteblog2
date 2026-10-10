import { randomUUID } from 'node:crypto';

export const ACCOUNTING_CATEGORIES = [
  'food',
  'transport',
  'shopping',
  'study',
  'entertainment',
  'rent',
  'salary',
  'saving',
  'other'
];

export const DEFAULT_ACCOUNTING_CATEGORIES = [
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

export function createAccountingId() {
  return `acc-${randomUUID()}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function monthOf(date) {
  return String(date || today()).slice(0, 7);
}

export function parseMoneyToCents(value, { emptyAsZero = false } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized && emptyAsZero) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Invalid amount');
  }

  const [yuan, cents = ''] = normalized.split('.');
  return Number(yuan) * 100 + Number(cents.padEnd(2, '0'));
}

export function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function assertEntryDraft(draft) {
  if (!['income', 'expense'].includes(draft.type)) throw new Error('Invalid entry type');
  if (!String(draft.category || '').trim()) throw new Error('Invalid category');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.spentAt || ''))) throw new Error('Invalid date');
  if (!String(draft.account || '').trim()) throw new Error('Account is required');
}

function positiveCents(value) {
  return Math.max(Number(value || 0), 0);
}

export function deriveBudgetPlan({ monthlyBudgetCents = 0, savingGoal = null } = {}) {
  const monthlyBudget = positiveCents(monthlyBudgetCents);
  const hasBalanceTarget = savingGoal?.currentBalanceCents !== undefined || savingGoal?.targetBalanceCents !== undefined;
  if (hasBalanceTarget) {
    const balanceAvailableCents = Math.max(
      Number(savingGoal.currentBalanceCents || 0) - Number(savingGoal.targetBalanceCents || 0),
      0
    );

    return {
      monthlyBudgetCents: monthlyBudget,
      targetSavingCents: monthlyBudget > 0 ? Math.max(monthlyBudget - balanceAvailableCents, 0) : 0,
      plannedAvailableCents: balanceAvailableCents,
      budgetLimitCents: balanceAvailableCents
    };
  }

  const hasTargetSaving = savingGoal?.targetSavingCents !== undefined;
  const hasManualAvailable = savingGoal?.availableBudgetCents !== undefined;
  const targetSavingCents = hasTargetSaving
    ? positiveCents(savingGoal.targetSavingCents)
    : hasManualAvailable
      ? Math.max(monthlyBudget - positiveCents(savingGoal.availableBudgetCents), 0)
      : 0;
  const plannedAvailableCents = monthlyBudget > 0 ? Math.max(monthlyBudget - targetSavingCents, 0) : 0;
  const budgetLimitCents = hasManualAvailable ? positiveCents(savingGoal.availableBudgetCents) : plannedAvailableCents || monthlyBudget;

  return {
    monthlyBudgetCents: monthlyBudget,
    targetSavingCents,
    plannedAvailableCents,
    budgetLimitCents
  };
}

export function summarizeEntries(entries, { monthlyBudgetCents = 0, savingGoal = null } = {}) {
  const incomeCents = entries
    .filter((entry) => entry.type === 'income' && entry.includeInSaving === false)
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((total, entry) => total + entry.amountCents, 0);
  const savingIncomeCents = entries
    .filter((entry) => entry.type === 'income' && entry.includeInSaving !== false)
    .reduce((total, entry) => total + entry.amountCents, 0);
  const savingExpenseCents = entries
    .filter((entry) => entry.type === 'expense' && entry.includeInSaving !== false)
    .reduce((total, entry) => total + entry.amountCents, 0);
  const savingNetExpenseCents = Math.max(savingExpenseCents - savingIncomeCents, 0);
  const expenseByCategory = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((groups, entry) => {
      groups[entry.category] = (groups[entry.category] || 0) + entry.amountCents;
      return groups;
    }, {});
  const topExpense = Object.entries(expenseByCategory).sort((left, right) => right[1] - left[1])[0];
  const budgetPlan = deriveBudgetPlan({ monthlyBudgetCents, savingGoal });

  return {
    incomeCents,
    expenseCents,
    savingIncomeCents,
    savingExpenseCents,
    savingNetExpenseCents,
    balanceCents: incomeCents - expenseCents,
    dailyExpenseCents: Math.round(expenseCents / Math.max(new Date().getDate(), 1)),
    budgetLimitCents: budgetPlan.budgetLimitCents,
    plannedAvailableCents: budgetPlan.plannedAvailableCents,
    targetSavingCents: budgetPlan.targetSavingCents,
    budgetUsedPercent:
      budgetPlan.budgetLimitCents > 0 ? Math.min(999, Math.round((savingNetExpenseCents / budgetPlan.budgetLimitCents) * 100)) : 0,
    budgetRemainingCents: budgetPlan.budgetLimitCents > 0 ? budgetPlan.budgetLimitCents - savingNetExpenseCents : 0,
    topExpenseCategory: topExpense ? { category: topExpense[0], amountCents: topExpense[1] } : null
  };
}

function daysBetweenInclusive(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export function calculateSavingGoal(goal, { today: currentDate = today(), monthlyBudgetCents = 0, expenseCents = 0 } = {}) {
  if (!goal) return null;

  if (goal.targetSavingCents !== undefined || goal.availableBudgetCents !== undefined) {
    const budgetPlan = deriveBudgetPlan({ monthlyBudgetCents, savingGoal: goal });
    const spentCents = positiveCents(expenseCents);
    const remainingAvailableCents = budgetPlan.budgetLimitCents - spentCents;
    const overBudgetCents = Math.max(spentCents - budgetPlan.budgetLimitCents, 0);
    const projectedSavingCents =
      budgetPlan.monthlyBudgetCents > 0
        ? Math.max(budgetPlan.monthlyBudgetCents - Math.max(spentCents, budgetPlan.budgetLimitCents), 0)
        : 0;
    const daysLeft = Math.max(daysBetweenInclusive(currentDate, goal.endDate), 0);

    return {
      ...goal,
      targetCents: budgetPlan.targetSavingCents,
      savedCents: projectedSavingCents,
      targetSavingCents: budgetPlan.targetSavingCents,
      plannedAvailableCents: budgetPlan.plannedAvailableCents,
      availableBudgetCents: budgetPlan.budgetLimitCents,
      budgetLimitCents: budgetPlan.budgetLimitCents,
      spentCents,
      remainingAvailableCents,
      overBudgetCents,
      progressPercent:
        budgetPlan.targetSavingCents > 0
          ? Math.min(100, Math.round((projectedSavingCents / budgetPlan.targetSavingCents) * 100))
          : 0,
      remainingCents: Math.max(budgetPlan.targetSavingCents - projectedSavingCents, 0),
      daysLeft,
      dailyAvailableCents: daysLeft > 0 ? Math.floor(Math.max(remainingAvailableCents, 0) / daysLeft) : Math.max(remainingAvailableCents, 0),
      dailyRequiredCents: daysLeft > 0 ? Math.ceil(Math.max(budgetPlan.targetSavingCents - projectedSavingCents, 0) / daysLeft) : 0,
      projectedSavingCents,
      savingGapCents: Math.max(budgetPlan.targetSavingCents - projectedSavingCents, 0),
      savingSurplusCents: Math.max(projectedSavingCents - budgetPlan.targetSavingCents, 0)
    };
  }

  if (goal.currentBalanceCents !== undefined || goal.targetBalanceCents !== undefined) {
    const currentBalanceCents = Number(goal.currentBalanceCents || 0);
    const targetBalanceCents = Number(goal.targetBalanceCents || 0);
    const balanceDeltaCents = currentBalanceCents - targetBalanceCents;
    const remainingCents = Math.max(targetBalanceCents - currentBalanceCents, 0);
    const safeToSpendCents = Math.max(balanceDeltaCents, 0);
    const daysLeft = Math.max(daysBetweenInclusive(currentDate, goal.endDate), 0);
    const budgetPlan = deriveBudgetPlan({ monthlyBudgetCents, savingGoal: goal });
    const spentCents = positiveCents(expenseCents);
    const remainingAvailableCents = budgetPlan.budgetLimitCents - spentCents;
    const projectedSavingCents =
      budgetPlan.monthlyBudgetCents > 0
        ? Math.max(budgetPlan.monthlyBudgetCents - Math.max(spentCents, budgetPlan.budgetLimitCents), 0)
        : 0;

    return {
      ...goal,
      targetCents: targetBalanceCents,
      savedCents: currentBalanceCents,
      targetSavingCents: budgetPlan.targetSavingCents,
      plannedAvailableCents: budgetPlan.plannedAvailableCents,
      availableBudgetCents: budgetPlan.budgetLimitCents,
      budgetLimitCents: budgetPlan.budgetLimitCents,
      spentCents,
      progressPercent:
        targetBalanceCents > 0 ? Math.min(100, Math.round((currentBalanceCents / targetBalanceCents) * 100)) : 0,
      remainingCents,
      balanceDeltaCents,
      safeToSpendCents,
      remainingAvailableCents,
      overBudgetCents: Math.max(spentCents - budgetPlan.budgetLimitCents, 0),
      daysLeft,
      dailyAvailableCents: daysLeft > 0 ? Math.floor(Math.max(remainingAvailableCents, 0) / daysLeft) : Math.max(remainingAvailableCents, 0),
      dailyRequiredCents: daysLeft > 0 ? Math.ceil(remainingCents / daysLeft) : remainingCents,
      projectedSavingCents,
      savingGapCents: Math.max(budgetPlan.targetSavingCents - projectedSavingCents, 0),
      savingSurplusCents: Math.max(projectedSavingCents - budgetPlan.targetSavingCents, 0)
    };
  }

  const remainingCents = Math.max(goal.targetCents - goal.savedCents, 0);
  const daysLeft = Math.max(daysBetweenInclusive(currentDate, goal.endDate), 0);

  return {
    ...goal,
    progressPercent: goal.targetCents > 0 ? Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100)) : 0,
    remainingCents,
    daysLeft,
    dailyRequiredCents: daysLeft > 0 ? Math.ceil(remainingCents / daysLeft) : remainingCents
  };
}
