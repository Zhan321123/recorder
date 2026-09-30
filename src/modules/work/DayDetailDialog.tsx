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
import { useWorkStore } from "../../stores/work";
import { Solar } from "lunar-javascript";

export default function DayDetailDialog({
  date,
  onClose,
}: {
  date: string | null;
  onClose: () => void;
}) {
  const days = useWorkStore((s) => s.days);
  const upsertDay = useWorkStore((s) => s.upsertDay);
  const removeDay = useWorkStore((s) => s.removeDay);

  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const day = date ? days[date] : undefined;

  useEffect(() => {
    if (date && days[date]) {
      setHours(String(days[date].hours));
      setNote(days[date].note);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!date || !day) return null;

  const [y, mo, d] = date.split("-").map(Number);
  const lunar = Solar.fromYmd(y, mo, d).getLunar();
  const lunarText = `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;

  async function onSave() {
    const h = parseFloat(hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) return setError("工时需为 0-24 之间的数字");
    setBusy(true);
    try {
      await upsertDay(date!, h, note.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await removeDay(date!);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mo}月{d}日 <span className="text-sm font-normal text-muted-foreground">{lunarText}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>当日工时（小时）</Label>
          <Input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>备注（可选）</Label>
          <Input
            placeholder="如：加班、请假半天"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={50}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button variant="destructive" onClick={onRemove} disabled={busy}>
            取消上班
          </Button>
          <Button onClick={onSave} disabled={busy} className="flex-1">
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
