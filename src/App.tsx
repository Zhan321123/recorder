import { useEffect, useState } from "react";
import TopBar from "./components/TopBar";
import { initDb } from "./lib/db";
import BillPage from "./modules/bill/BillPage";
import WorkPage from "./modules/work/WorkPage";
import SchedulePage from "./modules/schedule/SchedulePage";
import SettingsPage from "./settings/SettingsPage";
import { useUiStore } from "./stores/ui";

export default function App() {
  const tab = useUiStore((s) => s.tab);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="break-all text-sm text-destructive">数据库初始化失败：{error}</p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        {tab === "bill" && <BillPage />}
        {tab === "work" && <WorkPage />}
        {tab === "schedule" && <SchedulePage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
