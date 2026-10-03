import { create } from "zustand";
import {
  getDb,
  metaGet,
  metaSet,
  type ScheduleCourse,
  type ScheduleSlot,
  type Semester,
} from "../lib/db";
import { nowIso } from "../lib/format";

interface ScheduleState {
  loaded: boolean;
  semesters: Semester[];
  activeId: number | null;
  slots: ScheduleSlot[]; // 当前学期，按开始时间升序
  courses: ScheduleCourse[]; // 当前学期
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setActive: (id: number) => Promise<void>;
  addSemester: (name: string) => Promise<void>;
  renameSemester: (id: number, name: string) => Promise<void>;
  deleteSemester: (id: number) => Promise<void>;
  addSlot: (label: string, start: string, end: string) => Promise<void>;
  updateSlot: (id: number, label: string, start: string, end: string) => Promise<void>;
  deleteSlot: (id: number) => Promise<void>;
  setCourse: (slotId: number, weekday: number, name: string, color: string) => Promise<void>;
  clearCourse: (id: number) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  loaded: false,
  semesters: [],
  activeId: null,
  slots: [],
  courses: [],

  init: async () => {
    await get().refresh();
    set({ loaded: true });
  },

  refresh: async () => {
    const db = getDb();
    const semesters = await db.select<Semester[]>(
      "SELECT * FROM semesters ORDER BY id"
    );
    // active 学期：app_meta 记录，失效时回退到第一个
    let activeId = Number(await metaGet("active_semester_id")) || null;
    if (!semesters.some((s) => s.id === activeId)) {
      activeId = semesters[0]?.id ?? null;
    }
    let slots: ScheduleSlot[] = [];
    let courses: ScheduleCourse[] = [];
    if (activeId !== null) {
      [slots, courses] = await Promise.all([
        db.select<ScheduleSlot[]>(
          "SELECT * FROM schedule_slots WHERE semester_id=$1 ORDER BY start_time, id",
          [activeId]
        ),
        db.select<ScheduleCourse[]>(
          "SELECT * FROM schedule_courses WHERE semester_id=$1",
          [activeId]
        ),
      ]);
    }
    set({ semesters, activeId, slots, courses });
  },

  setActive: async (id) => {
    await metaSet("active_semester_id", String(id));
    await get().refresh();
  },

  addSemester: async (name) => {
    const db = getDb();
    const r = await db.execute(
      "INSERT INTO semesters (name, created_at) VALUES ($1,$2)",
      [name, nowIso()]
    );
    // 第一个学期或显式新建后切过去，符合直觉
    await metaSet("active_semester_id", String(r.lastInsertId));
    await get().refresh();
  },

  renameSemester: async (id, name) => {
    await getDb().execute("UPDATE semesters SET name=$1 WHERE id=$2", [name, id]);
    await get().refresh();
  },

  deleteSemester: async (id) => {
    const db = getDb();
    // tauri-plugin-sql 无 JS 事务 API，按子表→父表顺序删
    await db.execute("DELETE FROM schedule_courses WHERE semester_id=$1", [id]);
    await db.execute("DELETE FROM schedule_slots WHERE semester_id=$1", [id]);
    await db.execute("DELETE FROM semesters WHERE id=$1", [id]);
    await get().refresh(); // refresh 内会处理 active 失效回退
    await metaSet("active_semester_id", String(get().activeId ?? ""));
  },

  addSlot: async (label, start, end) => {
    const { activeId, slots } = get();
    if (activeId === null) return;
    assertNoSlotConflict(slots, start, end);
    const db = getDb();
    const sort = (slots[slots.length - 1]?.sort ?? 0) + 1;
    await db.execute(
      "INSERT INTO schedule_slots (semester_id, label, start_time, end_time, sort) VALUES ($1,$2,$3,$4,$5)",
      [activeId, label, start, end, sort]
    );
    await resortSlots(activeId);
    await get().refresh();
  },

  updateSlot: async (id, label, start, end) => {
    const { activeId, slots } = get();
    assertNoSlotConflict(slots, start, end, id);
    await getDb().execute(
      "UPDATE schedule_slots SET label=$1, start_time=$2, end_time=$3 WHERE id=$4",
      [label, start, end, id]
    );
    if (activeId !== null) await resortSlots(activeId);
    await get().refresh();
  },

  deleteSlot: async (id) => {
    const db = getDb();
    await db.execute("DELETE FROM schedule_courses WHERE slot_id=$1", [id]);
    await db.execute("DELETE FROM schedule_slots WHERE id=$1", [id]);
    await get().refresh();
  },

  setCourse: async (slotId, weekday, name, color) => {
    const { activeId } = get();
    if (activeId === null) return;
    await getDb().execute(
      "INSERT INTO schedule_courses (semester_id, slot_id, weekday, name, color) VALUES ($1,$2,$3,$4,$5) " +
        "ON CONFLICT(slot_id, weekday) DO UPDATE SET name=$4, color=$5",
      [activeId, slotId, weekday, name, color]
    );
    await get().refresh();
  },

  clearCourse: async (id) => {
    await getDb().execute("DELETE FROM schedule_courses WHERE id=$1", [id]);
    await get().refresh();
  },
}));

/** 当前时间落入哪个槽位：HH:MM 字符串比较即可（格式统一零填充） */
export function slotAtTime(slots: ScheduleSlot[], hhmm: string): ScheduleSlot | null {
  for (const s of slots) {
    if (s.start_time <= hhmm && hhmm < s.end_time) return s;
  }
  return null;
}

/** 槽位时间段冲突校验：半开区间 [start,end) 与任一已有槽位重叠即冲突，首尾相接允许 */
function assertNoSlotConflict(
  slots: ScheduleSlot[],
  start: string,
  end: string,
  excludeId?: number
): void {
  const c = slots.find(
    (s) => s.id !== excludeId && start < s.end_time && s.start_time < end
  );
  if (c) {
    throw new Error(`与「${c.label} ${c.start_time}-${c.end_time}」时间冲突`);
  }
}

/** 按开始时间重排 sort，维持「sort = 时间顺序」不变量（备份仍按 sort 恢复） */
async function resortSlots(semesterId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM schedule_slots WHERE semester_id=$1 ORDER BY start_time, id",
    [semesterId]
  );
  for (let i = 0; i < rows.length; i++) {
    await db.execute("UPDATE schedule_slots SET sort=$1 WHERE id=$2", [i, rows[i].id]);
  }
}

/** 今天对应的 weekday 列号（1=周一 … 7=周日） */
export function todayWeekday(d = new Date()): number {
  return ((d.getDay() + 6) % 7) + 1;
}
