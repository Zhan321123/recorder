// CDP 驱动脚本：在 Android WebView / Windows WebView2 页面里执行一个 JS 文件并打印结果。
// 用法:
//   Android:  adb forward tcp:9224 localabstract:webview_devtools_remote_<pid>
//             node scripts/cdp-eval.mjs <js文件> 9224
//   Windows:  设 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9229 后启动 app
//             node scripts/cdp-eval.mjs <js文件> 9229
// JS 文件应是一个表达式或 async IIFE，返回值会被 JSON 打印（awaitPromise + returnByValue）。
import fs from "node:fs";

const port = process.argv[3] || "9222";
const expr = fs.readFileSync(process.argv[2], "utf8");

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const page = list.find(
  (t) => t.type === "page" && (t.url.includes("tauri.localhost") || t.url.includes("1420"))
);
if (!page) {
  console.error("no page target; targets:", list.map((t) => [t.type, t.url]));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
function send(method, params) {
  return new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

const r = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
});
if (r.result?.exceptionDetails || r.result?.result?.subtype === "error") {
  console.error(JSON.stringify(r.result.exceptionDetails ?? r.result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(r.result?.result?.value, null, 2));
ws.close();
process.exit(0);
