import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useBillStore } from "../../stores/bill";
import { fenToYuan, todayStr, yuanToFen } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { BillRecord, Transfer } from "../../lib/db";

export type EditingTarget =
  | { kind: "record"; record: BillRecord }
  | { kind: "transfer"; transfer: Transfer }
  | null;

type Mode = "expense" | "income" | "transfer";

export default function RecordEditorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: EditingTarget;
}) {
  const { accounts, categories } = useBillStore();
  const store = useBillStore.getState();

  const [mode, setMode] = useState<Mode>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeAccounts = accounts.filter((a) => !a.archived);

  // 打开时按编辑对象或默认值初始化表单
  useEffect(() => {
    if (!open) return;
    setError("");
    if (editing?.kind === "record") {
      const r = editing.record;
      setMode(r.type);
      setAmount(fenToYuan(r.amount_cents).replace(/,/g, ""));
      setCategoryId(r.category_id);
      setAccountId(r.account_id);
      setDate(r.date);
      setNote(r.note);
    } else if (editing?.kind === "transfer") {
      const t = editing.transfer;
      setMode("transfer");
      setAmount(fenToYuan(t.amount_cents).replace(/,/g, ""));
      setFromId(t.from_account_id);
      setToId(t.to_account_id);
      setDate(t.date);
      setNote(t.note);
    } else {
      setMode("expense");
      setAmount("");
      setCategoryId(null);
      setAccountId(activeAccounts[0]?.id ?? null);
      setFromId(activeAccounts[0]?.id ?? null);
      setToId(activeAccounts[1]?.id ?? null);
      setDate(todayStr());
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const visibleCategories = categories.filter((c) => c.type === mode);

  async function onSave() {
    setError("");
    const cents = yuanToFen(amount);
    if (cents === null || cents <= 0) return setError("请输入正确的金额");
    if (!date) return setError("请选择日期");

    setBusy(true);
    try {
      if (mode === "transfer") {
        if (fromId === null || toId === null) return setError("请选择账户");
        if (fromId === toId) return setError("转出与转入账户不能相同");
        const payload = {
          from_account_id: fromId,
          to_account_id: toId,
          amount_cents: cents,
          date,
          note: note.trim(),
        };
        if (editing?.kind === "transfer") await store.updateTransfer(editing.transfer.id, payload);
        else await store.addTransfer(payload);
      } else {
        if (categoryId === null) return setError("请选择分类");
        if (accountId === null) return setError("请选择账户");
        const payload = {
          type: mode,
          amount_cents: cents,
          account_id: accountId,
          category_id: categoryId,
          date,
          note: note.trim(),
        };
        if (editing?.kind === "record") await store.updateRecord(editing.record.id, payload);
        else await store.addRecord(payload);
      }
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.kind === "record") await store.deleteRecord(editing.record.id);
      else await store.deleteTransfer(editing.transfer.id);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑记录" : "记一笔"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
          {(
            [
              ["expense", "支出"],
              ["income", "收入"],
              ["transfer", "转账"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "cursor-pointer rounded-md py-1.5 text-sm text-muted-foreground transition-colors",
                mode === m && "bg-background font-medium text-foreground shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>金额（元）</Label>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-lg font-semibold"
            autoFocus
          />
        </div>

        {mode !== "transfer" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>分类</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {visibleCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "cursor-pointer truncate rounded-md border px-1 py-2 text-xs transition-colors",
                      categoryId === c.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>账户</Label>
              <div className="flex flex-wrap gap-1.5">
                {activeAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                      accountId === a.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>转出账户</Label>
              <div className="flex flex-wrap gap-1.5">
                {activeAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setFromId(a.id)}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                      fromId === a.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>转入账户</Label>
              <div className="flex flex-wrap gap-1.5">
                {activeAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setToId(a.id)}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                      toId === a.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>备注（可选）</Label>
            <Input
              placeholder="备注"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={50}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          {editing && (
            <Button variant="destructive" onClick={onDelete} disabled={busy}>
              删除
            </Button>
          )}
          <Button onClick={onSave} disabled={busy} className="flex-1">
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
