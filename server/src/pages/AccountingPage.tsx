import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAccounting } from '../hooks/useAccounting';
import {
  ACCOUNTING_ENTRY_COLLAPSE_LIMIT,
  AccountingCategory,
  AccountingCategoryId,
  AccountingEntry,
  AccountingEntryType,
  formatMoney,
  sanitizeMoneyInput
} from '../lib/accounting';
import { formatAccountingCreatedAt, getAccountingEntryTitle } from '../lib/accountingPresentation';
import { AccountingMobileTabs, type AccountingPanel } from '../components/accounting/AccountingMobileTabs';
import accountingHeroImage from '../assets/accounting-hero.webp';

const ACCOUNTING_MOBILE_QUERY = '(max-width: 720px)';

const ACCOUNTING_CATEGORY_TYPE_LABELS: Record<AccountingCategory['type'], string> = {
  expense: '支出',
  income: '收入',
  both: '通用'
};

function getAccountingCategoryLabel(category: AccountingCategory, categories: AccountingCategory[]) {
  const hasDuplicateName = categories.some((item) => item.id !== category.id && item.name === category.name);
  return hasDuplicateName ? `${category.name} · ${ACCOUNTING_CATEGORY_TYPE_LABELS[category.type]}` : category.name;
}

function useAccountingMobileMode() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(ACCOUNTING_MOBILE_QUERY).matches : false
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(ACCOUNTING_MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(query.matches);

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  return isMobile;
}

