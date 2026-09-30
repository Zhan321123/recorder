import { useEffect, useMemo, useState } from "react";
import { useScheduleStore, slotAtTime, todayWeekday } from "../../stores/schedule";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import type { ScheduleCourse, ScheduleSlot } from "../../lib/db";
import CourseCellDialog, { COURSE_COLORS } from "./CourseCellDialog";

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

export default function WeekGrid({ onEditSlots }: { onEditSlots: () => void }) {
  const slots = useScheduleStore((s) => s.slots);
  const courses = useScheduleStore((s) => s.courses);
  const [target, setTarget] = useState<CellTarget | null>(null);
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

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          还没有时间槽。先设置一天的时间划分，
          <br />
          例如「6:00-7:00 早读」「7:00-7:30 早餐」…
        </p>
        <Button onClick={onEditSlots}>去设置时间槽</Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-6">
      <div className="min-w-[680px] px-2 pt-2">
        {/* 表头：周一~周日，今天列高亮 */}
        <div className="grid grid-cols-[92px_repeat(7,1fr)] gap-1">
          <div />
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

        {slots.map((slot) => (
          <div key={slot.id} className="mt-1 grid grid-cols-[92px_repeat(7,1fr)] gap-1">
            <div className="flex flex-col justify-center rounded-md bg-secondary/60 px-1.5 py-1">
              <span className="truncate text-xs font-medium">{slot.label}</span>
              <span className="text-[10px] leading-3.5 text-muted-foreground">
                {slot.start_time}-{slot.end_time}
              </span>
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
              const course = courseMap.get(`${slot.id}-${wd}`);
              const isNow = wd === todayWd && currentSlot?.id === slot.id;
              return (
                <button
                  key={wd}
                  onClick={() => setTarget({ slot, weekday: wd, course })}
                  className={cn(
                    "min-h-14 cursor-pointer rounded-md border px-1 py-1 text-center transition-colors",
                    course ? "border-transparent" : "border-dashed bg-card hover:bg-accent/50",
                    isNow && "ring-2 ring-inset ring-primary"
                  )}
                  style={course?.color ? { backgroundColor: course.color } : undefined}
                >
                  {course && (
                    <span className="line-clamp-2 text-xs leading-4 text-slate-800">
                      {course.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          点空格排课，点已有课程可修改或清空
        </p>
      </div>

      <CourseCellDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

export { COURSE_COLORS };
