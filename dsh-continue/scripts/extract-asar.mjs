/**
 * 解包 app.asar 里的 dsh 安装，供 scripts/verify-profile.mjs 当 installAnchor。
 *
 * 只解 `dsh/node_modules/` 这一棵（约 100MB），落在工程目录之外：
 *   %LOCALAPPDATA%\dsh-continue-cache\asar
 *
 * 用法：
 *   node scripts/extract-asar.mjs                 # 自动找 DeepSeek Harness
 *   node scripts/extract-asar.mjs "C:\...\app.asar"
 *   node scripts/extract-asar.mjs --dir D:\cache
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_CACHE = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "dsh-continue-cache",
  "asar",
);

function findAsar() {
  const candidates = [
    process.env.DSH_APP_ASAR,
    path.join(process.env.LOCALAPPDATA || "", "Programs", "DeepSeek Harness", "resources", "app.asar"),
    path.join(process.env.ProgramFiles || "", "DeepSeek Harness", "resources", "app.asar"),
    "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar",
    "/opt/DeepSeek Harness/resources/app.asar",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* 试下一个候选 */
    }
  }
  return undefined;
}

const args = process.argv.slice(2);
const dirIndex = args.indexOf("--dir");
let destDir = DEFAULT_CACHE;
if (dirIndex >= 0) {
  destDir = path.resolve(args[dirIndex + 1]);
  args.splice(dirIndex, 2);
}

const asarPath = args[0] || findAsar();
if (!asarPath || !fs.existsSync(asarPath)) {
  console.error("找不到 app.asar；用 node scripts/extract-asar.mjs <path-to-app.asar> 指定");
  process.exit(2);
}

const FILTER = "dsh/node_modules/";

const fd = fs.openSync(asarPath, "r");
const preamble = Buffer.alloc(16);
fs.readSync(fd, preamble, 0, 16, 0);
if (preamble.readUInt32LE(0) !== 4) {
  fs.closeSync(fd);
  console.error("不是 asar 归档");
  process.exit(2);
}
const headerSize = preamble.readUInt32LE(4);
const jsonSize = preamble.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const header = JSON.parse(jsonBuf.toString("utf8"));
const dataOffset = 8 + headerSize;

const entries = [];
(function walk(node, prefix) {
  const files = node && node.files;
  if (!files) return;
  for (const [name, info] of Object.entries(files)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (info && info.files) walk(info, rel);
    else if (info) entries.push({ rel, info });
  }
})(header, "");

let written = 0;
let bytes = 0;
for (const { rel, info } of entries) {
  if (!rel.startsWith(FILTER) || info.unpacked) continue;
  const outPath = path.join(destDir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const size = Number(info.size || 0);
  if (size === 0) {
    fs.writeFileSync(outPath, Buffer.alloc(0));
    continue;
  }
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, dataOffset + Number(info.offset || 0));
  fs.writeFileSync(outPath, buf);
  written += 1;
  bytes += size;
}
fs.closeSync(fd);

const anchor = path.join(destDir, "dsh", "node_modules", "@deepseek-ai", "dsh", "package.json");
console.log(`dsh: ${asarPath}`);
console.log(`解出 ${written} 个文件 / ${(bytes / 1024 / 1024).toFixed(1)} MB -> ${destDir}`);
console.log(`installAnchor: ${anchor}`);
if (!fs.existsSync(anchor)) {
  console.error("没解到 @deepseek-ai/dsh 的 package.json，版本可能换了目录结构");
  process.exitCode = 1;
}
