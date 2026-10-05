import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useScheduleStore, slotAtTime, todayWeekday } from "../../stores/schedule";
import { cn } from "../../lib/utils";
import type { ScheduleCourse, ScheduleSlot } from "../../lib/db";
import CourseCellDialog, { COURSE_COLORS } from "./CourseCellDialog";
import SlotEditDialog from "./SlotEditDialog";

const WEEK_HEADER = ["一", "二", "三", "四", "五", "六", "日"];

export interface CellTarget {
  slot: ScheduleSlot;
  weekday: number; // 1-7
  course?: ScheduleCourse;
}

function nowHhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function WeekGrid() {
  const slots = useScheduleStore((s) => s.slots);
  const courses = useScheduleStore((s) => s.courses);
  const [target, setTarget] = useState<CellTarget | null>(null);
  const [editingSlot, setEditingSlot] = useState<ScheduleSlot | "new" | null>(null);
  const [now, setNow] = useState(nowHhmm());

  // 当前时间高亮：每分钟刷新
  useEffect(() => {
    const t = setInterval(() => setNow(nowHhmm()), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayWd = todayWeekday();
  const currentSlot = useMemo(() => slotAtTime(slots, now), [slots, now]);

  const courseMap = useMemo(() => {
    const m = new Map<string, ScheduleCourse>();
    for (const c of courses) m.set(`${c.slot_id}-${c.weekday}`, c);
    return m;
  }, [courses]);

  // 一屏放下七天：7 列 minmax(0,1fr) 均分，不限制最小宽度
  const gridCols = "grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1";

  return (
    <div className="px-2 pt-2 pb-6">
      {/* 表头：左上角 + 添加时间槽；周一~周日，今天列高亮 */}
      <div className={gridCols}>
        <button
          onClick={() => setEditingSlot("new")}
          aria-label="添加时间槽"
          className="flex cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        {WEEK_HEADER.map((w, i) => (
          <div
            key={w}
            className={cn(
              "rounded-md py-1 text-center text-xs",
              i + 1 === todayWd
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            周{w}
          </div>
        ))}
      </div>

      {slots.length === 0 ? (
        <p className="mt-6 px-6 text-center text-sm text-muted-foreground">
          还没有时间槽。点左上角 + 把一天划分为若干时间段，
          <br />
          例如「6:00-7:00 早读」「7:00-7:30 早餐」…
        </p>
      ) : (
        slots.map((slot) => (
          <div key={slot.id} className={cn("mt-1", gridCols)}>
            <button
              onClick={() => setEditingSlot(slot)}
              className="flex cursor-pointer flex-col justify-center rounded-md bg-secondary/60 px-1.5 py-1 text-left hover:bg-secondary"
            >
              <span className="break-words text-xs font-medium">{slot.label}</span>
              <span className="text-[10px] leading-3.5 text-muted-foreground">
                {slot.start_time}-{slot.end_time}
              </span>
            </button>
            {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
              const course = courseMap.get(`${slot.id}-${wd}`);
              const isNow = wd === todayWd && currentSlot?.id === slot.id;
              return (
                <button
                  key={wd}
                  onClick={() => setTarget({ slot, weekday: wd, course })}
                  className={cn(
                    "min-h-10 min-w-0 cursor-pointer rounded-md border px-1 py-0.5 text-center transition-colors",
                    course ? "border-transparent" : "border-dashed bg-card hover:bg-accent/50",
                    isNow && "ring-2 ring-inset ring-primary"
                  )}
                  style={course?.color ? { backgroundColor: course.color } : undefined}
                >
                  {course && (
                    <span className="break-words text-xs leading-1 text-slate-800">
                      {course.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))
      )}
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        点空格排课，点已有课程可修改或清空，点左侧时间槽可调整或删除
        <span className="md:hidden">；屏幕较窄时建议横屏查看</span>
      </p>

      <CourseCellDialog target={target} onClose={() => setTarget(null)} />
      <SlotEditDialog slot={editingSlot} onClose={() => setEditingSlot(null)} />
    </div>
  );
}

export { COURSE_COLORS };
