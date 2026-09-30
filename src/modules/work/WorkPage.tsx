import { useEffect, useState } from "react";
import { useWorkStore } from "../../stores/work";
import { cn } from "../../lib/utils";
import MonthCalendar from "./MonthCalendar";
import WorkSettingsPanel from "./WorkSettingsPanel";

export default function WorkPage() {
  const loaded = useWorkStore((s) => s.loaded);
  const [sub, setSub] = useState<"calendar" | "settings">("calendar");

  useEffect(() => {
    useWorkStore.getState().init();
  }, []);

  if (!loaded) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 gap-1 border-b bg-background px-2 py-1.5">
        {(
          [
            ["calendar", "日历"],
            ["settings", "设置"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
              sub === k && "bg-secondary font-medium text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        {sub === "calendar" ? <MonthCalendar /> : <WorkSettingsPanel />}
      </div>
    </div>
  );
}
