# Recorder

纯离线的个人记录应用（无账号、无服务器、无同步），一套代码跑 **Android + Windows**。

三个模块（里程碑一仅打通链路，功能待开发）：

- **账单记录器** —— 钱的流入流出
- **班时记录器** —— 上班时间
- **课程表编辑器** —— 学期课程表

数据用 SQLite 持久化，备份为 JSON 导出/导入（不需要 CSV）。

## 技术栈

- Tauri v2（Rust 后端 + 系统 WebView）
- React 18 + TypeScript + Vite（前端，无 UI 组件库）
- SQLite（tauri-plugin-sql，sqlx 驱动）

## 开发环境

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | 国内建议 `npm i --registry=https://registry.npmmirror.com`（官方源可能卡死） |
| Rust | ≥ 1.90 | 含 `aarch64/armv7/i686/x86_64-linux-android` 四个 target |
| JDK | 17 | 设 `JAVA_HOME`（Gradle 不支持更高版本） |
| Android SDK | Platform 36 + Build-Tools 36.1.0 + NDK 29 + Platform-Tools | 仅需 cmdline-tools，无需 Android Studio IDE |
| 环境变量 | `ANDROID_HOME`、`JAVA_HOME` | 用户级已配置 |

模拟器调试（雷电，Android 14 / x86_64）：

```bash
# 雷电设置里开启 ADB 连接后，用 SDK 的 adb（不要用雷电自带的，版本冲突）
adb connect 127.0.0.1:5555
# 若同时出现 emulator-5554 和 127.0.0.1:5555 两个条目（同一设备），去重：
adb disconnect 127.0.0.1:5555
```

## 常用命令

```bash
npm run dev                  # 仅前端（浏览器预览）
npm run tauri dev            # Windows 开发模式
npm run tauri android dev    # Android 开发模式（需设备在线，首次构建约 20 分钟）
npm run tauri android build -- --apk   # 出 APK
```

## 数据存储位置

- Windows：`%APPDATA%\com.recorder.app\recorder.db`
- Android：应用私有目录（无需存储权限）
- 注意：sqlx 默认 **WAL 模式**，写入先落在 `recorder.db-wal`，主文件大小不会立即增长，属正常现象

## 链路验证笔记（里程碑一 spike 结论）

1. **`sql:default` 只有读权限**（allow-load/select/close）。任何写操作（CREATE/INSERT/UPDATE/DELETE）必须在 capabilities 里显式加 `sql:allow-execute`，否则报 `sql.execute not allowed`。
2. npm 官方源在本机网络下会假死，用 npmmirror 源秒装。
3. Android 端 JSON 导出的可行路径：**待验证**（见 `src/backup.ts` 注释，结论验证后补充在这里）。
