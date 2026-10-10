import {
  assertEntryDraft,
  calculateSavingGoal,
  createAccountingId,
  DEFAULT_ACCOUNTING_CATEGORIES,
  monthOf,
  nowIso,
  parseMoneyToCents,
  summarizeEntries,
  today
} from './accountingModel.mjs';

function rowObject(columns, value) {
  return Object.fromEntries(columns.map((column, index) => [column, value[index]]));
}

function selectRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      account TEXT NOT NULL,
      spent_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounting_settings (
      id TEXT PRIMARY KEY,
      monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
      saving_goal_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS accounting_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      accent TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  try {
    db.run('ALTER TABLE accounting_entries ADD COLUMN include_in_saving INTEGER NOT NULL DEFAULT 1');
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
  }
}

function rowToEntry(row) {
  return {
    id: row.id,
    type: row.type,
    amountCents: Number(row.amount_cents),
    category: row.category,
    account: row.account,
    spentAt: row.spent_at,
    note: row.note || '',
    includeInSaving: row.include_in_saving !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToCategory(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    accent: row.accent,
    custom: true
  };
}

function normalizeCategoryDraft(draft) {
  const name = String(draft.name || '').trim();
  const type = String(draft.type || 'both');
  if (!name) throw new Error('Category name is required');
  if (!['income', 'expense', 'both'].includes(type)) throw new Error('Invalid category type');
  return { name: name.slice(0, 18), type };
}

function isDefaultCategory(id) {
  return DEFAULT_ACCOUNTING_CATEGORIES.some((category) => category.id === id);
}

function mergeCategoryTypes(...types) {
  const unique = [...new Set(types.filter(Boolean))];
  if (unique.includes('both') || unique.length > 1) return 'both';
  return unique[0] || 'both';
}

function normalizeEntryDraft(draft) {
  assertEntryDraft(draft);
  return {
    type: draft.type,
    amountCents: draft.amountCents ?? parseMoneyToCents(draft.amountYuan),
    category: draft.category,
    account: String(draft.account || '').trim(),
    spentAt: draft.spentAt,
    note: String(draft.note || '').trim(),
    includeInSaving: draft.includeInSaving !== false
  };
}

function normalizeSavingGoal(goal) {
  if (!goal) return null;
  const hasTargetSaving = String(goal.targetSavingYuan ?? goal.targetSavingCents ?? '').trim();
  const hasAvailableBudget = String(goal.availableBudgetYuan ?? goal.availableBudgetCents ?? '').trim();
  if (hasTargetSaving || hasAvailableBudget) {
    return {
      name: String(goal.name || '本月存钱计划').trim(),
      targetSavingCents: goal.targetSavingCents ?? parseMoneyToCents(goal.targetSavingYuan ?? '0', { emptyAsZero: true }),
      availableBudgetCents: hasAvailableBudget
        ? goal.availableBudgetCents ?? parseMoneyToCents(goal.availableBudgetYuan, { emptyAsZero: true })
        : undefined,
      startDate: goal.startDate,
      endDate: goal.endDate
    };
  }

  const hasCurrentBalance = String(goal.currentBalanceYuan ?? goal.currentBalanceCents ?? '').trim();
  const hasTargetBalance = String(goal.targetBalanceYuan ?? goal.targetBalanceCents ?? '').trim();
  if (hasCurrentBalance || hasTargetBalance) {
    return {
      name: String(goal.name || '月底余额目标').trim(),
      currentBalanceCents: goal.currentBalanceCents ?? parseMoneyToCents(goal.currentBalanceYuan),
      targetBalanceCents: goal.targetBalanceCents ?? parseMoneyToCents(goal.targetBalanceYuan),
      startDate: goal.startDate,
      endDate: goal.endDate
    };
  }

  const hasTarget = String(goal.targetYuan ?? goal.targetCents ?? '').trim();
  const hasSaved = String(goal.savedYuan ?? goal.savedCents ?? '').trim();
  if (!hasTarget && !hasSaved) return null;
  return {
    name: String(goal.name || '存钱目标').trim(),
    targetCents: goal.targetCents ?? parseMoneyToCents(goal.targetYuan),
    savedCents: goal.savedCents ?? parseMoneyToCents(goal.savedYuan ?? '0', { emptyAsZero: true }),
    startDate: goal.startDate,
    endDate: goal.endDate
  };
}

function parseSettings(row) {
  const goal = row?.saving_goal_json ? JSON.parse(row.saving_goal_json) : null;
  return {
    monthlyBudgetCents: Number(row?.monthly_budget_cents || 0),
    savingGoal: goal
  };
}

export function createAccountingStore({ database }) {
  const { db } = database;
  initSchema(db);
  database.persist();

  function getSettings() {
    const row = selectRows(db, 'SELECT * FROM accounting_settings WHERE id = ?', ['default'])[0];
    if (row) return parseSettings(row);
    return { monthlyBudgetCents: 0, savingGoal: null };
  }

  function coalesceCustomCategories() {
    const rows = selectRows(
      db,
      'SELECT rowid AS rowid, id, name, type, accent, created_at FROM accounting_categories ORDER BY created_at ASC, rowid ASC'
    );
    const groups = new Map();
    rows.forEach((row) => {
      const key = String(row.name || '').trim();
      groups.set(key, [...(groups.get(key) || []), row]);
    });

    let changed = false;
    groups.forEach((group) => {
      if (group.length === 0) return;
      const keeper = group[0];
      const mergedType = mergeCategoryTypes(...group.map((row) => row.type));
      if (keeper.type !== mergedType) {
        db.run('UPDATE accounting_categories SET type = ? WHERE id = ?', [mergedType, keeper.id]);
        changed = true;
      }
      group.slice(1).forEach((duplicate) => {
        db.run('UPDATE accounting_entries SET category = ? WHERE category = ?', [keeper.id, duplicate.id]);
        db.run('DELETE FROM accounting_categories WHERE id = ?', [duplicate.id]);
        changed = true;
      });
    });

    if (changed) database.persist();
  }

  function listCategories() {
    coalesceCustomCategories();
    return [
      ...DEFAULT_ACCOUNTING_CATEGORIES,
      ...selectRows(db, 'SELECT * FROM accounting_categories ORDER BY created_at ASC, rowid ASC').map(rowToCategory)
    ];
  }

  return {
    listCategories,

    createCategory(draft) {
      const normalized = normalizeCategoryDraft(draft);
      const existing = listCategories().find((category) => category.name === normalized.name);
      if (existing?.custom) {
        const mergedType = mergeCategoryTypes(existing.type, normalized.type);
        if (mergedType !== existing.type) {
          db.run('UPDATE accounting_categories SET type = ? WHERE id = ?', [mergedType, existing.id]);
          database.persist();
        }
        return { ...existing, type: mergedType };
      }
      if (existing && (existing.type === 'both' || existing.type === normalized.type)) return existing;
      const category = {
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...normalized,
        accent: '#d84b49',
        custom: true
      };
      db.run('INSERT INTO accounting_categories (id, name, type, accent, created_at) VALUES (?, ?, ?, ?, ?)', [
        category.id,
        category.name,
        category.type,
        category.accent,
        nowIso()
      ]);
      database.persist();
      return category;
    },

    updateCategory(id, patch) {
      if (isDefaultCategory(id)) throw new Error('Default category cannot be edited');
      const current = selectRows(db, 'SELECT * FROM accounting_categories WHERE id = ?', [id]).map(rowToCategory)[0];
      if (!current) return undefined;
      const normalized = normalizeCategoryDraft({
        name: patch.name ?? current.name,
        type: patch.type ?? current.type
      });
      db.run('UPDATE accounting_categories SET name = ?, type = ? WHERE id = ?', [normalized.name, normalized.type, id]);
      database.persist();
      coalesceCustomCategories();
      return listCategories().find((category) => category.name === normalized.name && category.custom) ?? { ...current, ...normalized };
    },

    removeCategory(id) {
      if (isDefaultCategory(id)) throw new Error('Default category cannot be deleted');
      const current = selectRows(db, 'SELECT id FROM accounting_categories WHERE id = ?', [id])[0];
      if (!current) return false;
      db.run('DELETE FROM accounting_categories WHERE id = ?', [id]);
      database.persist();
      return true;
    },

    createEntry(draft) {
      if (!listCategories().some((category) => category.id === draft.category)) throw new Error('Invalid category');
      const normalized = normalizeEntryDraft(draft);
      const now = nowIso();
      const entry = {
        id: createAccountingId(),
        ...normalized,
        createdAt: now,
        updatedAt: now
      };
      db.run(
        `INSERT INTO accounting_entries (
          id, type, amount_cents, category, account, spent_at, note, include_in_saving, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.type,
          entry.amountCents,
          entry.category,
          entry.account,
          entry.spentAt,
          entry.note,
          entry.includeInSaving ? 1 : 0,
          entry.createdAt,
          entry.updatedAt
        ]
      );
      database.persist();
      return entry;
    },

    updateEntry(id, patch) {
      const current = selectRows(db, 'SELECT * FROM accounting_entries WHERE id = ?', [id]).map(rowToEntry)[0];
      if (!current) return undefined;
      const nextDraft = {
        type: patch.type ?? current.type,
        amountCents: patch.amountCents ?? (patch.amountYuan ? parseMoneyToCents(patch.amountYuan) : current.amountCents),
        category: patch.category ?? current.category,
        account: patch.account ?? current.account,
        spentAt: patch.spentAt ?? current.spentAt,
        note: patch.note ?? current.note,
        includeInSaving: patch.includeInSaving ?? current.includeInSaving
      };
      if (!listCategories().some((category) => category.id === nextDraft.category)) throw new Error('Invalid category');
      const normalized = normalizeEntryDraft(nextDraft);
      const updated = { ...current, ...normalized, updatedAt: nowIso() };

      db.run(
        `UPDATE accounting_entries SET
          type = ?, amount_cents = ?, category = ?, account = ?, spent_at = ?, note = ?, include_in_saving = ?, updated_at = ?
        WHERE id = ?`,
        [
          updated.type,
          updated.amountCents,
          updated.category,
          updated.account,
          updated.spentAt,
          updated.note,
          updated.includeInSaving ? 1 : 0,
          updated.updatedAt,
          id
        ]
      );
      database.persist();
      return updated;
    },

    removeEntry(id) {
      const existing = selectRows(db, 'SELECT id FROM accounting_entries WHERE id = ?', [id])[0];
      if (!existing) return false;
      db.run('DELETE FROM accounting_entries WHERE id = ?', [id]);
      database.persist();
      return true;
    },

    listEntries({ month = monthOf(today()), type = 'all', category = 'all' } = {}) {
      return selectRows(db, 'SELECT * FROM accounting_entries WHERE substr(spent_at, 1, 7) = ? ORDER BY spent_at DESC, created_at DESC, rowid DESC', [
        month
      ])
        .map(rowToEntry)
        .filter((entry) => (type === 'all' || entry.type === type) && (category === 'all' || entry.category === category));
    },

    updateSettings(settings) {
      const current = getSettings();
      const next = {
        monthlyBudgetCents:
          settings.monthlyBudgetCents ??
          parseMoneyToCents(settings.monthlyBudgetYuan ?? String(current.monthlyBudgetCents / 100), { emptyAsZero: true }),
        savingGoal: settings.savingGoal === undefined ? current.savingGoal : normalizeSavingGoal(settings.savingGoal)
      };
      db.run(
        `INSERT INTO accounting_settings (id, monthly_budget_cents, saving_goal_json)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET monthly_budget_cents = excluded.monthly_budget_cents,
           saving_goal_json = excluded.saving_goal_json`,
        [next.monthlyBudgetCents, next.savingGoal ? JSON.stringify(next.savingGoal) : '']
      );
      database.persist();
      return next;
    },

    getSettings,

    getMonthData(options = {}) {
      const settings = getSettings();
      const entries = this.listEntries(options);
      const summaryEntries = this.listEntries({ month: options.month });
      const summary = summarizeEntries(summaryEntries, settings);
      return {
        entries,
        categories: listCategories(),
        settings,
        summary,
        savingGoal: calculateSavingGoal(settings.savingGoal, {
          today: options.today,
          monthlyBudgetCents: settings.monthlyBudgetCents,
          expenseCents: summary.savingNetExpenseCents
        })
      };
    }
  };
}
