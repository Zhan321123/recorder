import { Settings } from "lucide-react";
import { useUiStore, type TabKey } from "../stores/ui";
import { cn } from "../lib/utils";

const TABS: { key: TabKey; label: string }[] = [
  { key: "bill", label: "账单" },
  { key: "work", label: "班时" },
  { key: "schedule", label: "课程表" },
];

export default function TopBar() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);

  return (
    <header className="flex shrink-0 items-stretch border-b bg-background">
      <nav className="flex flex-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 cursor-pointer border-b-2 border-transparent px-2 py-3 text-sm font-medium text-muted-foreground transition-colors",
              tab === t.key && "border-primary text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <button
        onClick={() => setTab("settings")}
        aria-label="设置"
        className={cn(
          "cursor-pointer border-b-2 border-transparent px-4 text-muted-foreground transition-colors",
          tab === "settings" && "border-primary text-foreground"
        )}
      >
        <Settings className="size-5" />
      </button>
    </header>
  );
}
