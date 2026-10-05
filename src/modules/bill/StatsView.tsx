import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useBillStore } from "../../stores/bill";
import { getDb } from "../../lib/db";
import { fenToYuan, monthKey } from "../../lib/format";
import { cn } from "../../lib/utils";
import { MonthSwitcher } from "./RecordList";

const PALETTE = d3.schemeTableau10;

// 环图样本范围：锚定当前选中月份
const DONUT_RANGES = [
  { key: "month", label: "本月" },
  { key: "3m", label: "近三月" },
  { key: "year", label: "本年" },
  { key: "all", label: "全部" },
] as const;
type DonutRange = (typeof DONUT_RANGES)[number]["key"];

interface CatTotal {
  category_id: number;
  type: string;
  total: number;
}

/** 柱状图一个周期（月/天）的收支 */
interface BarDatum {
  key: string;
  income: number;
  expense: number;
}

export default function StatsView() {
  const { month, records, categories } = useBillStore();
  const setMonth = useBillStore((s) => s.setMonth);

  // 环图：按样本范围直查库，支出/收入各一个
  const [range, setRange] = useState<DonutRange>("month");
  const [catRows, setCatRows] = useState<CatTotal[]>([]);

  // 柱状图：所有有收支的月份 / 天
  const [monthBars, setMonthBars] = useState<BarDatum[]>([]);
  const [dayBars, setDayBars] = useState<BarDatum[]>([]);

  const { expenseData, incomeData } = useMemo(() => {
    const toData = (type: string) =>
      catRows
        .filter((r) => r.type === type)
        .map((r) => ({
          name: categories.find((c) => c.id === r.category_id)?.name ?? "未知",
          value: r.total,
        }))
        .sort((a, b) => b.value - a.value);
    return { expenseData: toData("expense"), incomeData: toData("income") };
  }, [catRows, categories]);

  useEffect(() => {
    (async () => {
      const db = getDb();
      const [y, mo] = month.split("-").map(Number);

      // 环图：按范围生成日期条件
      let cond = "";
      const params: string[] = [];
      if (range === "month") {
        cond = "WHERE substr(date,1,7) = $1";
        params.push(month);
      } else if (range === "3m") {
        cond = "WHERE substr(date,1,7) BETWEEN $1 AND $2";
        params.push(monthKey(new Date(y, mo - 3, 1)), month);
      } else if (range === "year") {
        cond = "WHERE substr(date,1,4) = $1";
        params.push(String(y));
      }
      const crows = await db.select<CatTotal[]>(
        `SELECT category_id, type, SUM(amount_cents) AS total FROM bill_records ${cond} GROUP BY category_id, type`,
        params
      );
      setCatRows(crows);

      // 月份收支 / 按日收支：全量周期，滚动 + 缩放由 ZoomBars 处理
      const mrows = await db.select<{ m: string; type: string; total: number }[]>(
        "SELECT substr(date,1,7) AS m, type, SUM(amount_cents) AS total FROM bill_records GROUP BY m, type"
      );
      setMonthBars(groupPeriods(mrows.map((r) => ({ key: r.m, ...r }))));

      const drows = await db.select<{ d: string; type: string; total: number }[]>(
        "SELECT date AS d, type, SUM(amount_cents) AS total FROM bill_records GROUP BY date, type"
      );
      setDayBars(groupPeriods(drows.map((r) => ({ key: r.d, ...r }))));
    })();
  }, [month, range, records]);

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <MonthSwitcher month={month} onChange={setMonth} />

      <section>
        <h3 className="mb-2 text-sm font-medium">收支分类</h3>
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {DONUT_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-md py-1 text-xs transition-colors",
                range === r.key
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <DonutChart data={expenseData} label="支出" emptyText="暂无支出" />
          <DonutChart data={incomeData} label="收入" emptyText="暂无收入" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <DonutLegend data={expenseData} />
          <DonutLegend data={incomeData} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">月份收支</h3>
        <ZoomBars
          data={monthBars}
          minVisible={6}
          defaultVisible={6}
          labelOf={monthLabel}
          emptyText="暂无收支记录"
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">按日收支</h3>
        <ZoomBars
          data={dayBars}
          minVisible={7}
          defaultVisible={30}
          labelOf={dayLabel}
          emptyText="暂无收支记录"
        />
      </section>
    </div>
  );
}

// ---------- 柱状图（滚动 + 捏合缩放） ----------

// 图表几何常量：滚动层与固定纵轴层共用
const W = 340;
const H = 200;
const PAD = { t: 14, b: 20, l: 38, r: 6 };

