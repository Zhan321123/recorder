import { useEffect, useState } from "react";
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

export default function SlotEditDialog({
  slot,
  onClose,
}: {
  slot: ScheduleSlot | "new" | null;
  onClose: () => void;
}) {
  const courses = useScheduleStore((s) => s.courses);
  const addSlot = useScheduleStore((s) => s.addSlot);
  const updateSlot = useScheduleStore((s) => s.updateSlot);
  const deleteSlot = useScheduleStore((s) => s.deleteSlot);

  const [label, setLabel] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setConfirmDelete(false);
  }, [slot]);

  if (!slot) return null;
  const isNew = slot === "new";
  const courseCount = isNew ? 0 : courses.filter((c) => c.slot_id === slot.id).length;

  async function onSave() {
    setError("");
    const l = label.trim();
    if (!l) return setError("请输入名称，如：早读");
    if (!start || !end) return setError("请选择起止时间");
    if (start >= end) return setError("开始时间需早于结束时间（不支持跨午夜）");
    setBusy(true);
    try {
      if (isNew) await addSlot(l, start, end);
      else await updateSlot((slot as ScheduleSlot).id, l, start, end);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <p className="text-xs text-muted-foreground">
          保存后按开始时间自动排序；时间段不能与已有槽位重叠（首尾相接可以）。
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {confirmDelete && !isNew ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>
              删除「{label} {start}-{end}」
              {courseCount > 0 ? `将同时删除该槽位的 ${courseCount} 节课，` : ""}
              不可恢复。
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteSlot((slot as ScheduleSlot).id);
                  onClose();
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {!isNew && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                删除
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={onSave} disabled={busy}>
              保存
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
