import { useEffect, useState } from "react";
import { initDb, type DbStatus } from "./db";
import { exportBackup } from "./backup";

const TABS = ["账单", "班时", "课程表"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [active, setActive] = useState<Tab>("账单");

  // TEMP: 链路验证 —— SQLite 初始化状态（功能阶段删除）
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    ok: false,
    message: "DB 初始化中…",
  });
  // TEMP: 链路验证 —— 导出结果提示（功能阶段删除）
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    initDb().then(setDbStatus);
  }, []);

  async function onExportTest() {
    setExportMsg("导出中…");
    setExportMsg(await exportBackup());
  }

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={"tab" + (t === active ? " active" : "")}
              onClick={() => setActive(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {/* TEMP: 链路验证 UI，功能阶段删除 */}
        <div className="debug">
          <span className={dbStatus.ok ? "db-ok" : "db-err"}>
            {dbStatus.message}
          </span>
          <button className="export-test" onClick={onExportTest}>
            导出测试
          </button>
          {exportMsg && <span className="export-msg">{exportMsg}</span>}
        </div>
      </header>
      <main className="content">{/* 里程碑一：内容区留空 */}</main>
    </div>
  );
}
