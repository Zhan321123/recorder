import { create } from "zustand";
import {
  getDb,
  type Account,
  type BillRecord,
  type Category,
  type Transfer,
} from "../lib/db";
import { monthKey, nowIso } from "../lib/format";

export interface RecordInput {
  type: "income" | "expense";
  amount_cents: number;
  account_id: number;
  category_id: number;
  date: string;
  note: string;
}

export interface TransferInput {
  from_account_id: number;
  to_account_id: number;
  amount_cents: number;
  date: string;
  note: string;
}

/** "2026-09" → "2026-10"（用于月末界） */
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return monthKey(new Date(y, mo, 1));
}

interface BillState {
  loaded: boolean;
  month: string; // 当前查看月份 "YYYY-MM"
  accounts: Account[];
  categories: Category[];
  records: BillRecord[]; // 当月流水
  transfers: Transfer[]; // 当月转账
  balances: Record<number, number>; // 全时段账户余额（分）
  init: () => Promise<void>;
  setMonth: (month: string) => Promise<void>;
  refresh: () => Promise<void>;
  addRecord: (r: RecordInput) => Promise<void>;
  updateRecord: (id: number, r: RecordInput) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  addTransfer: (t: TransferInput) => Promise<void>;
  updateTransfer: (id: number, t: TransferInput) => Promise<void>;
  deleteTransfer: (id: number) => Promise<void>;
  addAccount: (name: string, initialCents?: number) => Promise<void>;
  updateAccount: (id: number, name: string) => Promise<void>;
  setAccountArchived: (id: number, archived: boolean) => Promise<void>;
  /** 被引用时返回错误文案，删除成功返回 null */
  deleteAccount: (id: number) => Promise<string | null>;
  addCategory: (name: string, type: "income" | "expense") => Promise<void>;
  updateCategory: (id: number, name: string) => Promise<void>;
  deleteCategory: (id: number) => Promise<string | null>;
}

