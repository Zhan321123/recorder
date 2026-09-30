// 金额与日期格式化工具。金额在 DB 中一律以「分」（整数）存储。

/** 分 → "1,234.56" */
export function fenToYuan(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 用户输入的元字符串 → 分；非法输入返回 null。允许 "12"、"12.3"、"12.34" */
export function yuanToFen(input: string): number | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免时区跨日） */
export function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** "2026-09" 形式的月份键 */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