/** 可横向滚动、可捏合缩放的分组柱状图。
 *  缩放：双指向中间靠拢 / Ctrl+滚轮上 = 可见周期变少（最小 minVisible），
 *  反向 = 变多（最大全部周期）；缩放时以焦点为锚，滚动位置不失忆。
 *  纵轴数值固定在左侧，不随横向滚动。 */
function ZoomBars({
  data,
  minVisible,
  defaultVisible,
  labelOf,
  emptyText,
}: {
  data: BarDatum[];
  minVisible: number;
  defaultVisible: number;
  labelOf: (key: string) => string;
  emptyText: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const total = data.length;
  const [visible, setVisible] = useState(defaultVisible);
  const visibleRef = useRef(visible);
  // 滚动位置比例（0 最左 / 1 最右），初始最右；数据刷新后按此恢复
  const fracRef = useRef(1);
  // 缩放手势的焦点锚点（内容坐标比例 + 容器内 x）
  const anchorRef = useRef<{ frac: number; x: number } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startVisible: number;
    cx: number;
  } | null>(null);
  visibleRef.current = visible;

  const totalW =
    total === 0 ? W : Math.max(W, Math.round((W * total) / Math.min(visible, Math.max(total, 1))));

  const clampVisible = (v: number) => {
    const hi = Math.max(total, 1);
    return Math.max(Math.min(minVisible, hi), Math.min(v, hi));
  };

  // 纵轴刻度（固定层与滚动层共用同一比例尺）
  const yTicks = useMemo(() => {
    if (total === 0) return [];
    const maxV = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const y = d3
      .scaleLinear()
      .domain([0, maxV])
      .nice()
      .range([H - PAD.b, PAD.t]);
    return y.ticks(4).map((v) => ({ v, y: y(v) }));
  }, [data, total]);

  // 手势监听：Ctrl+滚轮（含触摸板捏合）与双指捏合，需要 passive:false 才能 preventDefault
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const applyZoom = (next: number, clientX: number) => {
      const nv = clampVisible(next);
      if (nv === visibleRef.current) return;
      const x = clientX - el.getBoundingClientRect().left;
      anchorRef.current = {
        frac: (el.scrollLeft + x) / Math.max(1, el.scrollWidth),
        x,
      };
      setVisible(nv);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || total === 0) return;
      e.preventDefault();
      applyZoom(visibleRef.current * Math.exp(e.deltaY * 0.002), e.clientX);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2 || total === 0) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startVisible: visibleRef.current,
        cx: (a.clientX + b.clientX) / 2,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault(); // 双指时阻止页面滚动/缩放
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (d <= 0 || p.startDist <= 0) return;
      // 距离变小（靠拢）→ 可见周期变少
      applyZoom(p.startVisible * (d / p.startDist), p.cx);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, minVisible]);

  // 宽度变化（缩放/数据刷新）后恢复滚动位置：手势有焦点锚点用锚点，否则按比例（默认保持最右）
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (anchor) {
      el.scrollLeft = anchor.frac * el.scrollWidth - anchor.x;
      anchorRef.current = null;
    } else {
      el.scrollLeft =
        fracRef.current * Math.max(0, el.scrollWidth - el.clientWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalW]);

  // d3 绘制（滚动层：网格线 + 柱子 + 横轴标签；纵轴数值在固定层）
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (total === 0) return;
    svg.attr("viewBox", `0 0 ${totalW} ${H}`);
    const pad = PAD;

    const x0 = d3
      .scaleBand()
      .domain(data.map((d) => d.key))
      .range([pad.l, totalW - pad.r])
      .paddingInner(0.25);
    const x1 = d3
      .scaleBand()
      .domain(["income", "expense"])
      .range([0, x0.bandwidth()])
      .padding(0.15);
    const maxV = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const y = d3
      .scaleLinear()
      .domain([0, maxV])
      .nice()
      .range([H - pad.b, pad.t]);

    // 横网格线
    for (const t of y.ticks(4)) {
      svg
        .append("line")
        .attr("x1", pad.l)
        .attr("x2", totalW - pad.r)
        .attr("y1", y(t))
        .attr("y2", y(t))
        .attr("stroke", "currentColor")
        .attr("opacity", 0.1);
    }

    const groups = svg
      .selectAll(".grp")
      .data(data)
      .join("g")
      .attr("transform", (d) => `translate(${x0(d.key) ?? 0},0)`);
    for (const [key, color] of [
      ["income", "#059669"],
      ["expense", "#ef4444"],
    ] as const) {
      const rect = groups
        .append("rect")
        .attr("x", x1(key) ?? 0)
        .attr("width", Math.max(0.5, x1.bandwidth()))
        .attr("y", (d) => y(d[key]))
        .attr("height", (d) => Math.max(0, H - pad.b - y(d[key])))
        .attr("fill", color);
      if (x1.bandwidth() >= 4) rect.attr("rx", 2);
    }

    // 横轴标签：槽宽不够时抽稀
    const slot = (totalW - pad.l - pad.r) / total;
    const step = Math.max(1, Math.ceil(32 / slot));
    data.forEach((d, i) => {
      if (i % step !== 0) return;
      svg
        .append("text")
        .attr("x", (x0(d.key) ?? 0) + x0.bandwidth() / 2)
        .attr("y", H - 6)
        .attr("text-anchor", "middle")
        .attr("class", "fill-muted-foreground")
        .style("font-size", "10px")
        .text(labelOf(d.key));
    });
  }, [data, totalW, labelOf, total]);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (el) {
              fracRef.current =
                el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth);
            }
          }}
          className="overflow-x-auto"
        >
          <svg
            ref={svgRef}
            style={{ width: totalW, height: H, display: "block" }}
          />
        </div>
        {/* 固定纵轴：不随横向滚动，背景遮住滑过的柱子 */}
        <svg
          className="pointer-events-none absolute left-0 top-0 bg-background"
          style={{ width: PAD.l, height: H }}
        >
          {yTicks.map((t) => (
            <text
              key={t.v}
              x={PAD.l - 4}
              y={t.y}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {axisLabel(t.v)}
            </text>
          ))}
        </svg>
      </div>
      <div className="flex justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-emerald-600" /> 收入
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-red-500" /> 支出
        </span>
      </div>
    </div>
  );
}

