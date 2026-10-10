import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ACCOUNTING_CATEGORIES,
  ACCOUNTING_PAYMENT_METHODS,
  AccountingCategory,
  AccountingCategoryId,
  AccountingEntry,
  AccountingEntryDraft,
  AccountingEntryType,
  AccountingMonthData,
  AccountingSettingsDraft,
  currentMonthInput,
  formatMoney,
  getAccountingCategory,
  getBudgetHealth,
  getVisibleAccountingEntries,
  sanitizeMoneyInput,
  sortAccountingEntries,
  todayDateInput,
  ACCOUNTING_ENTRY_COLLAPSE_LIMIT
} from '../lib/accounting';
import {
  createAccountingEntry,
  createAccountingCategory,
  deleteAccountingEntry,
  deleteAccountingCategory,
  getAccountingMonth,
  updateAccountingCategory,
  updateAccountingEntry,
  updateAccountingSettings
} from '../lib/accountingApi';
import { NotificationType } from '../lib/notification';

type AccountingTypeFilter = 'all' | AccountingEntryType;
type AccountingCategoryFilter = 'all' | AccountingCategoryId;
type NotifyFn = (type: NotificationType, message: string, durationMs?: number) => void;

const EMPTY_ACCOUNTING_ENTRY: AccountingEntryDraft = {
  type: 'expense',
  amountYuan: '',
  category: 'food',
  account: '微信',
  spentAt: todayDateInput(),
  note: '',
  includeInSaving: true
};

const EMPTY_ACCOUNTING_SETTINGS: AccountingSettingsDraft = {
  monthlyBudgetYuan: '',
  savingGoal: {
    name: '本月存钱计划',
    targetSavingYuan: '',
    availableBudgetYuan: '',
    startDate: `${currentMonthInput()}-01`,
    endDate: `${currentMonthInput()}-30`
  }
};

function centsToInput(cents = 0): string {
  return cents > 0 ? String(cents / 100) : '';
}

function getAccountingCategoryLabel(category: AccountingCategory, categories: AccountingCategory[]) {
  const CATEGORY_TYPE_LABELS: Record<AccountingCategory['type'], string> = {
    expense: '支出',
    income: '收入',
    both: '通用'
  };
  const hasDuplicateName = categories.some((item) => item.id !== category.id && item.name === category.name);
  return hasDuplicateName ? `${category.name} · ${CATEGORY_TYPE_LABELS[category.type]}` : category.name;
}

