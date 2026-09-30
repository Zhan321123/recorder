import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useBillStore } from "../../stores/bill";
import { cn } from "../../lib/utils";
import RecordList from "./RecordList";
import StatsView from "./StatsView";
import ManagePage from "./ManagePage";
import RecordEditorDialog, { type EditingTarget } from "./RecordEditorDialog";

type SubTab = "list" | "stats" | "manage";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "list", label: "流水" },
  { key: "stats", label: "统计" },
  { key: "manage", label: "管理" },
];

export default function BillPage() {
  const loaded = useBillStore((s) => s.loaded);
  const [sub, setSub] = useState<SubTab>("list");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EditingTarget>(null);

  useEffect(() => {
    useBillStore.getState().init();
  }, []);

  if (!loaded) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(target: EditingTarget) {
    setEditing(target);
    setEditorOpen(true);
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 gap-1 border-b bg-background px-2 py-1.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
              sub === t.key && "bg-secondary font-medium text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {sub === "list" && <RecordList onEdit={openEdit} />}
        {sub === "stats" && <StatsView />}
        {sub === "manage" && <ManagePage />}
      </div>

      {sub === "list" && (
        <button
          onClick={openCreate}
          aria-label="记一笔"
          className="fixed bottom-6 right-6 z-40 flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <Plus className="size-7" />
        </button>
      )}

      <RecordEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
      />
    </div>
  );
}
