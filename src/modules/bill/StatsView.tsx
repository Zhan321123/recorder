import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useBillStore } from "../../stores/bill";
import { getDb } from "../../lib/db";
import { fenToYuan, monthKey, dateStr } from "../../lib/format";
import { MonthSwitcher } from "./RecordList";

const PALETTE = d3.schemeTableau10;

interface MonthTotal {
  m: string;
  income: number;
  expense: number;
}

export default function StatsView() {
  const { month, records, categories } = useBillStore();
  const setMonth = useBillStore((s) => s.setMonth);

  // 本月支出按分类汇总（直接用 store 当月数据）
  const catData = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of records) {
      if (r.type !== "expense") continue;
      map.set(r.category_id, (map.get(r.category_id) ?? 0) + r.amount_cents);
    }
    return [...map.entries()]
      .map(([id, value]) => ({
        name: categories.find((c) => c.id === id)?.name ?? "未知",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [records, categories]);

  // 近 6 个月收支（跨月，直接查库）
  const [monthTotals, setMonthTotals] = useState<MonthTotal[]>([]);
  // 近 30 天支出
  const [daily, setDaily] = useState<{ date: string; total: number }[]>([]);

  useEffect(() => {
    (async () => {
      const db = getDb();
      const [y, mo] = month.split("-").map(Number);
      const from = monthKey(new Date(y, mo - 6, 1)) + "-01";
      const rows = await db.select<{ m: string; type: string; total: number }[]>(
        "SELECT substr(date,1,7) AS m, type, SUM(amount_cents) AS total FROM bill_records WHERE date >= $1 GROUP BY m, type",
        [from]
      );
      const arr: MonthTotal[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = monthKey(new Date(y, mo - 1 - i, 1));
        const inc = rows.find((r) => r.m === m && r.type === "income")?.total ?? 0;
        const exp = rows.find((r) => r.m === m && r.type === "expense")?.total ?? 0;
        arr.push({ m, income: inc, expense: exp });
      }
      setMonthTotals(arr);

      const fromDay = dateStr(new Date(Date.now() - 29 * 86400000));
      const drows = await db.select<{ date: string; total: number }[]>(
        "SELECT date, SUM(amount_cents) AS total FROM bill_records WHERE type='expense' AND date >= $1 GROUP BY date",
        [fromDay]
      );
      const dmap = new Map(drows.map((r) => [r.date, r.total]));
      const darr: { date: string; total: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const ds = dateStr(new Date(Date.now() - i * 86400000));
        darr.push({ date: ds, total: dmap.get(ds) ?? 0 });
      }
      setDaily(darr);
    })();
  }, [month]);

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <MonthSwitcher month={month} onChange={setMonth} />

      <section>
        <h3 className="mb-2 text-sm font-medium">本月支出分类</h3>
        {catData.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">本月暂无支出</p>
        ) : (
          <>
            <DonutChart data={catData} />
            <div className="mt-2 flex flex-col gap-1">
              {catData.map((c, i) => {
                const total = catData.reduce((s, x) => s + x.value, 0);
                return (
                  <div key={c.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-3 shrink-0 rounded-sm"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-muted-foreground">
                      {((c.value / total) * 100).toFixed(0)}%
                    </span>
                    <span className="w-20 text-right font-medium">
                      ¥{fenToYuan(c.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">近 6 个月收支</h3>
        <GroupedBars data={monthTotals} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">近 30 天支出趋势</h3>
        <TrendLine data={daily} />
      </section>
    </div>
  );
}

function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const size = 180;
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
      .style("font-size", "12px")
      .text("总支出");
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .style("font-size", "14px")
      .style("font-weight", "600")
      .text(`¥${fenToYuan(total)}`);
  }, [data]);
  return (
    <div className="flex justify-center">
      <svg ref={ref} className="h-44 w-44" />
    </div>
  );
}

function GroupedBars({ data }: { data: MonthTotal[] }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const W = 340;
    const H = 180;
    const pad = { t: 16, b: 22, l: 8, r: 8 };
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const x0 = d3
      .scaleBand()
      .domain(data.map((d) => d.m))
      .range([pad.l, W - pad.r])
      .paddingInner(0.3);
    const x1 = d3
      .scaleBand()
      .domain(["income", "expense"])
      .range([0, x0.bandwidth()])
      .padding(0.12);
    const maxV = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const y = d3.scaleLinear().domain([0, maxV]).nice().range([H - pad.b, pad.t]);

    // 横网格线
    svg
      .selectAll(".grid")
      .data(y.ticks(3))
      .join("line")
      .attr("x1", pad.l)
      .attr("x2", W - pad.r)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "currentColor")
      .attr("opacity", 0.1);

    const groups = svg
      .selectAll(".grp")
      .data(data)
      .join("g")
      .attr("transform", (d) => `translate(${x0(d.m)},0)`);

    for (const [key, color] of [
      ["income", "#059669"],
      ["expense", "#ef4444"],
    ] as const) {
      groups
        .append("rect")
        .attr("x", x1(key) ?? 0)
        .attr("width", x1.bandwidth())
        .attr("y", (d) => y(d[key]))
        .attr("height", (d) => Math.max(0, H - pad.b - y(d[key])))
        .attr("rx", 2)
        .attr("fill", color);
    }

    groups
      .append("text")
      .attr("x", x0.bandwidth() / 2)
      .attr("y", H - 6)
      .attr("text-anchor", "middle")
      .attr("class", "fill-muted-foreground")
      .style("font-size", "11px")
      .text((d) => `${Number(d.m.split("-")[1])}月`);
  }, [data]);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg ref={ref} className="w-full max-w-md" />
      <div className="flex gap-4 text-xs text-muted-foreground">
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

function TrendLine({ data }: { data: { date: string; total: number }[] }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const W = 340;
    const H = 140;
    const pad = { t: 12, b: 20, l: 8, r: 8 };
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const x = d3
      .scalePoint()
      .domain(data.map((d) => d.date))
      .range([pad.l, W - pad.r]);
    const maxV = Math.max(1, ...data.map((d) => d.total));
    const y = d3.scaleLinear().domain([0, maxV]).nice().range([H - pad.b, pad.t]);

    svg
      .selectAll(".grid")
      .data(y.ticks(3))
      .join("line")
      .attr("x1", pad.l)
      .attr("x2", W - pad.r)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "currentColor")
      .attr("opacity", 0.1);

    const area = d3
      .area<{ date: string; total: number }>()
      .x((d) => x(d.date) ?? 0)
      .y0(H - pad.b)
      .y1((d) => y(d.total))
      .curve(d3.curveMonotoneX);
    const line = d3
      .line<{ date: string; total: number }>()
      .x((d) => x(d.date) ?? 0)
      .y((d) => y(d.total))
      .curve(d3.curveMonotoneX);

    svg.append("path").datum(data).attr("d", area).attr("fill", "#ef444422");
    svg
      .append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2);

    // 首末日期标签
    svg
      .append("text")
      .attr("x", pad.l)
      .attr("y", H - 5)
      .attr("class", "fill-muted-foreground")
      .style("font-size", "10px")
      .text(data[0].date.slice(5));
    svg
      .append("text")
      .attr("x", W - pad.r)
      .attr("y", H - 5)
      .attr("text-anchor", "end")
      .attr("class", "fill-muted-foreground")
      .style("font-size", "10px")
      .text(data[data.length - 1].date.slice(5));
  }, [data]);
  return (
    <div className="flex justify-center">
      <svg ref={ref} className="w-full max-w-md" />
    </div>
  );
}
