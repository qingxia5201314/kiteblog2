import { describe, expect, it } from 'vitest';
import { calculateSavingGoal, summarizeEntries } from './accountingModel.mjs';

describe('accounting saving goal model', () => {
  it('uses the planned saving target to derive the usable monthly budget', () => {
    const entries = [{ type: 'expense', amountCents: 30000, category: 'food' }];
    const goal = { targetSavingCents: 100000, endDate: '2026-06-30' };
    const summary = summarizeEntries(entries, { monthlyBudgetCents: 200000, savingGoal: goal });
    const status = calculateSavingGoal(goal, {
      today: '2026-06-13',
      monthlyBudgetCents: 200000,
      expenseCents: summary.expenseCents
    });

    expect(summary.budgetLimitCents).toBe(100000);
    expect(summary.budgetRemainingCents).toBe(70000);
    expect(summary.budgetUsedPercent).toBe(30);
    expect(status.remainingAvailableCents).toBe(70000);
    expect(status.projectedSavingCents).toBe(100000);
    expect(status.savingGapCents).toBe(0);
  });

  it('separates saving-project bills from public income and usable budget math', () => {
    const entries = [
      { type: 'expense', amountCents: 30000, category: 'food', includeInSaving: true },
      { type: 'income', amountCents: 10000, category: 'salary', includeInSaving: true },
      { type: 'income', amountCents: 500000, category: 'salary', includeInSaving: false },
      { type: 'expense', amountCents: 20000, category: 'shopping', includeInSaving: false }
    ];
    const goal = { targetSavingCents: 100000, availableBudgetCents: 100000, endDate: '2026-06-30' };
    const summary = summarizeEntries(entries, { monthlyBudgetCents: 200000, savingGoal: goal });

    expect(summary.incomeCents).toBe(500000);
    expect(summary.expenseCents).toBe(50000);
    expect(summary.savingIncomeCents).toBe(10000);
    expect(summary.savingExpenseCents).toBe(30000);
    expect(summary.savingNetExpenseCents).toBe(20000);
    expect(summary.budgetRemainingCents).toBe(80000);
    expect(summary.budgetUsedPercent).toBe(20);
  });

  it('lets a mid-month manual usable budget drive the budget percentage', () => {
    const entries = [{ type: 'expense', amountCents: 30000, category: 'food' }];
    const goal = { targetSavingCents: 100000, availableBudgetCents: 60000, endDate: '2026-06-30' };
    const summary = summarizeEntries(entries, { monthlyBudgetCents: 200000, savingGoal: goal });
    const status = calculateSavingGoal(goal, {
      today: '2026-06-13',
      monthlyBudgetCents: 200000,
      expenseCents: summary.expenseCents
    });

    expect(summary.budgetLimitCents).toBe(60000);
    expect(summary.budgetRemainingCents).toBe(30000);
    expect(summary.budgetUsedPercent).toBe(50);
    expect(status.remainingAvailableCents).toBe(30000);
    expect(status.dailyAvailableCents).toBe(1666);
    expect(status.projectedSavingCents).toBe(140000);
    expect(status.savingSurplusCents).toBe(40000);
  });

  it('shows overspending against the usable budget in the saving status', () => {
    const entries = [{ type: 'expense', amountCents: 120000, category: 'shopping' }];
    const goal = { targetSavingCents: 100000, endDate: '2026-06-30' };
    const summary = summarizeEntries(entries, { monthlyBudgetCents: 200000, savingGoal: goal });
    const status = calculateSavingGoal(goal, {
      today: '2026-06-13',
      monthlyBudgetCents: 200000,
      expenseCents: summary.expenseCents
    });

    expect(summary.budgetLimitCents).toBe(100000);
    expect(summary.budgetRemainingCents).toBe(-20000);
    expect(summary.budgetUsedPercent).toBe(120);
    expect(status.remainingAvailableCents).toBe(-20000);
    expect(status.overBudgetCents).toBe(20000);
    expect(status.projectedSavingCents).toBe(80000);
    expect(status.savingGapCents).toBe(20000);
  });

  it('tracks a dynamic month-end balance target from current balance', () => {
    const goal = calculateSavingGoal(
      {
        name: '月底余额',
        currentBalanceCents: 1440600,
        targetBalanceCents: 1400000,
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      },
      { today: '2026-06-13', monthlyBudgetCents: 200000 }
    );

    expect(goal.progressPercent).toBe(100);
    expect(goal.remainingCents).toBe(0);
    expect(goal.balanceDeltaCents).toBe(40600);
    expect(goal.safeToSpendCents).toBe(40600);
    expect(goal.dailyAvailableCents).toBe(2255);
    expect(goal.dailyRequiredCents).toBe(0);
    expect(goal.projectedSavingCents).toBe(159400);
  });

  it('shows the shortfall when current balance is below the month-end target', () => {
    const goal = calculateSavingGoal(
      {
        name: '月底余额',
        currentBalanceCents: 1380000,
        targetBalanceCents: 1400000,
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      },
      { today: '2026-06-13', monthlyBudgetCents: 200000 }
    );

    expect(goal.progressPercent).toBe(99);
    expect(goal.remainingCents).toBe(20000);
    expect(goal.balanceDeltaCents).toBe(-20000);
    expect(goal.safeToSpendCents).toBe(0);
    expect(goal.dailyAvailableCents).toBe(0);
    expect(goal.dailyRequiredCents).toBe(1112);
    expect(goal.projectedSavingCents).toBe(200000);
  });

  it('keeps legacy saved amount goals readable', () => {
    const goal = calculateSavingGoal(
      {
        name: '六月存钱',
        targetCents: 500000,
        savedCents: 125000,
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      },
      { today: '2026-06-13' }
    );

    expect(goal.progressPercent).toBe(25);
    expect(goal.remainingCents).toBe(375000);
    expect(goal.dailyRequiredCents).toBe(20834);
  });

  it('uses legacy month-end balance targets as usable budget input', () => {
    const entries = [{ type: 'expense', amountCents: 1700, category: 'food' }];
    const goal = {
      currentBalanceCents: 1440600,
      targetBalanceCents: 1400000,
      endDate: '2026-06-30'
    };
    const summary = summarizeEntries(entries, { monthlyBudgetCents: 200000, savingGoal: goal });
    const status = calculateSavingGoal(goal, {
      today: '2026-06-13',
      monthlyBudgetCents: 200000,
      expenseCents: summary.expenseCents
    });

    expect(summary.budgetLimitCents).toBe(40600);
    expect(summary.targetSavingCents).toBe(159400);
    expect(summary.budgetUsedPercent).toBe(4);
    expect(status.remainingAvailableCents).toBe(38900);
    expect(status.projectedSavingCents).toBe(159400);
  });
});
