import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  exportBackup,
  pickImportFile,
  runImport,
  type ImportPreview,
} from "../lib/backup";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  async function onExport() {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await exportBackup());
    } catch (e) {
      setMessage(`导出失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPickImport() {
    setBusy(true);
    setMessage("");
    try {
      const p = await pickImportFile();
      if (p) setPreview(p);
    } catch (e) {
      setMessage(`导入失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmImport() {
    if (!preview) return;
    setBusy(true);
    try {
      await runImport(preview);
      setMessage("导入完成，数据已全量替换，正在刷新…");
      setPreview(null);
      // 全量替换后各模块 store 均为脏数据，直接重载前端
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setMessage(`导入失败: ${String(e)}（可重新选择备份文件再试）`);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>数据管理</CardTitle>
          <CardDescription>
            所有数据仅保存在本机（SQLite），备份为 JSON 文件
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button onClick={onExport} disabled={busy} className="flex-1">
              <Download /> 导出备份
            </Button>
            <Button
              variant="outline"
              onClick={onPickImport}
              disabled={busy}
              className="flex-1"
            >
              <Upload /> 导入备份
            </Button>
          </div>
          {message && (
            <p className="break-all text-sm text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>- Recorder v0.1.0</p>
          <p className="mt-1">
            - 纯单机离线，无账号，无上传服务器，同步数据依靠导出导入
          </p>
          <p className="mt-1">
            - Windows 数据位置：%APPDATA%\com.recorder.app\recorder.db
          </p>
        </CardContent>
      </Card>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入？</DialogTitle>
            <DialogDescription>
              导入将<span className="font-semibold text-destructive">全量替换</span>
              当前所有数据，建议先导出当前数据。
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                备份导出时间：{new Date(preview.exportedAt).toLocaleString("zh-CN")}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {preview.counts
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <p key={c.label}>
                      {c.label}：<span className="font-medium">{c.count}</span> 条
                    </p>
                  ))}
                {preview.counts.every((c) => c.count === 0) && (
                  <p className="text-muted-foreground">（备份内无业务数据）</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="destructive" onClick={onConfirmImport} disabled={busy}>
              全量替换导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
