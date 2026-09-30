import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useScheduleStore } from "../../stores/schedule";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import type { ScheduleSlot } from "../../lib/db";

export default function SlotManager() {
  const slots = useScheduleStore((s) => s.slots);
  const courses = useScheduleStore((s) => s.courses);
  const deleteSlot = useScheduleStore((s) => s.deleteSlot);
  const moveSlot = useScheduleStore((s) => s.moveSlot);

  const [editing, setEditing] = useState<ScheduleSlot | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleting = slots.find((s) => s.id === confirmDeleteId);
  const deletingCourseCount = courses.filter((c) => c.slot_id === confirmDeleteId).length;

  return (
    <div className="flex flex-col gap-2 p-3 pb-8">
      <p className="text-xs text-muted-foreground">
        把一天划分为若干时间段（槽位），课程表按槽位分行。如「6:00-7:00 早读」。
      </p>

      {slots.map((slot, i) => (
        <div
          key={slot.id}
          className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2"
        >
          <div className="flex-1">
            <p className="text-sm font-medium">{slot.label}</p>
            <p className="text-xs text-muted-foreground">
              {slot.start_time} - {slot.end_time}
            </p>
          </div>
          <button
            className="cursor-pointer p-1.5 text-muted-foreground disabled:opacity-30"
            disabled={i === 0}
            onClick={() => moveSlot(slot.id, -1)}
            aria-label="上移"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            className="cursor-pointer p-1.5 text-muted-foreground disabled:opacity-30"
            disabled={i === slots.length - 1}
            onClick={() => moveSlot(slot.id, 1)}
            aria-label="下移"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            className="cursor-pointer p-1.5 text-muted-foreground"
            onClick={() => setEditing(slot)}
            aria-label="编辑"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="cursor-pointer p-1.5 text-destructive"
            onClick={() => setConfirmDeleteId(slot.id)}
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <Button variant="outline" onClick={() => setEditing("new")} className="mt-1">
        <Plus className="mr-1 h-4 w-4" />
        添加时间槽
      </Button>

      <SlotEditDialog slot={editing} onClose={() => setEditing(null)} />

      {/* 删除确认（级联课程） */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除时间槽</DialogTitle>
          </DialogHeader>
          {deleting && (
            <>
              <p className="text-sm">
                删除「{deleting.label} {deleting.start_time}-{deleting.end_time}」
                {deletingCourseCount > 0
                  ? `将同时删除该槽位的 ${deletingCourseCount} 节课。`
                  : "。"}
                不可恢复。
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await deleteSlot(deleting.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  确认删除
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SlotEditDialog({
  slot,
  onClose,
}: {
  slot: ScheduleSlot | "new" | null;
  onClose: () => void;
}) {
  const addSlot = useScheduleStore((s) => s.addSlot);
  const updateSlot = useScheduleStore((s) => s.updateSlot);

  const [label, setLabel] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (slot && slot !== "new") {
      setLabel(slot.label);
      setStart(slot.start_time);
      setEnd(slot.end_time);
    } else {
      setLabel("");
      setStart("08:00");
      setEnd("09:00");
    }
    setError("");
  }, [slot]);

  if (!slot) return null;
  const isNew = slot === "new";

  async function onSave() {
    setError("");
    const l = label.trim();
    if (!l) return setError("请输入名称，如：早读");
    if (!start || !end) return setError("请选择起止时间");
    if (start >= end) return setError("开始时间需早于结束时间");
    setBusy(true);
    try {
      if (isNew) await addSlot(l, start, end);
      else await updateSlot((slot as ScheduleSlot).id, l, start, end);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "添加时间槽" : "编辑时间槽"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>名称</Label>
          <Input
            placeholder="如：早读、早餐、第 1 节、晚自习"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={10}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label>开始</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>结束</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={onSave} disabled={busy}>
          保存
        </Button>
      </DialogContent>
    </Dialog>
  );
}
