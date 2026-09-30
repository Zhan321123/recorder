# Windows 桌面截图 → shot-win.png（项目根）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/screenshot.ps1
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$out = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "shot-win.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output $out
