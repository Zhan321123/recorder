import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { settingForDate, useWorkStore } from "../../stores/work";
import { fenToYuan, todayStr } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { PayType } from "../../lib/db";

const PAY_TYPES: { key: PayType; label: string; unit: string }[] = [
  { key: "hourly", label: "时薪", unit: "元/小时" },
  { key: "daily", label: "日薪", unit: "元/天" },
  { key: "monthly", label: "月薪", unit: "元/月" },
];

export function payTypeLabel(t: PayType): string {
  return PAY_TYPES.find((p) => p.key === t)?.label ?? t;
}

export default function WorkSettingsPanel() {
  const { settings } = useWorkStore();
  const saveSettings = useWorkStore((s) => s.saveSettings);

  const current = settingForDate(settings, todayStr());

  const [hours, setHours] = useState("8");
  const [payType, setPayType] = useState<PayType>("daily");
  const [rate, setRate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (current) {
      setHours(String(current.daily_hours));
      setPayType(current.pay_type);
      setRate(fenToYuan(current.rate_cents).replace(/,/g, ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    setMessage("");
    const h = parseFloat(hours);
    const r = parseFloat(rate);
    if (!Number.isFinite(h) || h <= 0 || h > 24) return setMessage("日工时需为 0-24 之间的数字");
    if (!Number.isFinite(r) || r < 0) return setMessage("金额不正确");
    setBusy(true);
    try {
      await saveSettings({
        daily_hours: h,
        pay_type: payType,
        rate_cents: Math.round(r * 100),
      });
      setMessage("已保存，从今天起生效，历史记录不受影响");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <Card>
        <CardHeader>
          <CardTitle>工时与工资</CardTitle>
          <CardDescription>
            修改后从今天起生效；过去的工时和收入仍按当时设置计算
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>每天工时（小时）</Label>
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>计薪方式</Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
              {PAY_TYPES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPayType(p.key)}
                  className={cn(
                    "cursor-pointer rounded-md py-1.5 text-sm text-muted-foreground transition-colors",
                    payType === p.key && "bg-background font-medium text-foreground shadow-sm"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>金额（{PAY_TYPES.find((p) => p.key === payType)?.unit}）</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <Button onClick={onSave} disabled={busy}>
            保存设置
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>设置历史</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {settings.length === 0 && (
            <p className="text-muted-foreground">暂无记录</p>
          )}
          {[...settings].reverse().map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between border-b py-2 last:border-b-0"
            >
              <span className="text-muted-foreground">{s.effective_from} 起</span>
              <span>
                {s.daily_hours}h/天 · {payTypeLabel(s.pay_type)} ¥
                {fenToYuan(s.rate_cents)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <FestivalManager />
    </div>
  );
}

function FestivalManager() {
  const { festivals } = useWorkStore();
  const addFestival = useWorkStore((s) => s.addFestival);
  const deleteFestival = useWorkStore((s) => s.deleteFestival);

  const [name, setName] = useState("");
  const [calType, setCalType] = useState<"lunar" | "solar">("lunar");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");

  async function onAdd() {
    setError("");
    const n = name.trim();
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (!n) return setError("请输入名称");
    if (!Number.isInteger(m) || m < 1 || m > 12) return setError("月份需为 1-12");
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError("日期需为 1-31");
    await addFestival({ name: n, cal_type: calType, month: m, day: d });
    setName("");
    setMonth("");
    setDay("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>自定义节日</CardTitle>
        <CardDescription>
          如「母亲生日 农历五月初八」，会显示在日历对应格子上
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Input
            placeholder="节日名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
          />
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {(
            [
              ["lunar", "农历"],
              ["solar", "公历"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCalType(k)}
              className={cn(
                "cursor-pointer rounded-md py-1.5 text-sm text-muted-foreground transition-colors",
                calType === k && "bg-background font-medium text-foreground shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            placeholder="月"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">月</span>
          <Input
            inputMode="numeric"
            placeholder="日"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">日</span>
          <Button onClick={onAdd} className="shrink-0">
            添加
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {festivals.length > 0 && (
          <div className="flex flex-col">
            {festivals.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span>{f.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {f.cal_type === "lunar" ? "农历" : "公历"} {f.month}月{f.day}日
                  </span>
                  <button
                    className="cursor-pointer text-xs text-destructive"
                    onClick={() => deleteFestival(f.id)}
                  >
                    删除
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