export function useAccounting(notify: NotifyFn) {
  const [accountingMonth, setAccountingMonth] = useState(currentMonthInput());
  const [accountingTypeFilter, setAccountingTypeFilter] = useState<AccountingTypeFilter>('all');
  const [accountingCategoryFilter, setAccountingCategoryFilter] = useState<AccountingCategoryFilter>('all');
  const [accountingData, setAccountingData] = useState<AccountingMonthData | null>(null);
  const [accountingEntriesExpanded, setAccountingEntriesExpanded] = useState(false);
  const [accountingForm, setAccountingForm] = useState<AccountingEntryDraft>(EMPTY_ACCOUNTING_ENTRY);
  const [editingAccountingId, setEditingAccountingId] = useState<string | null>(null);
  const [accountingSettingsForm, setAccountingSettingsForm] =
    useState<AccountingSettingsDraft>(EMPTY_ACCOUNTING_SETTINGS);
  const [customAccountingCategoryName, setCustomAccountingCategoryName] = useState('');
  const [customAccountingCategoryType, setCustomAccountingCategoryType] = useState<AccountingEntryType>('expense');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { name: string; type: 'income' | 'expense' | 'both' }>>({});

  const accountingCategories = useMemo(() => {
    const categories = accountingData?.categories?.length ? accountingData.categories : ACCOUNTING_CATEGORIES;
    return categories.filter((category) => category.type === 'both' || category.type === accountingForm.type);
  }, [accountingData?.categories, accountingForm.type]);

  const allAccountingCategories = accountingData?.categories?.length ? accountingData.categories : ACCOUNTING_CATEGORIES;
  const customAccountingCategories = allAccountingCategories.filter((category) => category.custom);

  const accountingPaymentMethods = useMemo(() => {
    const methods = [...ACCOUNTING_PAYMENT_METHODS];
    if (accountingForm.account && !methods.includes(accountingForm.account as (typeof ACCOUNTING_PAYMENT_METHODS)[number])) {
      return [...methods, accountingForm.account];
    }
    return methods;
  }, [accountingForm.account]);

  const accountingEntries = useMemo(() => sortAccountingEntries(accountingData?.entries ?? []), [accountingData?.entries]);
  const visibleAccountingEntries = getVisibleAccountingEntries(accountingEntries, accountingEntriesExpanded);
  const hasCollapsedAccountingEntries = accountingEntries.length > ACCOUNTING_ENTRY_COLLAPSE_LIMIT;
  const budgetHealth = getBudgetHealth({
    remainingCents: accountingData?.summary.budgetRemainingCents ?? 0,
    limitCents: accountingData?.summary.budgetLimitCents ?? 0
  });

  const syncAccountingSettingsForm = (data: AccountingMonthData) => {
    setAccountingSettingsForm({
      monthlyBudgetYuan: centsToInput(data.settings.monthlyBudgetCents),
      savingGoal: data.savingGoal
        ? {
            name: data.savingGoal.name,
            targetSavingYuan: centsToInput(
              data.savingGoal.targetSavingCents ??
                data.savingGoal.projectedSavingCents ??
                data.savingGoal.targetCents
            ),
            availableBudgetYuan: centsToInput(
              data.savingGoal.availableBudgetCents ??
                data.savingGoal.budgetLimitCents ??
                data.savingGoal.safeToSpendCents ??
                data.summary.budgetLimitCents
            ),
            startDate: data.savingGoal.startDate,
            endDate: data.savingGoal.endDate
          }
        : EMPTY_ACCOUNTING_SETTINGS.savingGoal
    });
  };

  const loadAccountingData = async (
    month = accountingMonth,
    type = accountingTypeFilter,
    category = accountingCategoryFilter
  ) => {
    try {
      const data = await getAccountingMonth({ month, type, category });
      setAccountingData(data);
      syncAccountingSettingsForm(data);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('session')) {
        notify('error', '记账登录已过期，请重新登录');
        return;
      }
      notify('error', error instanceof Error ? error.message : '记账数据加载失败');
    }
  };

  useEffect(() => {
    void loadAccountingData();
  }, []);

  const updateAccountingForm = (patch: Partial<AccountingEntryDraft>) => {
    setAccountingForm((current) => ({ ...current, ...patch }));
  };

  const resetAccountingForm = () => {
    setEditingAccountingId(null);
    setAccountingForm({ ...EMPTY_ACCOUNTING_ENTRY, spentAt: todayDateInput() });
  };

  const startEditAccountingEntry = (entry: AccountingEntry) => {
    setEditingAccountingId(entry.id);
    setAccountingForm({
      type: entry.type,
      amountYuan: centsToInput(entry.amountCents),
      category: entry.category,
      account: entry.account,
      spentAt: entry.spentAt,
      note: entry.note,
      includeInSaving: entry.includeInSaving
    });
  };

  const saveAccountingEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountingForm.amountYuan.trim()) {
      notify('error', '请填写金额');
      return;
    }
    if (!accountingForm.account.trim()) {
      notify('error', '请填写账户');
      return;
    }

    try {
      if (editingAccountingId) {
        await updateAccountingEntry(editingAccountingId, accountingForm);
      } else {
        await createAccountingEntry(accountingForm);
      }
      resetAccountingForm();
      await loadAccountingData();
      notify('success', editingAccountingId ? '流水已更新' : '流水已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '流水保存失败');
    }
  };

  const removeAccountingEntry = async (entry: AccountingEntry) => {
    const confirmed = window.confirm(`确认删除这笔 ${formatMoney(entry.amountCents)} 的流水吗？`);
    if (!confirmed) return;

    try {
      await deleteAccountingEntry(entry.id);
      await loadAccountingData();
      notify('success', '流水已删除');
      if (editingAccountingId === entry.id) resetAccountingForm();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '流水删除失败');
    }
  };

  const addCustomAccountingCategory = async () => {
    const name = customAccountingCategoryName.trim();
    if (!name) {
      notify('error', '请先填写分类名称');
      return;
    }

    try {
      await createAccountingCategory({ name, type: customAccountingCategoryType });
      await loadAccountingData();
      setCustomAccountingCategoryName('');
      notify('success', '自定义分类已添加');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类创建失败');
    }
  };

  const saveCustomAccountingCategory = async (id: string) => {
    const draft = categoryDrafts[id];
    if (!draft?.name?.trim()) {
      notify('error', '分类名称不能为空');
      return;
    }

    try {
      await updateAccountingCategory(id, { name: draft.name.trim(), type: draft.type });
      await loadAccountingData();
      notify('success', '分类已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类更新失败');
    }
  };

  const removeCustomAccountingCategory = async (id: string) => {
    if (!window.confirm('确认删除这个自定义分类吗？')) return;

    try {
      await deleteAccountingCategory(id);
      await loadAccountingData();
      notify('success', '分类已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类删除失败');
    }
  };

  const saveAccountingSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await updateAccountingSettings(accountingSettingsForm);
      await loadAccountingData();
      notify('success', '预算和存钱计划已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '设置保存失败');
    }
  };

  return {
    // Session & data
    accountingMonth,
    setAccountingMonth,
    accountingData,
    loadAccountingData,

    // Filters
    accountingTypeFilter,
    setAccountingTypeFilter,
    accountingCategoryFilter,
    setAccountingCategoryFilter,

    // Form & entries
    accountingForm,
    updateAccountingForm,
    editingAccountingId,
    resetAccountingForm,
    startEditAccountingEntry,
    saveAccountingEntry,
    removeAccountingEntry,
    accountingEntries,
    visibleAccountingEntries,
    accountingEntriesExpanded,
    setAccountingEntriesExpanded,
    hasCollapsedAccountingEntries,

    // Categories
    accountingCategories,
    allAccountingCategories,
    customAccountingCategories,
    customAccountingCategoryName,
    setCustomAccountingCategoryName,
    customAccountingCategoryType,
    setCustomAccountingCategoryType,
    categoryDrafts,
    setCategoryDrafts,
    addCustomAccountingCategory,
    saveCustomAccountingCategory,
    removeCustomAccountingCategory,
    getAccountingCategoryLabel,

    // Payment methods
    accountingPaymentMethods,

    // Settings
    accountingSettingsForm,
    setAccountingSettingsForm,
    saveAccountingSettings,

    // Budget health
    budgetHealth
  };
}
