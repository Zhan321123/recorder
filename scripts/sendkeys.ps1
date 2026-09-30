# 向当前聚焦窗口发送按键（用于原生文件对话框输路径回车等）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sendkeys.ps1 -Path 'H:\full\path\to\file.json'
# 注意: 按键发给"当前焦点窗口"，对话框必须处于聚焦状态；有人操作电脑时会被抢焦点。
param([string]$Path)
$ws = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 500
$ws.SendKeys($Path)
Start-Sleep -Milliseconds 300
$ws.SendKeys('{ENTER}')