export const useBillStore = create<BillState>((set, get) => ({
  loaded: false,
  month: monthKey(new Date()),
  accounts: [],
  categories: [],
  records: [],
  transfers: [],
  balances: {},

  init: async () => {
    await get().refresh();
    set({ loaded: true });
  },

  setMonth: async (month) => {
    set({ month });
    await get().refresh();
  },

  refresh: async () => {
    const db = getDb();
    const { month } = get();
    const from = `${month}-01`;
    const to = `${nextMonth(month)}-01`;

    const [accounts, categories, records, transfers] = await Promise.all([
      db.select<Account[]>("SELECT * FROM bill_accounts ORDER BY sort, id"),
      db.select<Category[]>("SELECT * FROM bill_categories ORDER BY sort, id"),
      db.select<BillRecord[]>(
        "SELECT * FROM bill_records WHERE date >= $1 AND date < $2 ORDER BY date DESC, id DESC",
        [from, to]
      ),
      db.select<Transfer[]>(
        "SELECT * FROM bill_transfers WHERE date >= $1 AND date < $2 ORDER BY date DESC, id DESC",
        [from, to]
      ),
    ]);

    // 余额 = 初始金额 + 全部收入 - 全部支出 + 转入 - 转出（全时段）
    const [recDelta, transIn, transOut] = await Promise.all([
      db.select<{ account_id: number; delta: number }[]>(
        "SELECT account_id, SUM(CASE WHEN type='income' THEN amount_cents ELSE -amount_cents END) AS delta FROM bill_records GROUP BY account_id"
      ),
      db.select<{ id: number; delta: number }[]>(
        "SELECT to_account_id AS id, SUM(amount_cents) AS delta FROM bill_transfers GROUP BY to_account_id"
      ),
      db.select<{ id: number; delta: number }[]>(
        "SELECT from_account_id AS id, -SUM(amount_cents) AS delta FROM bill_transfers GROUP BY from_account_id"
      ),
    ]);
    const balances: Record<number, number> = {};
    for (const a of accounts) balances[a.id] = a.initial_cents;
    for (const r of recDelta) balances[r.account_id] = (balances[r.account_id] ?? 0) + r.delta;
    for (const r of transIn) balances[r.id] = (balances[r.id] ?? 0) + r.delta;
    for (const r of transOut) balances[r.id] = (balances[r.id] ?? 0) + r.delta;

    set({ accounts, categories, records, transfers, balances });
  },

  addRecord: async (r) => {
    const now = nowIso();
    await getDb().execute(
      "INSERT INTO bill_records (type, amount_cents, account_id, category_id, date, note, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)",
      [r.type, r.amount_cents, r.account_id, r.category_id, r.date, r.note, now]
    );
    await get().refresh();
  },

  updateRecord: async (id, r) => {
    await getDb().execute(
      "UPDATE bill_records SET type=$1, amount_cents=$2, account_id=$3, category_id=$4, date=$5, note=$6, updated_at=$7 WHERE id=$8",
      [r.type, r.amount_cents, r.account_id, r.category_id, r.date, r.note, nowIso(), id]
    );
    await get().refresh();
  },

  deleteRecord: async (id) => {
    await getDb().execute("DELETE FROM bill_records WHERE id=$1", [id]);
    await get().refresh();
  },

  addTransfer: async (t) => {
    await getDb().execute(
      "INSERT INTO bill_transfers (from_account_id, to_account_id, amount_cents, date, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [t.from_account_id, t.to_account_id, t.amount_cents, t.date, t.note, nowIso()]
    );
    await get().refresh();
  },

  updateTransfer: async (id, t) => {
    await getDb().execute(
      "UPDATE bill_transfers SET from_account_id=$1, to_account_id=$2, amount_cents=$3, date=$4, note=$5 WHERE id=$6",
      [t.from_account_id, t.to_account_id, t.amount_cents, t.date, t.note, id]
    );
    await get().refresh();
  },

  deleteTransfer: async (id) => {
    await getDb().execute("DELETE FROM bill_transfers WHERE id=$1", [id]);
    await get().refresh();
  },

  addAccount: async (name, initialCents = 0) => {
    const max = await getDb().select<{ m: number | null }[]>(
      "SELECT MAX(sort) AS m FROM bill_accounts"
    );
    await getDb().execute(
      "INSERT INTO bill_accounts (name, sort, initial_cents) VALUES ($1, $2, $3)",
      [name, (max[0].m ?? 0) + 1, initialCents]
    );
    await get().refresh();
  },

  updateAccount: async (id, name) => {
    await getDb().execute("UPDATE bill_accounts SET name=$1 WHERE id=$2", [name, id]);
    await get().refresh();
  },

  setAccountArchived: async (id, archived) => {
    await getDb().execute("UPDATE bill_accounts SET archived=$1 WHERE id=$2", [
      archived ? 1 : 0,
      id,
    ]);
    await get().refresh();
  },

  deleteAccount: async (id) => {
    const db = getDb();
    const [r1, r2] = await Promise.all([
      db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM bill_records WHERE account_id=$1", [id]),
      db.select<{ n: number }[]>(
        "SELECT COUNT(*) AS n FROM bill_transfers WHERE from_account_id=$1 OR to_account_id=$1",
        [id]
      ),
    ]);
    if (r1[0].n > 0 || r2[0].n > 0) return "该账户已有流水或转账，不能删除，可改为归档";
    await db.execute("DELETE FROM bill_accounts WHERE id=$1", [id]);
    await get().refresh();
    return null;
  },

  addCategory: async (name, type) => {
    const max = await getDb().select<{ m: number | null }[]>(
      "SELECT MAX(sort) AS m FROM bill_categories WHERE type=$1",
      [type]
    );
    await getDb().execute(
      "INSERT INTO bill_categories (name, type, sort, is_builtin) VALUES ($1, $2, $3, 0)",
      [name, type, (max[0].m ?? 0) + 1]
    );
    await get().refresh();
  },

  updateCategory: async (id, name) => {
    await getDb().execute("UPDATE bill_categories SET name=$1 WHERE id=$2", [name, id]);
    await get().refresh();
  },

  deleteCategory: async (id) => {
    const db = getDb();
    const rows = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM bill_records WHERE category_id=$1",
      [id]
    );
    if (rows[0].n > 0) return "该分类已有流水，不能删除";
    await db.execute("DELETE FROM bill_categories WHERE id=$1", [id]);
    await get().refresh();
    return null;
  },
}));
