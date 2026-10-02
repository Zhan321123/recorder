// 把 src-tauri/android-overlay/ 下的本机补丁整文件覆盖到 src-tauri/gen/android/。
// gen/android 由 `tauri android init` 生成、不纳入版本库；
// 本脚本已接入 android:dev / android:build / android:init，无需手动执行。
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const overlayDir = join(root, 'src-tauri', 'android-overlay')
const genDir = join(root, 'src-tauri', 'gen', 'android')

if (!existsSync(genDir)) {
  console.error('[overlay] 未找到 src-tauri/gen/android，请先执行：npm run android:init')
  process.exit(1)
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(overlayDir)
for (const src of files) {
  const rel = relative(overlayDir, src)
  const dest = join(genDir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest)
  console.log(`[overlay] ${rel}`)
}
console.log(`[overlay] 已覆盖 ${files.length} 个补丁文件`)
