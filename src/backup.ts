// TEMP: 链路验证 spike —— 验证「导出 JSON 备份」链路在 Windows / Android 双端是否走得通。
// Windows 预期：save() 弹保存对话框 → writeTextFile 写文件。
// Android 预期：save() 走系统 SAF；若不支持，报错信息本身就是 spike 结论，
// 备选方案为写应用专属目录 + 系统分享。验证结论记入 README。
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";

export async function exportBackup(): Promise<string> {
  try {
    const db = getDb();
    const meta = await db.select("SELECT * FROM _meta ORDER BY id");
    const payload = JSON.stringify(
      {
        app: "recorder",
        kind: "link-test",
        exportedAt: new Date().toISOString(),
        data: { _meta: meta },
      },
      null,
      2
    );

    const path = await save({
      title: "导出备份",
      defaultPath: "recorder-backup.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return "已取消";

    await writeTextFile(path, payload);
    return `已导出: ${path}`;
  } catch (e) {
    return `导出失败: ${String(e)}`;
  }
}