function groupPeriods(
  rows: { key: string; type: string; total: number }[]
): BarDatum[] {
  const map = new Map<string, BarDatum>();
  for (const r of rows) {
    let d = map.get(r.key);
    if (!d) {
      d = { key: r.key, income: 0, expense: 0 };
      map.set(r.key, d);
    }
    if (r.type === "income") d.income = r.total;
    else d.expense = r.total;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** "2026-09" → "9月"，一月带上年份便于跨年定位 */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return m === "01" ? `${y.slice(2)}年1月` : `${Number(m)}月`;
}

/** "2026-09-30" → "09/30" */
function dayLabel(key: string): string {
  return key.slice(5).replace("-", "/");
}

/** 纵轴刻度：≥1 万用「万」缩写，否则取整 */
function axisLabel(cents: number): string {
  const yuan = cents / 100;
  if (yuan >= 10000) {
    const w = yuan / 10000;
    return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, "")}万`;
  }
  return Math.round(yuan).toLocaleString("zh-CN");
}

// ---------- 环图 ----------

function DonutChart({
  data,
  label,
  emptyText,
}: {
  data: { name: string; value: number }[];
  label: string;
  emptyText: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const size = 150;
    const radius = size / 2;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${size} ${size}`);
    const g = svg
      .append("g")
      .attr("transform", `translate(${radius},${radius})`);
    const pie = d3
      .pie<{ name: string; value: number }>()
      .value((d) => d.value)
      .sort(null);
    const arc = d3
      .arc<d3.PieArcDatum<{ name: string; value: number }>>()
      .innerRadius(radius * 0.58)
      .outerRadius(radius - 4)
      .cornerRadius(3)
      .padAngle(0.02);
    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => PALETTE[i % PALETTE.length]);
    const total = data.reduce((s, d) => s + d.value, 0);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.1em")
      .attr("class", "fill-muted-foreground")
      .style("font-size", "11px")
      .text(`总${label}`);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .style("font-size", "13px")
      .style("font-weight", "600")
      .text(compactYuan(total));
  }, [data, label]);
  if (data.length === 0) {
    return (
      <div className="flex flex-1 justify-center">
        <div className="flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-muted text-xs text-muted-foreground">
          {emptyText}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 justify-center">
      <svg ref={ref} className="h-36 w-36" />
    </div>
  );
}

function DonutLegend({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <div />;
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {data.map((c, i) => (
        <div key={c.name} className="flex items-center gap-1.5 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: PALETTE[i % PALETTE.length] }}
          />
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          <span className="shrink-0 text-muted-foreground">
            {((c.value / total) * 100).toFixed(0)}%
          </span>
          <span className="shrink-0 font-medium">¥{fenToYuan(c.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** 环心金额：超过 10 万用「万」缩写，避免超出环心 */
function compactYuan(cents: number): string {
  if (Math.abs(cents) >= 10_000_000) {
    return `¥${(cents / 1_000_000).toFixed(1)}万`;
  }
  return `¥${fenToYuan(cents)}`;
}
