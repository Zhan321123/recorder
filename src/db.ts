// TEMP: 链路验证 —— SQLite 初始化与自检。
// 功能阶段会替换为正式的数据访问层，但数据库文件路径不变（sqlite:recorder.db）。
import Database from "@tauri-apps/plugin-sql";

export type DbStatus = { ok: boolean; message: string };

const DB_PATH = "sqlite:recorder.db";

let db: Database | null = null;

export async function initDb(): Promise<DbStatus> {
  try {
    db = await Database.load(DB_PATH);
    await db.execute(
      "CREATE TABLE IF NOT EXISTS _meta (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "event TEXT NOT NULL, " +
        "at TEXT NOT NULL)"
    );
    await db.execute("INSERT INTO _meta (event, at) VALUES ($1, $2)", [
      "app_start",
      new Date().toISOString(),
    ]);
    const rows = await db.select<{ version: string }[]>(
      "SELECT sqlite_version() AS version"
    );
    return { ok: true, message: `DB OK (${rows[0]?.version ?? "?"})` };
  } catch (e) {
    return { ok: false, message: `DB 失败: ${String(e)}` };
  }
}

export function getDb(): Database {
  if (!db) throw new Error("DB 未初始化");
  return db;
}