export function AccountingPage() {
  const { notify } = useApp();
  const [mobilePanel, setMobilePanel] = useState<AccountingPanel>('entry');
  const isMobileAccounting = useAccountingMobileMode();

  const {
    accountingMonth,
    accountingData,
    accountingForm,
    accountingTypeFilter,
    accountingCategoryFilter,
    setAccountingMonth,
    setAccountingTypeFilter,
    setAccountingCategoryFilter,
    updateAccountingForm,
    loadAccountingData,
    saveAccountingEntry,
    removeAccountingEntry,
    saveAccountingSettings,
    accountingSettingsForm,
    setAccountingSettingsForm,
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
    accountingEntries,
    visibleAccountingEntries,
    accountingEntriesExpanded,
    setAccountingEntriesExpanded,
    hasCollapsedAccountingEntries,
    budgetHealth,
    accountingPaymentMethods,
    editingAccountingId,
    startEditAccountingEntry,
    resetAccountingForm
  } = useAccounting(notify);

  const [localEditingId, setLocalEditingId] = useState<string | null>(null);

  const handleAccountingTypeFilterChange = (type: AccountingEntryType | 'all') => {
    setAccountingTypeFilter(type);
    setAccountingEntriesExpanded(false);
    void loadAccountingData(accountingMonth, type, accountingCategoryFilter);
  };

  const handleAccountingCategoryFilterChange = (category: AccountingCategoryId | 'all') => {
    setAccountingCategoryFilter(category);
    setAccountingEntriesExpanded(false);
    void loadAccountingData(accountingMonth, accountingTypeFilter, category);
  };

  const handleAccountingMonthChange = (month: string) => {
    setAccountingMonth(month);
    setAccountingEntriesExpanded(false);
    void loadAccountingData(month, accountingTypeFilter, accountingCategoryFilter);
  };

  return (
    <section className="accounting-page">
      <section className="accounting-hero">
        <div>
          <p className="eyebrow">Private Ledger</p>
          <h1>本月收支和存钱目标</h1>
          <p>数据通过管理员会话从服务端读取。</p>
        </div>
        <img alt="" className="accounting-hero-art" src={accountingHeroImage} />
        <div className="accounting-actions">
          <input
            aria-label="选择月份"
            onChange={(event) => handleAccountingMonthChange(event.target.value)}
            type="month"
            value={accountingMonth}
          />
        </div>
      </section>

      {isMobileAccounting ? <AccountingMobileTabs active={mobilePanel} onChange={setMobilePanel} /> : null}

      <section
        aria-label="本月概览"
        className={`accounting-metrics ${mobilePanel === 'overview' ? 'is-mobile-active' : ''}`}
        data-accounting-panel="overview"
        id="accounting-panel-overview"
      >
        <div className="metric-card">
          <i className="metric-icon metric-income" aria-hidden="true" />
          <span className="metric-label">本月收入</span>
          <strong>{formatMoney(accountingData?.summary.incomeCents ?? 0)}</strong>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-expense" aria-hidden="true" />
          <span className="metric-label">本月支出</span>
          <strong>{formatMoney(accountingData?.summary.expenseCents ?? 0)}</strong>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-balance" aria-hidden="true" />
          <span className="metric-label">本月可用</span>
          <strong>{formatMoney(accountingData?.summary.budgetLimitCents ?? 0)}</strong>
        </div>
        <div className={`metric-card metric-focus metric-${budgetHealth}`}>
          <i className="metric-icon metric-budget" aria-hidden="true" />
          <span className="metric-label">剩余可用</span>
          <strong>{formatMoney(accountingData?.summary.budgetRemainingCents ?? 0)}</strong>
          <div className="metric-progress" aria-label={`可用额度已用 ${accountingData?.summary.budgetUsedPercent ?? 0}%`}>
            <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
          </div>
          <small>已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</small>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-saving" aria-hidden="true" />
          <span className="metric-label">计划存钱</span>
          <strong>{formatMoney(accountingData?.summary.targetSavingCents ?? 0)}</strong>
          <small>预计 {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}</small>
        </div>
      </section>

      <section className="accounting-layout">
        <form
          aria-label="快速记一笔"
          className={`accounting-card accounting-form ${mobilePanel === 'entry' ? 'is-mobile-active' : ''}`}
          data-accounting-panel="entry"
          id="accounting-panel-entry"
          onSubmit={saveAccountingEntry}
        >
          <div className="panel-heading">
            <h2>{localEditingId ? '编辑流水' : '快速记一笔'}</h2>
            {localEditingId ? (
              <button className="accounting-secondary-action" onClick={() => resetAccountingForm()} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
          <div className="segmented-control">
            {(['expense', 'income'] as AccountingEntryType[]).map((type) => (
              <button
                className={accountingForm.type === type ? 'active' : ''}
                key={type}
                onClick={() =>
                  updateAccountingForm({
                    type,
                    category: type === 'income' ? 'salary' : 'food'
                  })
                }
                type="button"
              >
                {type === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
          <div className="ledger-filter-grid">
            <label>
              金额
              <input
                inputMode="decimal"
                onChange={(event) =>
                  updateAccountingForm({ amountYuan: sanitizeMoneyInput(event.target.value) })
                }
                placeholder="0.00"
                value={accountingForm.amountYuan}
              />
            </label>
            <label>
              分类
              <select
                onChange={(event) =>
                  updateAccountingForm({ category: event.target.value as AccountingCategoryId })
                }
                value={accountingForm.category}
              >
                {accountingCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getAccountingCategoryLabel(category, allAccountingCategories)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ledger-filter-grid">
            <label>
              日期
              <input
                onChange={(event) => updateAccountingForm({ spentAt: event.target.value })}
                type="date"
                value={accountingForm.spentAt}
              />
            </label>
            <label>
              支付方式
              <select
                onChange={(event) => updateAccountingForm({ account: event.target.value })}
                value={accountingForm.account}
              >
                {accountingPaymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="custom-category-panel">
            <summary>
              <strong>自定义分类</strong>
              <small>添加后会同步出现在记账分类和流水筛选里。</small>
            </summary>
            <div className="custom-category-controls">
              <input
                onChange={(event) => setCustomAccountingCategoryName(event.target.value)}
                placeholder="例如：咖啡、服务器、订阅"
                value={customAccountingCategoryName}
              />
              <select
                onChange={(event) => setCustomAccountingCategoryType(event.target.value as AccountingEntryType)}
                value={customAccountingCategoryType}
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
              <button className="accounting-secondary-action" onClick={() => addCustomAccountingCategory()} type="button">
                添加
              </button>
            </div>
            {customAccountingCategories.length ? (
              <div className="custom-category-list">
                {customAccountingCategories.map((category) => {
                  const draft = categoryDrafts[category.id] ?? { name: category.name, type: category.type };
                  return (
                    <div className="custom-category-item" key={category.id}>
                      <input
                        onChange={(event) =>
                          setCategoryDrafts((current) => ({
                            ...current,
                            [category.id]: { ...draft, name: event.target.value }
                          }))
                        }
                        value={draft.name}
                      />
                      <select
                        onChange={(event) =>
                          setCategoryDrafts((current) => ({
                            ...current,
                            [category.id]: { ...draft, type: event.target.value as 'income' | 'expense' | 'both' }
                          }))
                        }
                        value={draft.type}
                      >
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                        <option value="both">通用</option>
                      </select>
                      <button
                        className="accounting-secondary-action"
                        onClick={() => saveCustomAccountingCategory(category.id)}
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        className="danger"
                        onClick={() => removeCustomAccountingCategory(category.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </details>
          <label>
            备注
            <input
              onChange={(event) => updateAccountingForm({ note: event.target.value })}
              placeholder="例如：午饭、课程、工资"
              value={accountingForm.note}
            />
          </label>
          <label className="toggle-row">
            <input
              checked={accountingForm.includeInSaving}
              onChange={(event) => updateAccountingForm({ includeInSaving: event.target.checked })}
              type="checkbox"
            />
            <span>
              <strong>计入存钱项目</strong>
              <small>勾选后参与剩余可用计算；收入不会进入本月收入。</small>
            </span>
          </label>
          <button className="accounting-primary-action" type="submit">
            {localEditingId ? '保存更新' : '保存流水'}
          </button>
        </form>

        <section
          aria-label="流水"
          className={`accounting-card ${mobilePanel === 'ledger' ? 'is-mobile-active' : ''}`}
          data-accounting-panel="ledger"
          id="accounting-panel-ledger"
        >
          <div className="panel-heading">
            <h2>流水筛选 · {accountingEntries.length} 条</h2>
            {hasCollapsedAccountingEntries ? (
              <button
                className="accounting-secondary-action"
                onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)}
                type="button"
              >
                {accountingEntriesExpanded ? '收起' : `展开全部`}
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              类型
              <select
                value={accountingTypeFilter}
                onChange={(event) =>
                  handleAccountingTypeFilterChange(event.target.value as AccountingEntryType | 'all')
                }
              >
                <option value="all">全部</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>
            <label>
              分类
              <select
                value={accountingCategoryFilter}
                onChange={(event) =>
                  handleAccountingCategoryFilterChange(event.target.value as AccountingCategoryId | 'all')
                }
              >
                <option value="all">全部分类</option>
                {allAccountingCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getAccountingCategoryLabel(category, allAccountingCategories)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="entry-list">
            {visibleAccountingEntries.map((entry: AccountingEntry) => (
              <div className="entry-item" key={entry.id}>
                <span className={`entry-type entry-${entry.type}`}>
                  {entry.type === 'expense' ? '支' : '收'}
                </span>
                <span className="entry-main">
                  <strong>{getAccountingEntryTitle(entry, accountingData?.categories)}</strong>
                  <small>
                    <time dateTime={entry.createdAt}>{formatAccountingCreatedAt(entry)}</time>
                    <em className={`entry-saving-badge ${entry.includeInSaving ? 'active' : ''}`}>
                      {entry.includeInSaving ? '存钱项目' : '普通流水'}
                    </em>
                  </small>
                </span>
                <strong className={entry.type === 'expense' ? 'money-expense' : 'money-income'}>
                  {entry.type === 'expense' ? '-' : '+'}
                  {formatMoney(entry.amountCents)}
                </strong>
                <span className="entry-actions">
                  <button
                    className="entry-edit"
                    onClick={() => {
                      startEditAccountingEntry(entry);
                      setMobilePanel('entry');
                    }}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className="danger"
                    onClick={() => removeAccountingEntry(entry)}
                    type="button"
                  >
                    删除
                  </button>
                </span>
              </div>
            ))}
            {accountingData && accountingData.entries.length === 0 ? (
              <div className="empty-state">这个筛选条件下还没有流水。</div>
            ) : null}
            {hasCollapsedAccountingEntries ? (
              <button
                className="entry-toggle accounting-secondary-action"
                onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)}
                type="button"
              >
                {accountingEntriesExpanded
                  ? '收起流水'
                  : `还有 ${accountingEntries.length - ACCOUNTING_ENTRY_COLLAPSE_LIMIT} 条，展开查看`}
              </button>
            ) : null}
          </div>
        </section>

        <form
          aria-label="预算和存钱计划"
          className={`accounting-card saving-panel ${mobilePanel === 'plan' ? 'is-mobile-active' : ''}`}
          data-accounting-panel="plan"
          id="accounting-panel-plan"
          onSubmit={saveAccountingSettings}
        >
          <div className="panel-heading">
            <h2>预算和存钱计划</h2>
            <button className="accounting-primary-action" type="submit">保存设置</button>
          </div>
          <label>
            每月生活费
            <input
              inputMode="decimal"
              onChange={(event) =>
                setAccountingSettingsForm((current) => ({
                  ...current,
                  monthlyBudgetYuan: sanitizeMoneyInput(event.target.value)
                }))
              }
              placeholder="例如：2000"
              value={accountingSettingsForm.monthlyBudgetYuan}
            />
          </label>
          <div className="progress-track">
            <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
          </div>
          <p>可用额度已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</p>
          {accountingSettingsForm.savingGoal ? (
            <>
              <div className="form-grid">
                <label>
                  本月计划存钱
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: {
                          ...current.savingGoal!,
                          targetSavingYuan: sanitizeMoneyInput(event.target.value)
                        }
                      }))
                    }
                    placeholder="例如：1000"
                    value={accountingSettingsForm.savingGoal.targetSavingYuan ?? ''}
                  />
                </label>
                <label>
                  本月可用额度
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: {
                          ...current.savingGoal!,
                          availableBudgetYuan: sanitizeMoneyInput(event.target.value)
                        }
                      }))
                    }
                    placeholder="例如：1000"
                    value={accountingSettingsForm.savingGoal.availableBudgetYuan ?? ''}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  结束日期
                  <input
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: { ...current.savingGoal!, endDate: event.target.value }
                      }))
                    }
                    type="date"
                    value={accountingSettingsForm.savingGoal.endDate}
                  />
                </label>
              </div>
            </>
          ) : null}
          <div className="saving-summary">
            <span>
              <small>存钱进度</small>
              <strong>{accountingData?.savingGoal?.progressPercent ?? 0}%</strong>
            </span>
            <span>
              <small>剩余可用</small>
              <strong>
                {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                  ? formatMoney(accountingData?.savingGoal?.remainingAvailableCents ?? 0)
                  : `超支 ${formatMoney(accountingData?.savingGoal?.overBudgetCents ?? 0)}`}
              </strong>
            </span>
            <span>
              <small>每日建议</small>
              <strong>
                {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                  ? `最多 ${formatMoney(accountingData?.savingGoal?.dailyAvailableCents ?? 0)}`
                  : `补足 ${formatMoney(accountingData?.savingGoal?.dailyRequiredCents ?? 0)}`}
              </strong>
            </span>
            <span>
              <small>预计可存</small>
              <strong>
                {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}
                {(accountingData?.savingGoal?.savingGapCents ?? 0) > 0
                  ? ` · 差 ${formatMoney(accountingData?.savingGoal?.savingGapCents ?? 0)}`
                  : ''}
                {(accountingData?.savingGoal?.savingSurplusCents ?? 0) > 0
                  ? ` · 多 ${formatMoney(accountingData?.savingGoal?.savingSurplusCents ?? 0)}`
                  : ''}
              </strong>
            </span>
          </div>
        </form>
      </section>
    </section>
  );
}
