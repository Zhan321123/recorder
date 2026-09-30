import { useState } from "react";
import { HolidayUtil, Solar } from "lunar-javascript";
import { useWorkStore, calcMonthStats } from "../../stores/work";
import { MonthSwitcher } from "../bill/RecordList";
import { fenToYuan, todayStr } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { CustomFestival } from "../../lib/db";
import DayDetailDialog from "./DayDetailDialog";

const WEEK_HEADER = ["一", "二", "三", "四", "五", "六", "日"];

interface CellInfo {
  date: string; // YYYY-MM-DD
  day: number;
  /** 小字：自定义节日 > 公历/农历节日 > 节气 > 农历日 */
  sub: string;
  subClass: "festival" | "custom" | "normal";
  /** 法定班休 */
  workMark: "work" | "rest" | null;
}

function buildCell(y: number, mo: number, d: number, customs: CustomFestival[]): CellInfo {
  const solar = Solar.fromYmd(y, mo, d);
  const lunar = solar.getLunar();
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  let sub = "";
  let subClass: CellInfo["subClass"] = "normal";

  // 自定义节日（农历按农历月日匹配，闰月暂不支持；公历按月日）
  const custom = customs.find((f) =>
    f.cal_type === "lunar"
      ? f.month === lunar.getMonth() && f.day === lunar.getDay()
      : f.month === mo && f.day === d
  );
  const solarFes = solar.getFestivals();
  const lunarFes = lunar.getFestivals();
  const jieqi = lunar.getJieQi();

  if (custom) {
    sub = custom.name;
    subClass = "custom";
  } else if (solarFes.length > 0 || lunarFes.length > 0) {
    sub = [...solarFes, ...lunarFes][0];
    subClass = "festival";
  } else if (jieqi) {
    sub = jieqi;
  } else {
    // 初一显示月份名，其余显示农历日
    sub =
      lunar.getDay() === 1
        ? lunar.getMonthInChinese() + "月"
        : lunar.getDayInChinese();
  }

  const holiday = HolidayUtil.getHoliday(y, mo, d);
  return {
    date,
    day: d,
    sub,
    subClass,
    workMark: holiday ? (holiday.isWork() ? "work" : "rest") : null,
  };
}

export default function MonthCalendar() {
  const { month, days, settings, festivals } = useWorkStore();
  const setMonth = useWorkStore((s) => s.setMonth);
  const toggleDay = useWorkStore((s) => s.toggleDay);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  // 周一开头：1 号前面要空几格
  const firstWeekday = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const today = todayStr();

  const cells: (CellInfo | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => buildCell(y, mo, i + 1, festivals)),
  ];

  const stats = calcMonthStats(month, days, settings);

  function onTapCell(c: CellInfo) {
    if (days[c.date]) setDetailDate(c.date);
    else toggleDay(c.date);
  }

  return (
    <div className="flex flex-col pb-6">
      <MonthSwitcher month={month} onChange={setMonth} />

      <div className="grid grid-cols-7 px-2 text-center text-xs text-muted-foreground">
        {WEEK_HEADER.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2">
        {cells.map((c, i) =>
          c === null ? (
            <div key={`e${i}`} />
          ) : (
            <CalendarCell
              key={c.date}
              cell={c}
              worked={days[c.date]?.hours}
              isToday={c.date === today}
              onTap={() => onTapCell(c)}
            />
          )
        )}
      </div>

      <div className="mx-4 mt-3 flex justify-between rounded-lg border bg-card px-4 py-3 text-sm">
        <span>
          出勤 <span className="font-semibold">{stats.workDays}</span> 天
        </span>
        <span>
          工时 <span className="font-semibold">{stats.totalHours}</span> h
        </span>
        <span>
          预估收入{" "}
          <span className="font-semibold text-emerald-600">
            ¥{fenToYuan(stats.incomeCents)}
          </span>
        </span>
      </div>
      <p className="mt-1.5 px-4 text-xs text-muted-foreground">
        点日期标记上班，点已标记的格子可改工时/取消
      </p>

      <DayDetailDialog date={detailDate} onClose={() => setDetailDate(null)} />
    </div>
  );
}

function CalendarCell({
  cell,
  worked,
  isToday,
  onTap,
}: {
  cell: CellInfo;
  worked: number | undefined;
  isToday: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={cn(
        "relative flex min-h-16 cursor-pointer flex-col items-center justify-start rounded-md border px-0.5 py-1 transition-colors",
        worked !== undefined
          ? "border-emerald-300 bg-emerald-50"
          : "border-transparent bg-card hover:bg-accent/50",
        isToday && "ring-2 ring-primary"
      )}
    >
      {cell.workMark && (
        <span
          className={cn(
            "absolute right-0.5 top-0.5 rounded-sm px-0.5 text-[10px] leading-3.5",
            cell.workMark === "work"
              ? "bg-red-100 text-red-600"
              : "bg-emerald-100 text-emerald-600"
          )}
        >
          {cell.workMark === "work" ? "班" : "休"}
        </span>
      )}
      <span
        className={cn(
          "text-sm leading-5",
          isToday && "font-bold",
          worked !== undefined && "font-medium text-emerald-700"
        )}
      >
        {cell.day}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[10px] leading-3.5",
          cell.subClass === "festival" && "text-rose-500",
          cell.subClass === "custom" && "font-medium text-violet-600",
          cell.subClass === "normal" && "text-muted-foreground"
        )}
      >
        {cell.sub}
      </span>
      {worked !== undefined && (
        <span className="text-[10px] leading-3.5 font-medium text-emerald-600">
          ✓{worked}h
        </span>
      )}
    </button>
  );
}
