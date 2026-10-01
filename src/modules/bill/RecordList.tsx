import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRightLeft } from "lucide-react";
import { useBillStore } from "../../stores/bill";
import { fenToYuan, monthKey } from "../../lib/format";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import type { BillRecord, Transfer } from "../../lib/db";
import type { EditingTarget } from "./RecordEditorDialog";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  return monthKey(new Date(y, mo - 1 + delta, 1));
}

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const [y, mo] = month.split("-").map(Number);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(y);

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="cursor-pointer rounded-md p-1.5 hover:bg-accent"
        aria-label="上个月"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        onClick={() => {
          setPickerYear(y);
          setPickerOpen(true);
        }}
        className="min-w-28 cursor-pointer rounded-md px-2 py-1 text-center text-sm font-medium hover:bg-accent"
      >
        {y}年{mo}月
      </button>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="cursor-pointer rounded-md p-1.5 hover:bg-accent"
        aria-label="下个月"
      >
        <ChevronRight className="size-5" />
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>选择月份</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPickerYear(pickerYear - 1)}
              className="cursor-pointer rounded-md p-1.5 hover:bg-accent"
              aria-label="上一年"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="text-sm font-medium">{pickerYear}年</span>
            <button
              onClick={() => setPickerYear(pickerYear + 1)}
              className="cursor-pointer rounded-md p-1.5 hover:bg-accent"
              aria-label="下一年"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const key = `${pickerYear}-${String(m).padStart(2, "0")}`;
              return (
                <button
                  key={m}
                  onClick={() => {
                    onChange(key);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer rounded-md py-2 text-sm hover:bg-accent",
                    key === month && "bg-primary text-primary-foreground hover:bg-primary"
                  )}
                >
                  {m}月
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 左右滑动切月份：横向位移足够且明显大于纵向时触发，不影响上下滚动 */
export function useMonthSwipe(
  month: string,
  onChange: (m: string) => void
): {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
} {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onChange(shiftMonth(month, dx < 0 ? 1 : -1));
      }
    },
  };
}

interface DayGroup {
  date: string;
  items: ({ kind: "record"; r: BillRecord } | { kind: "transfer"; t: Transfer })[];
  expense: number;
  income: number;
}

export default function RecordList({
  onEdit,
}: {
  onEdit: (t: EditingTarget) => void;
}) {
  const { month, records, transfers, accounts, categories } = useBillStore();
  const setMonth = useBillStore((s) => s.setMonth);
  const swipe = useMonthSwipe(month, setMonth);

  const accountName = (id: number) =>
    accounts.find((a) => a.id === id)?.name ?? "?";
  const categoryOf = (id: number) => categories.find((c) => c.id === id);

  const monthExpense = records
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + r.amount_cents, 0);
  const monthIncome = records
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + r.amount_cents, 0);

  // 按日分组（流水与转账合并，组内保持各自倒序）
  const groups: DayGroup[] = [];
  const byDate = new Map<string, DayGroup>();
  for (const r of records) {
    let g = byDate.get(r.date);
    if (!g) {
      g = { date: r.date, items: [], expense: 0, income: 0 };
      byDate.set(r.date, g);
      groups.push(g);
    }
    g.items.push({ kind: "record", r });
    if (r.type === "expense") g.expense += r.amount_cents;
    else g.income += r.amount_cents;
  }
  for (const t of transfers) {
    const g = byDate.get(t.date);
    if (g) g.items.push({ kind: "transfer", t });
    else {
      const ng: DayGroup = { date: t.date, items: [{ kind: "transfer", t }], expense: 0, income: 0 };
      byDate.set(t.date, ng);
      groups.push(ng);
    }
  }
  groups.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="pb-24" {...swipe}>
      <MonthSwitcher month={month} onChange={setMonth} />

      <div className="mx-4 mb-2 flex justify-between rounded-lg border bg-card px-4 py-3 text-sm">
        <span>
          支出 <span className="font-semibold text-red-500">¥{fenToYuan(monthExpense)}</span>
        </span>
        <span>
          收入 <span className="font-semibold text-emerald-600">¥{fenToYuan(monthIncome)}</span>
        </span>
        <span>
          结余{" "}
          <span className="font-semibold">
            ¥{fenToYuan(monthIncome - monthExpense)}
          </span>
        </span>
      </div>

      {groups.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          本月还没有记录，点右下角 + 记一笔
        </p>
      )}

      {groups.map((g) => {
        const d = new Date(g.date + "T00:00:00");
        return (
          <div key={g.date} className="mb-2">
            <div className="flex justify-between px-4 py-1.5 text-xs text-muted-foreground">
              <span>
                {d.getMonth() + 1}月{d.getDate()}日 星期{WEEKDAYS[d.getDay()]}
              </span>
              <span>
                {g.expense > 0 && `支 ¥${fenToYuan(g.expense)}`}
                {g.expense > 0 && g.income > 0 && " · "}
                {g.income > 0 && `收 ¥${fenToYuan(g.income)}`}
              </span>
            </div>
            <div className="mx-4 overflow-hidden rounded-lg border bg-card">
              {g.items.map((item, i) => {
                if (item.kind === "record") {
                  const r = item.r;
                  const cat = categoryOf(r.category_id);
                  return (
                    <button
                      key={`r${r.id}`}
                      onClick={() => onEdit({ kind: "record", record: r })}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50",
                        i > 0 && "border-t"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                          r.type === "expense"
                            ? "bg-red-100 text-red-600"
                            : "bg-emerald-100 text-emerald-600"
                        )}
                      >
                        {cat?.name.slice(0, 1) ?? "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {cat?.name ?? "未知分类"}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {accountName(r.account_id)}
                          </span>
                        </span>
                        {r.note && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.note}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold",
                          r.type === "expense" ? "text-red-500" : "text-emerald-600"
                        )}
                      >
                        {r.type === "expense" ? "-" : "+"}¥{fenToYuan(r.amount_cents)}
                      </span>
                    </button>
                  );
                }
                const t = item.t;
                return (
                  <button
                    key={`t${t.id}`}
                    onClick={() => onEdit({ kind: "transfer", transfer: t })}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50",
                      i > 0 && "border-t"
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <ArrowRightLeft className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        转账：{accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                      </span>
                      {t.note && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.note}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                      ¥{fenToYuan(t.amount_cents)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
