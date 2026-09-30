// 备份格式 v1 的导出与导入。
// 导出：全表查出 → JSON → 系统保存对话框 → 写文件（里程碑一已验证双端可用）。
// 导入：系统打开对话框选 JSON → 校验 → 用户确认 → 全量替换（先删后插，父表先插）。
// 注意：tauri-plugin-sql JS 侧无事务 API，导入失败可能留下部分数据，
// 但导入前已做完整结构校验，实际失败概率极低；失败后重新导入同一文件即可。
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";

const BACKUP_VERSION = 1;

interface TableDef {
  /** 备份 JSON 中 data 下的键名 */
  key: string;
  /** SQLite 表名 */
  table: string;
  /** 参与备份的列（与 INSERT 列序一致） */
  columns: string[];
  /** 确认对话框里显示的中文名 */
  label: string;
}

// 顺序即插入顺序：父表在前，子表在后（应用层维护引用顺序）
const TABLES: TableDef[] = [
  { key: "billAccounts", table: "bill_accounts", columns: ["id", "name", "sort", "archived"], label: "账户" },
  { key: "billCategories", table: "bill_categories", columns: ["id", "name", "type", "sort", "is_builtin"], label: "账单分类" },
  {
    key: "billRecords",
    table: "bill_records",
    columns: ["id", "type", "amount_cents", "account_id", "category_id", "date", "note", "created_at", "updated_at"],
    label: "账单流水",
  },
  {
    key: "billTransfers",
    table: "bill_transfers",
    columns: ["id", "from_account_id", "to_account_id", "amount_cents", "date", "note", "created_at"],
    label: "转账记录",
  },
  { key: "workDays", table: "work_days", columns: ["date", "hours", "note", "created_at", "updated_at"], label: "班时记录" },
  {
    key: "workSettings",
    table: "work_settings",
    columns: ["id", "effective_from", "daily_hours", "pay_type", "rate_cents", "created_at"],
    label: "班时设置历史",
  },
  { key: "customFestivals", table: "custom_festivals", columns: ["id", "name", "cal_type", "month", "day"], label: "自定义节日" },
  { key: "semesters", table: "semesters", columns: ["id", "name", "created_at"], label: "学期" },
  {
    key: "scheduleSlots",
    table: "schedule_slots",
    columns: ["id", "semester_id", "label", "start_time", "end_time", "sort"],
    label: "时间槽",
  },
  {
    key: "scheduleCourses",
    table: "schedule_courses",
    columns: ["id", "semester_id", "slot_id", "weekday", "name", "color"],
    label: "课程",
  },
];

type Row = Record<string, unknown>;

interface BackupFile {
  app: string;
  backupVersion: number;
  exportedAt: string;
  data: Record<string, Row[] | Record<string, string>>;
}

export interface ImportPreview {
  exportedAt: string;
  counts: { label: string; count: number }[];
  payload: BackupFile;
}

export async function exportBackup(): Promise<string> {
  const db = getDb();
  const data: Record<string, unknown> = {};
  for (const t of TABLES) {
    data[t.key] = await db.select(`SELECT ${t.columns.join(",")} FROM ${t.table} ORDER BY rowid`);
  }
  const metaRows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM app_meta ORDER BY key"
  );
  data.appMeta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

  const path = await save({
    title: "导出备份",
    defaultPath: `recorder-backup-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return "已取消";

  const payload: BackupFile = {
    app: "recorder",
    backupVersion: BACKUP_VERSION,
    exportedAt: d.toISOString(),
    data: data as BackupFile["data"],
  };
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  return `已导出: ${path}`;
}

/** 弹出文件选择并解析校验；用户取消返回 null，文件非法抛错 */
export async function pickImportFile(): Promise<ImportPreview | null> {
  const picked = await open({
    title: "导入备份",
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!picked) return null;

  const text = await readTextFile(picked);
  let json: BackupFile;
  try {
    json = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error("文件不是合法的 JSON");
  }
  validate(json);
  return {
    exportedAt: json.exportedAt,
    counts: TABLES.map((t) => ({
      label: t.label,
      count: (json.data[t.key] as Row[]).length,
    })),
    payload: json,
  };
}

function validate(json: BackupFile): void {
  if (json?.app !== "recorder") throw new Error("不是 Recorder 的备份文件");
  if (json.backupVersion !== BACKUP_VERSION)
    throw new Error(`不支持的备份版本: ${String(json.backupVersion)}`);
  if (!json.data || typeof json.data !== "object") throw new Error("备份内容缺失 data");
  for (const t of TABLES) {
    if (!Array.isArray(json.data[t.key])) throw new Error(`备份内容缺失或损坏: ${t.key}`);
  }
  if (typeof json.data.appMeta !== "object" || json.data.appMeta === null || Array.isArray(json.data.appMeta))
    throw new Error("备份内容缺失或损坏: appMeta");
}

/** 执行全量替换导入（调用前必须先经 pickImportFile 校验并由用户确认） */
export async function runImport(preview: ImportPreview): Promise<void> {
  const db = getDb();
  const { payload } = preview;

  // 先删：子表在前
  for (const t of [...TABLES].reverse()) {
    await db.execute(`DELETE FROM ${t.table}`);
  }
  await db.execute("DELETE FROM app_meta");

  // app_meta
  const appMeta = payload.data.appMeta as Record<string, string>;
  for (const [k, v] of Object.entries(appMeta)) {
    await db.execute("INSERT INTO app_meta (key, value) VALUES ($1, $2)", [k, String(v)]);
  }

  // 再插：父表在前；显式 id 插入，AUTOINCREMENT 的 sqlite_sequence 会自动跟进最大值
  for (const t of TABLES) {
    const rows = payload.data[t.key] as Row[];
    const placeholders = t.columns.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${t.table} (${t.columns.join(", ")}) VALUES (${placeholders})`;
    for (const row of rows) {
      await db.execute(sql, t.columns.map((c) => row[c] ?? null));
    }
  }
}
