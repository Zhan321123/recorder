import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { useBillStore } from "../../stores/bill";
import { fenToYuan, yuanToFen } from "../../lib/format";
import { cn } from "../../lib/utils";

export default function ManagePage() {
  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <AccountSection />
      <CategorySection />
    </div>
  );
}

function AccountSection() {
  const { accounts, balances } = useBillStore();
  const store = useBillStore.getState();
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function onAdd() {
    setError("");
    const name = newName.trim();
    if (!name) return;
    const cents = newAmount.trim() === "" ? 0 : yuanToFen(newAmount);
    if (cents === null) {
      setError("初始金额格式不正确（如 100 或 100.50）");
      return;
    }
    await store.addAccount(name, cents);
    setNewName("");
    setNewAmount("");
  }

  async function onDelete(id: number) {
    const err = await store.deleteAccount(id);
    if (err) setError(err);
    setConfirmDeleteId(null);
  }

  const deleting = accounts.find((a) => a.id === confirmDeleteId);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  function Row({ id, name }: { id: number; name: string }) {
    const a = accounts.find((x) => x.id === id)!;
    if (editingId === id) {
      return (
        <div className="flex items-center gap-2 border-t px-3 py-2 first:border-t-0">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-8"
            autoFocus
          />
          <Button
            size="sm"
            onClick={async () => {
              const n = editName.trim();
              if (n) await store.updateAccount(id, n);
              setEditingId(null);
            }}
          >
            保存
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
            取消
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 border-t px-3 py-2.5 first:border-t-0">
        <span className="flex-1 text-sm">
          {name}
          {!!a.archived && (
            <Badge variant="secondary" className="ml-2">
              已归档
            </Badge>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          ¥{fenToYuan(balances[id] ?? 0)}
        </span>
        <button
          className="cursor-pointer px-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setEditingId(id);
            setEditName(name);
          }}
        >
          编辑
        </button>
        <button
          className="cursor-pointer px-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => store.setAccountArchived(id, !a.archived)}
        >
          {a.archived ? "恢复" : "归档"}
        </button>
        <button
          className="cursor-pointer px-1 text-xs text-destructive"
          onClick={() => {
            setError("");
            setConfirmDeleteId(id);
          }}
        >
          删除
        </button>
      </div>
    );
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">账户管理</h3>
      <div className="rounded-lg border bg-card">
        <div className="flex gap-2 p-3">
          <Input
            placeholder="新账户名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            className="h-8"
          />
          <Input
            placeholder="初始金额"
            inputMode="decimal"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            className="h-8 w-28 shrink-0"
          />
          <Button size="sm" onClick={onAdd} className="h-8">
            添加
          </Button>
        </div>
        {active.map((a) => (
          <Row key={a.id} id={a.id} name={a.name} />
        ))}
        {archived.map((a) => (
          <Row key={a.id} id={a.id} name={a.name} />
        ))}
        {deleting && (
          <div className="m-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>删除账户「{deleting.name}」，不可恢复。</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                取消
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDelete(deleting.id)}>
                确认删除
              </Button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}

function CategorySection() {
  const { categories } = useBillStore();
  const store = useBillStore.getState();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const list = categories.filter((c) => c.type === type);

  async function onAdd() {
    const name = newName.trim();
    if (!name) return;
    await store.addCategory(name, type);
    setNewName("");
  }

  async function onDelete(id: number) {
    const err = await store.deleteCategory(id);
    if (err) setError(err);
    setConfirmDeleteId(null);
  }

  const deleting = categories.find((c) => c.id === confirmDeleteId);

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">分类管理</h3>
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(
          [
            ["expense", "支出分类"],
            ["income", "收入分类"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "cursor-pointer rounded-md py-1.5 text-sm text-muted-foreground transition-colors",
              type === t && "bg-background font-medium text-foreground shadow-sm"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-card">
        <div className="flex gap-2 p-3">
          <Input
            placeholder="新分类名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            className="h-8"
          />
          <Button size="sm" onClick={onAdd} className="h-8">
            添加
          </Button>
        </div>
        {list.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="flex items-center gap-2 border-t px-3 py-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8"
                autoFocus
              />
              <Button
                size="sm"
                onClick={async () => {
                  const n = editName.trim();
                  if (n) await store.updateCategory(c.id, n);
                  setEditingId(null);
                }}
              >
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                取消
              </Button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-2 border-t px-3 py-2.5">
              <span className="flex-1 text-sm">{c.name}</span>
              <button
                className="cursor-pointer px-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
              >
                编辑
              </button>
              <button
                className="cursor-pointer px-1 text-xs text-destructive"
                onClick={() => {
                  setError("");
                  setConfirmDeleteId(c.id);
                }}
              >
                删除
              </button>
            </div>
          )
        )}
        {deleting && (
          <div className="m-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>删除分类「{deleting.name}」，不可恢复。</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                取消
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDelete(deleting.id)}>
                确认删除
              </Button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}
