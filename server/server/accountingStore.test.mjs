import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createAccountingStore } from './accountingStore.mjs';

let tempDir;
let database;
let store;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-accounting-'));
  database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createAccountingStore({ database });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('accounting store', () => {
  it('does not create or expose legacy accounting sessions', () => {
    expect(database.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounting_sessions'")).toEqual([]);
    expect(store).not.toHaveProperty('createSession');
    expect(store).not.toHaveProperty('getSession');
    expect(store).not.toHaveProperty('removeExpiredSessions');
    expect(store).not.toHaveProperty('debugListSessions');
  });

  it('creates entries and calculates monthly summary from sqlite data', () => {
    const food = store.createEntry({
      type: 'expense',
      amountYuan: '32.50',
      category: 'food',
      account: '支付宝',
      spentAt: '2026-06-13',
      note: '午饭'
    });
    store.createEntry({
      type: 'income',
      amountYuan: '6800',
      category: 'salary',
      account: '银行卡',
      spentAt: '2026-06-01',
      note: '工资',
      includeInSaving: false
    });
    store.createEntry({
      type: 'expense',
      amountYuan: '12',
      category: 'transport',
      account: '微信',
      spentAt: '2026-05-28',
      note: '地铁'
    });

    const updated = store.updateEntry(food.id, { amountYuan: '35.00', note: '午饭和水' });
    const summary = store.getMonthData({ month: '2026-06' });

    expect(updated.amountCents).toBe(3500);
    expect(summary.entries).toHaveLength(2);
    expect(summary.summary.incomeCents).toBe(680000);
    expect(summary.summary.expenseCents).toBe(3500);
    expect(summary.summary.balanceCents).toBe(676500);
    expect(summary.summary.topExpenseCategory).toEqual({ category: 'food', amountCents: 3500 });
  });

  it('stores precise entry timestamps and lists newest same-day entries first', () => {
    const first = store.createEntry({
      type: 'expense',
      amountYuan: '5',
      category: 'food',
      account: 'wechat',
      spentAt: '2026-06-17',
      note: 'first'
    });
    const second = store.createEntry({
      type: 'expense',
      amountYuan: '12',
      category: 'food',
      account: 'wechat',
      spentAt: '2026-06-17',
      note: 'second'
    });
    const monthData = store.getMonthData({ month: '2026-06' });

    expect(first.createdAt).toContain('T');
    expect(first.updatedAt).toContain('T');
    expect(monthData.entries.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it('defaults entries into the saving project and persists opt-outs', () => {
    const defaultEntry = store.createEntry({
      type: 'expense',
      amountYuan: '100',
      category: 'food',
      account: 'cash',
      spentAt: '2026-06-13',
      note: ''
    });
    const excludedIncome = store.createEntry({
      type: 'income',
      amountYuan: '5000',
      category: 'salary',
      account: 'bank',
      spentAt: '2026-06-13',
      note: '',
      includeInSaving: false
    });
    const updated = store.updateEntry(defaultEntry.id, { includeInSaving: false });
    const monthData = store.getMonthData({ month: '2026-06' });

    expect(defaultEntry.includeInSaving).toBe(true);
    expect(excludedIncome.includeInSaving).toBe(false);
    expect(updated.includeInSaving).toBe(false);
    expect(monthData.entries.map((entry) => [entry.id, entry.includeInSaving])).toEqual([
      [excludedIncome.id, false],
      [defaultEntry.id, false]
    ]);
    expect(monthData.summary.incomeCents).toBe(500000);
    expect(monthData.summary.budgetRemainingCents).toBe(0);
  });

  it('stores custom categories and allows entries to use them', () => {
    const category = store.createCategory({ name: '咖啡', type: 'expense' });
    const entry = store.createEntry({
      type: 'expense',
      amountYuan: '18',
      category: category.id,
      account: 'wechat',
      spentAt: '2026-06-17',
      note: 'latte'
    });
    const monthData = store.getMonthData({ month: '2026-06' });

    expect(category.custom).toBe(true);
    expect(entry.category).toBe(category.id);
    expect(monthData.categories.some((item) => item.id === category.id && item.name === '咖啡')).toBe(true);
  });

  it('updates and deletes custom categories safely', () => {
    const category = store.createCategory({ name: '订阅', type: 'expense' });
    const updated = store.updateCategory(category.id, { name: '服务订阅', type: 'both' });
    const deleted = store.removeCategory(category.id);

    expect(updated.name).toBe('服务订阅');
    expect(updated.type).toBe('both');
    expect(deleted).toBe(true);
  });

  it('allows deleting a category already used by entries', () => {
    const category = store.createCategory({ name: '咖啡', type: 'expense' });
    store.createEntry({
      type: 'expense',
      amountYuan: '18',
      category: category.id,
      account: 'wechat',
      spentAt: '2026-06-17',
      note: 'latte'
    });

    expect(store.removeCategory(category.id)).toBe(true);
  });

  it('does not change monthly summary when deleting a used custom category', () => {
    store.updateSettings({ monthlyBudgetYuan: '100' });
    const category = store.createCategory({ name: 'codex', type: 'expense' });
    store.createEntry({
      type: 'expense',
      amountYuan: '18',
      category: category.id,
      account: 'wechat',
      spentAt: '2026-06-17',
      note: 'latte'
    });

    const before = store.getMonthData({ month: '2026-06' }).summary;
    const deleted = store.removeCategory(category.id);
    const after = store.getMonthData({ month: '2026-06' }).summary;

    expect(deleted).toBe(true);
    expect(store.getMonthData({ month: '2026-06' }).categories.some((item) => item.id === category.id)).toBe(false);
    expect(after.budgetRemainingCents).toBe(before.budgetRemainingCents);
    expect(after.expenseCents).toBe(before.expenseCents);
  });

  it('merges income and expense custom categories with the same name into one category', () => {
    const expense = store.createCategory({ name: 'codex', type: 'expense' });
    const income = store.createCategory({ name: 'codex', type: 'income' });
    const matching = store.getMonthData({ month: '2026-06' }).categories.filter((category) => category.name === 'codex');

    expect(income.id).toBe(expense.id);
    expect(expense.type).toBe('expense');
    expect(income.type).toBe('both');
    expect(matching).toHaveLength(1);
    expect(matching[0].type).toBe('both');
  });

  it('coalesces existing duplicate custom categories and keeps their entries', () => {
    const expense = store.createCategory({ name: 'codex', type: 'expense' });
    const income = store.createCategory({ name: 'codex-income', type: 'income' });
    store.createEntry({
      type: 'expense',
      amountYuan: '8',
      category: expense.id,
      account: 'wechat',
      spentAt: '2026-06-19',
      note: ''
    });
    store.createEntry({
      type: 'income',
      amountYuan: '12',
      category: income.id,
      account: 'wechat',
      spentAt: '2026-06-19',
      note: ''
    });
    store.updateCategory(income.id, { name: 'codex', type: 'income' });

    const monthData = store.getMonthData({ month: '2026-06' });
    const matching = monthData.categories.filter((category) => category.name === 'codex');

    expect(matching).toHaveLength(1);
    expect(matching[0].type).toBe('both');
    expect(monthData.entries.every((entry) => entry.category === matching[0].id)).toBe(true);
  });

  it('keeps dashboard summary based on the whole month when entries are filtered', () => {
    store.updateSettings({ monthlyBudgetYuan: '100' });
    const traffic = store.createCategory({ name: 'traffic', type: 'expense' });
    store.createEntry({
      type: 'expense',
      amountYuan: '10',
      category: 'food',
      account: 'wechat',
      spentAt: '2026-06-17',
      note: ''
    });
    store.createEntry({
      type: 'expense',
      amountYuan: '5',
      category: traffic.id,
      account: 'wechat',
      spentAt: '2026-06-18',
      note: ''
    });

    const filtered = store.getMonthData({ month: '2026-06', category: traffic.id });

    expect(filtered.entries).toHaveLength(1);
    expect(filtered.summary.expenseCents).toBe(1500);
    expect(filtered.summary.budgetRemainingCents).toBe(8500);
  });

  it('stores budget and one-month saving goal settings', () => {
    store.updateSettings({
      monthlyBudgetYuan: '3000',
      savingGoal: {
        name: '六月存钱',
        targetYuan: '5000',
        savedYuan: '1250',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    });

    const monthData = store.getMonthData({ month: '2026-06', today: '2026-06-13' });

    expect(monthData.settings.monthlyBudgetCents).toBe(300000);
    expect(monthData.savingGoal.progressPercent).toBe(25);
    expect(monthData.savingGoal.remainingCents).toBe(375000);
    expect(monthData.savingGoal.dailyRequiredCents).toBe(20834);
  });

  it('allows monthly budget without a saving goal', () => {
    store.updateSettings({
      monthlyBudgetYuan: '3000',
      savingGoal: {
        name: '本月存钱目标',
        targetYuan: '',
        savedYuan: '',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    });

    const monthData = store.getMonthData({ month: '2026-06' });

    expect(monthData.settings.monthlyBudgetCents).toBe(300000);
    expect(monthData.savingGoal).toBeNull();
  });

  it('stores a dynamic month-end balance target', () => {
    store.updateSettings({
      monthlyBudgetYuan: '2000',
      savingGoal: {
        name: '月底余额目标',
        currentBalanceYuan: '14406',
        targetBalanceYuan: '14000',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    });

    const monthData = store.getMonthData({ month: '2026-06', today: '2026-06-13' });

    expect(monthData.settings.monthlyBudgetCents).toBe(200000);
    expect(monthData.settings.savingGoal.currentBalanceCents).toBe(1440600);
    expect(monthData.settings.savingGoal.targetBalanceCents).toBe(1400000);
    expect(monthData.savingGoal.safeToSpendCents).toBe(40600);
    expect(monthData.savingGoal.projectedSavingCents).toBe(159400);
  });

  it('stores planned saving and manual usable budget settings', () => {
    store.createEntry({
      type: 'expense',
      amountYuan: '300',
      category: 'food',
      account: '支付宝',
      spentAt: '2026-06-13',
      note: '月中支出'
    });
    store.updateSettings({
      monthlyBudgetYuan: '2000',
      savingGoal: {
        name: '本月存钱计划',
        targetSavingYuan: '1000',
        availableBudgetYuan: '600',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    });

    const monthData = store.getMonthData({ month: '2026-06', today: '2026-06-13' });

    expect(monthData.settings.monthlyBudgetCents).toBe(200000);
    expect(monthData.settings.savingGoal.targetSavingCents).toBe(100000);
    expect(monthData.settings.savingGoal.availableBudgetCents).toBe(60000);
    expect(monthData.summary.budgetLimitCents).toBe(60000);
    expect(monthData.summary.budgetUsedPercent).toBe(50);
    expect(monthData.summary.budgetRemainingCents).toBe(30000);
    expect(monthData.savingGoal.remainingAvailableCents).toBe(30000);
    expect(monthData.savingGoal.projectedSavingCents).toBe(140000);
  });

  it('removes entries by id', () => {
    const entry = store.createEntry({
      type: 'expense',
      amountYuan: '88',
      category: 'shopping',
      account: '现金',
      spentAt: '2026-06-10',
      note: '键盘'
    });

    expect(store.removeEntry(entry.id)).toBe(true);
    expect(store.getMonthData({ month: '2026-06' }).entries).toHaveLength(0);
  });
});
