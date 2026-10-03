import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useScheduleStore } from "../../stores/schedule";
import { cn } from "../../lib/utils";
import type { CellTarget } from "./WeekGrid";

/** 课程色板（浅底+固定深色文字），空串=无色 */
export const COURSE_COLORS = [
  "",
  "#dbeafe",
  "#dcfce7",
  "#fef9c3",
  "#fee2e2",
  "#f3e8ff",
  "#ffedd5",
  "#cffafe",
  "#fce7f3",
];

const WEEK_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function CourseCellDialog({
  target,
  onClose,
}: {
  target: CellTarget | null;
  onClose: () => void;
}) {
  const setCourse = useScheduleStore((s) => s.setCourse);
  const clearCourse = useScheduleStore((s) => s.clearCourse);

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setName(target.course?.name ?? "");
      setColor(target.course?.color ?? "");
      setError("");
    }
  }, [target]);

  if (!target) return null;
  const { slot, weekday, course } = target;

  async function onSave() {
    const n = name.trim();
    if (!n) return setError("请输入课程名称");
    setBusy(true);
    try {
      await setCourse(slot.id, weekday, n, color);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!course) return;
    setBusy(true);
    try {
      await clearCourse(course.id);
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
          <DialogTitle>
            {WEEK_NAMES[weekday]} · {slot.label}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {slot.start_time}-{slot.end_time}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>课程名称</Label>
          <Input
            placeholder="如：语文早读"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>颜色</Label>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((c) => (
              <button
                key={c || "none"}
                onClick={() => setColor(c)}
                className={cn(
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-transform",
                  color === c && "scale-110"
                )}
                style={{
                  ...(c ? { backgroundColor: c } : {}),
                  // 老 WebView 不支持 @property，tailwind ring 的 box-shadow 变量链会整条失效；
                  // 用原生 outline + 对勾做选中态，任何版本都可见
                  ...(color === c
                    ? { outline: "2px solid var(--primary)", outlineOffset: "2px" }
                    : {}),
                }}
                aria-label={c || "无色"}
              >
                {color === c && c && <Check className="h-4 w-4 text-slate-700" />}
                {!c && (
                  <span
                    className={cn(
                      "text-xs",
                      color === c ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    无
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          {course && (
            <Button variant="destructive" onClick={onClear} disabled={busy}>
              清空
            </Button>
          )}
          <Button onClick={onSave} disabled={busy} className="flex-1">
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
