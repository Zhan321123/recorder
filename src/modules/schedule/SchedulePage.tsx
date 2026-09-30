import { useEffect, useState } from "react";
import { ChevronDown, ListPlus, Trash2, Pencil, Check } from "lucide-react";
import { useScheduleStore } from "../../stores/schedule";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import WeekGrid from "./WeekGrid";
import SlotManager from "./SlotManager";

export default function SchedulePage() {
  const loaded = useScheduleStore((s) => s.loaded);
  const activeId = useScheduleStore((s) => s.activeId);
  const semesters = useScheduleStore((s) => s.semesters);
  const [view, setView] = useState<"grid" | "slots">("grid");
  const [semesterOpen, setSemesterOpen] = useState(false);

  useEffect(() => {
    useScheduleStore.getState().init();
  }, []);

  if (!loaded) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }

  const active = semesters.find((s) => s.id === activeId);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background px-3 py-1.5">
        <button
          onClick={() => setSemesterOpen(true)}
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {active?.name ?? "无学期"}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1" />
        {view === "grid" ? (
          <Button size="sm" variant="outline" onClick={() => setView("slots")}>
            <ListPlus className="mr-1 h-4 w-4" />
            时间槽
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setView("grid")}>
            返回课表
          </Button>
        )}
      </div>

      <div className="flex-1">
        {view === "grid" ? <WeekGrid onEditSlots={() => setView("slots")} /> : <SlotManager />}
      </div>

      <SemesterDialog open={semesterOpen} onClose={() => setSemesterOpen(false)} />
    </div>
  );
}

function SemesterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const semesters = useScheduleStore((s) => s.semesters);
  const activeId = useScheduleStore((s) => s.activeId);
  const slots = useScheduleStore((s) => s.slots);
  const setActive = useScheduleStore((s) => s.setActive);
  const addSemester = useScheduleStore((s) => s.addSemester);
  const renameSemester = useScheduleStore((s) => s.renameSemester);
  const deleteSemester = useScheduleStore((s) => s.deleteSemester);

  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onAdd() {
    setError("");
    const n = newName.trim();
    if (!n) return;
    await addSemester(n);
    setNewName("");
  }

  async function onRename(id: number) {
    setError("");
    const n = renameText.trim();
    if (!n) return setError("名称不能为空");
    await renameSemester(id, n);
    setRenamingId(null);
  }

  const deleting = semesters.find((s) => s.id === confirmDeleteId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>学期管理</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          {semesters.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-b py-2 last:border-b-0">
              {renamingId === s.id ? (
                <>
                  <Input
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="sm" onClick={() => onRename(s.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    className={cn(
                      "flex-1 cursor-pointer text-left text-sm",
                      s.id === activeId ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                    onClick={async () => {
                      await setActive(s.id);
                      onClose();
                    }}
                  >
                    {s.name}
                    {s.id === activeId && <span className="ml-1 text-xs text-primary">（当前）</span>}
                  </button>
                  <button
                    className="cursor-pointer p-1 text-muted-foreground"
                    onClick={() => {
                      setRenamingId(s.id);
                      setRenameText(s.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="cursor-pointer p-1 text-destructive"
                    onClick={() => setConfirmDeleteId(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="新学期名称，如：2026 秋"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={20}
          />
          <Button onClick={onAdd} className="shrink-0">
            新建
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* 删除确认（级联槽位和课程） */}
        {deleting && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>
              删除「{deleting.name}」将同时删除其{" "}
              {deleting.id === activeId ? slots.length : "全部"} 个时间槽和所有课程，不可恢复。
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteSemester(deleting.id);
                  setConfirmDeleteId(null);
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
