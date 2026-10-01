import { create } from "zustand";
import {
  getDb,
  type CustomFestival,
  type PayType,
  type WorkDay,
  type WorkSetting,
} from "../lib/db";
import { monthKey, nowIso, todayStr } from "../lib/format";

/** 某日生效的工资设置：effective_from <= date 的最后一行；无则取最早一行 */
export function settingForDate(settings: WorkSetting[], date: string): WorkSetting | null {
  if (settings.length === 0) return null;
  let best: WorkSetting | null = null;
  for (const s of settings) {
    if (s.effective_from <= date && (!best || s.effective_from > best.effective_from)) {
      best = s;
    }
  }
  return best ?? settings[0];
}

export interface MonthStats {
  workDays: number;
  totalHours: number;
  incomeCents: number;
}

/** 月度统计：出勤/工时看标记；收入逐日按当日生效设置计算（月薪按当月天数折算） */
export function calcMonthStats(
  month: string, // "YYYY-MM"
  days: Record<string, WorkDay>,
  settings: WorkSetting[]
): MonthStats {
  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  let workDays = 0;
  let totalHours = 0;
  let incomeCents = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${month}-${String(d).padStart(2, "0")}`;
    const s = settingForDate(settings, ds);
    const marked = days[ds];
    if (marked) {
      workDays++;
      totalHours += marked.hours;
    }
    if (!s) continue;
    if (s.pay_type === "monthly") {
      incomeCents += s.rate_cents / daysInMonth;
    } else if (marked) {
      incomeCents += s.pay_type === "hourly" ? marked.hours * s.rate_cents : s.rate_cents;
    }
  }
  return { workDays, totalHours, incomeCents: Math.round(incomeCents) };
}

export interface WorkStats {
  month: MonthStats;
  year: MonthStats;
  total: MonthStats;
}

/**
 * 三段统计，口径统一跟随「查看月份」：
 * 本月 = 查看月；本年 = 查看月所在年 1–12 月（未来月份按预估计入）；
 * 全部 = 从最早有设置/记录的月份累计到查看月。
 */
export function calcStats(
  month: string,
  allDays: Record<string, WorkDay>,
  settings: WorkSetting[]
): WorkStats {
  const sum = (months: string[]): MonthStats => {
    const r = { workDays: 0, totalHours: 0, incomeCents: 0 };
    for (const m of months) {
      const s = calcMonthStats(m, allDays, settings);
      r.workDays += s.workDays;
      r.totalHours += s.totalHours;
      r.incomeCents += s.incomeCents;
    }
    return r;
  };

  const year = month.slice(0, 4);
  const yearMonths = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
  );

  // 全部：最早月份 = min(最早设置生效月, 最早记录月, 查看月)
  let earliest = month;
  for (const s of settings) {
    const m = s.effective_from.slice(0, 7);
    if (m < earliest) earliest = m;
  }
  for (const d of Object.keys(allDays)) {
    const m = d.slice(0, 7);
    if (m < earliest) earliest = m;
  }
  const allMonths: string[] = [];
  {
    const [ey, em] = earliest.split("-").map(Number);
    let cur = new Date(ey, em - 1, 1);
    while (monthKey(cur) <= month) {
      allMonths.push(monthKey(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  return {
    month: calcMonthStats(month, allDays, settings),
    year: sum(yearMonths),
    total: sum(allMonths),
  };
}

interface WorkState {
  loaded: boolean;
  month: string;
  days: Record<string, WorkDay>; // 当月标记（从 allDays 按月过滤）
  allDays: Record<string, WorkDay>; // 全部标记（统计用；本地数据量小）
  settings: WorkSetting[]; // 全部历史，按 effective_from 升序
  festivals: CustomFestival[];
  init: () => Promise<void>;
  setMonth: (month: string) => Promise<void>;
  refresh: () => Promise<void>;
  toggleDay: (date: string) => Promise<void>;
  upsertDay: (date: string, hours: number, note: string) => Promise<void>;
  removeDay: (date: string) => Promise<void>;
  saveSettings: (input: {
    daily_hours: number;
    pay_type: PayType;
    rate_cents: number;
  }) => Promise<void>;
  addFestival: (input: {
    name: string;
    cal_type: "lunar" | "solar";
    month: number;
    day: number;
  }) => Promise<void>;
  deleteFestival: (id: number) => Promise<void>;
}

export const useWorkStore = create<WorkState>((set, get) => ({
  loaded: false,
  month: monthKey(new Date()),
  days: {},
  allDays: {},
  settings: [],
  festivals: [],

  init: async () => {
    await get().refresh();
    set({ loaded: true });
  },

  setMonth: async (month) => {
    set({ month });
    await get().refresh();
  },

  refresh: async () => {
    const db = getDb();
    const { month } = get();
    const [rows, settings, festivals] = await Promise.all([
      db.select<WorkDay[]>("SELECT * FROM work_days"),
      db.select<WorkSetting[]>(
        "SELECT * FROM work_settings ORDER BY effective_from, id"
      ),
      db.select<CustomFestival[]>("SELECT * FROM custom_festivals ORDER BY id"),
    ]);
    const allDays: Record<string, WorkDay> = {};
    const days: Record<string, WorkDay> = {};
    for (const r of rows) {
      allDays[r.date] = r;
      if (r.date.startsWith(month)) days[r.date] = r;
    }
    set({ days, allDays, settings, festivals });
  },

  toggleDay: async (date) => {
    const { days, settings } = get();
    const db = getDb();
    if (days[date]) {
      await db.execute("DELETE FROM work_days WHERE date=$1", [date]);
    } else {
      // 按当日生效的设置快照工时，之后改设置不影响这天
      const hours = settingForDate(settings, date)?.daily_hours ?? 8;
      const now = nowIso();
      await db.execute(
        "INSERT INTO work_days (date, hours, note, created_at, updated_at) VALUES ($1,$2,'',$3,$3)",
        [date, hours, now]
      );
    }
    await get().refresh();
  },

  upsertDay: async (date, hours, note) => {
    const now = nowIso();
    await getDb().execute(
      "INSERT INTO work_days (date, hours, note, created_at, updated_at) VALUES ($1,$2,$3,$4,$4) " +
        "ON CONFLICT(date) DO UPDATE SET hours=$2, note=$3, updated_at=$4",
      [date, hours, note, now]
    );
    await get().refresh();
  },

  removeDay: async (date) => {
    await getDb().execute("DELETE FROM work_days WHERE date=$1", [date]);
    await get().refresh();
  },

  saveSettings: async (input) => {
    const db = getDb();
    const today = todayStr();
    const { settings } = get();
    const last = settings[settings.length - 1];
    if (last && last.effective_from === today) {
      // 同一天反复修改：更新当天行，不产生历史碎片
      await db.execute(
        "UPDATE work_settings SET daily_hours=$1, pay_type=$2, rate_cents=$3 WHERE id=$4",
        [input.daily_hours, input.pay_type, input.rate_cents, last.id]
      );
    } else {
      await db.execute(
        "INSERT INTO work_settings (effective_from, daily_hours, pay_type, rate_cents, created_at) VALUES ($1,$2,$3,$4,$5)",
        [today, input.daily_hours, input.pay_type, input.rate_cents, nowIso()]
      );
    }
    await get().refresh();
  },

  addFestival: async (input) => {
    await getDb().execute(
      "INSERT INTO custom_festivals (name, cal_type, month, day) VALUES ($1,$2,$3,$4)",
      [input.name, input.cal_type, input.month, input.day]
    );
    await get().refresh();
  },

  deleteFestival: async (id) => {
    await getDb().execute("DELETE FROM custom_festivals WHERE id=$1", [id]);
    await get().refresh();
  },
}));
