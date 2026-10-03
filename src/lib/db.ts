// 正式数据层：连接管理 + 全表 schema 初始化 + 种子数据。
// 数据库文件沿用里程碑一的位置（sqlite:recorder.db），旧数据保留，仅删除 _meta 调试表。
// 注意：tauri-plugin-sql 的 JS 侧没有事务 API，多步写操作在各模块代码里按顺序 await，
// 外键级联删除也在应用层手动处理（不依赖 PRAGMA foreign_keys）。
import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:recorder.db";
// v2：bill_accounts 新增 initial_cents（账户初始金额）
export const SCHEMA_VERSION = "3";

let db: Database | null = null;
let initPromise: Promise<void> | null = null;

export function getDb(): Database {
  if (!db) throw new Error("DB 未初始化");
  return db;
}

export async function initDb(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const conn = await Database.load(DB_PATH);
    db = conn;
    await conn.execute("DROP TABLE IF EXISTS _meta"); // 里程碑一调试表
    await createSchema(conn);
    await migrate(conn);
    await seedIfEmpty(conn);
  })();
  try {
    await initPromise;
  } catch (e) {
    initPromise = null; // 失败后允许重试
    throw e;
  }
}

async function createSchema(conn: Database): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    // 账单
    `CREATE TABLE IF NOT EXISTS bill_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      initial_cents INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS bill_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      sort INTEGER NOT NULL DEFAULT 0,
      is_builtin INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS bill_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount_cents INTEGER NOT NULL,
      account_id INTEGER NOT NULL REFERENCES bill_accounts(id),
      category_id INTEGER NOT NULL REFERENCES bill_categories(id),
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS bill_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_id INTEGER NOT NULL,
      to_account_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`,
    // 班时
    `CREATE TABLE IF NOT EXISTS work_days (
      date TEXT PRIMARY KEY,
      hours REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS work_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_from TEXT NOT NULL,
      daily_hours REAL NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS custom_festivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cal_type TEXT NOT NULL CHECK(cal_type IN ('lunar','solar')),
      month INTEGER NOT NULL,
      day INTEGER NOT NULL
    )`,
    // 课程表
    `CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id INTEGER NOT NULL REFERENCES semesters(id),
      label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_id INTEGER NOT NULL REFERENCES semesters(id),
      slot_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '',
      UNIQUE(slot_id, weekday)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bill_records_date ON bill_records(date)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_slots_semester ON schedule_slots(semester_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_courses_semester ON schedule_courses(semester_id)`,
  ];
  for (const sql of statements) {
    await conn.execute(sql);
  }
}

/** 老库升级：按 app_meta.schema_version 逐版本迁移（新库建表已是最新结构，跳过）。
 *  每步都用 PRAGMA 探测实际结构，兼容「导入旧备份后 meta 版本回退」的场景 */
async function migrate(conn: Database): Promise<void> {
  const rows = await conn.select<{ value: string }[]>(
    "SELECT value FROM app_meta WHERE key = 'schema_version'"
  );
  const version = rows[0]?.value;
  if (version === "1") {
    // v1 → v2：账户初始金额
    const cols = await conn.select<{ name: string }[]>(
      "PRAGMA table_info(bill_accounts)"
    );
    if (!cols.some((c) => c.name === "initial_cents")) {
      await conn.execute(
        "ALTER TABLE bill_accounts ADD COLUMN initial_cents INTEGER NOT NULL DEFAULT 0"
      );
    }
    await conn.execute("UPDATE app_meta SET value = '2' WHERE key = 'schema_version'");
  }
  if (version === "1" || version === "2") {
    // v2 → v3：班时不再计薪，去掉计薪方式/金额列
    const cols = await conn.select<{ name: string }[]>(
      "PRAGMA table_info(work_settings)"
    );
    if (cols.some((c) => c.name === "pay_type")) {
      await conn.execute("ALTER TABLE work_settings DROP COLUMN pay_type");
      await conn.execute("ALTER TABLE work_settings DROP COLUMN rate_cents");
    }
    await conn.execute("UPDATE app_meta SET value = '3' WHERE key = 'schema_version'");
  }
}

async function seedIfEmpty(conn: Database): Promise<void> {
  const now = new Date().toISOString();

  const accounts = await conn.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM bill_accounts"
  );
  if (accounts[0].n === 0) {
    const names = ["现金", "微信", "支付宝"];
    for (let i = 0; i < names.length; i++) {
      await conn.execute(
        "INSERT INTO bill_accounts (name, sort) VALUES ($1, $2)",
        [names[i], i]
      );
    }
  }

  const categories = await conn.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM bill_categories"
  );
  if (categories[0].n === 0) {
    const expense = ["餐饮", "交通", "购物", "住房", "娱乐", "医疗", "教育", "其他支出"];
    const income = ["工资", "兼职", "红包", "理财", "其他收入"];
    for (let i = 0; i < expense.length; i++) {
      await conn.execute(
        "INSERT INTO bill_categories (name, type, sort, is_builtin) VALUES ($1, 'expense', $2, 1)",
        [expense[i], i]
      );
    }
    for (let i = 0; i < income.length; i++) {
      await conn.execute(
        "INSERT INTO bill_categories (name, type, sort, is_builtin) VALUES ($1, 'income', $2, 1)",
        [income[i], i]
      );
    }
  }

  const settings = await conn.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM work_settings"
  );
  if (settings[0].n === 0) {
    // 默认 8 小时/天，引导用户去班时模块设置
    await conn.execute(
      "INSERT INTO work_settings (effective_from, daily_hours, created_at) VALUES ('1970-01-01', 8, $1)",
      [now]
    );
  }

  const semesters = await conn.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM semesters"
  );
  if (semesters[0].n === 0) {
    const r = await conn.execute(
      "INSERT INTO semesters (name, created_at) VALUES ('默认学期', $1)",
      [now]
    );
    await metaSet("active_semester_id", String(r.lastInsertId));
  }

  await metaSet("schema_version", SCHEMA_VERSION);
}

export async function metaGet(key: string): Promise<string | null> {
  const rows = await getDb().select<{ value: string }[]>(
    "SELECT value FROM app_meta WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function metaSet(key: string, value: string): Promise<void> {
  await getDb().execute(
    "INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value]
  );
}

// ---------- 行类型 ----------

export interface Account {
  id: number;
  name: string;
  sort: number;
  archived: number;
  initial_cents: number;
}

export interface Category {
  id: number;
  name: string;
  type: "income" | "expense";
  sort: number;
  is_builtin: number;
}

export interface BillRecord {
  id: number;
  type: "income" | "expense";
  amount_cents: number;
  account_id: number;
  category_id: number;
  date: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount_cents: number;
  date: string;
  note: string;
  created_at: string;
}

export interface WorkDay {
  date: string;
  hours: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface WorkSetting {
  id: number;
  effective_from: string;
  daily_hours: number;
  created_at: string;
}

export interface CustomFestival {
  id: number;
  name: string;
  cal_type: "lunar" | "solar";
  month: number;
  day: number;
}

export interface Semester {
  id: number;
  name: string;
  created_at: string;
}

export interface ScheduleSlot {
  id: number;
  semester_id: number;
  label: string;
  start_time: string;
  end_time: string;
  sort: number;
}

export interface ScheduleCourse {
  id: number;
  semester_id: number;
  slot_id: number;
  weekday: number;
  name: string;
  color: string;
}
