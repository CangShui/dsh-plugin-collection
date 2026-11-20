/**
 * 用 dsh 自己的 profile 组合代码验证安装结果，不启动宿主：
 *
 *   1. 读 profile 的 bundles + 用户 patch 层
 *   2. 组合成最终 entry 列表，确认 dsh-continue 那行在、config 对
 *   3. 真的 import 一次装进 profile 的插件包，确认 name/apply/inject 形状
 *   4. 确认 loader 的运行时解析认这个包名
 *
 * 需要一个解开的 dsh 安装当 installAnchor。不传就依次尝试：
 *   $DSH_VERIFY_ANCHOR → %LOCALAPPDATA%\dsh-continue-cache\asar
 *   （缓存缺失时先跑 node scripts/extract-asar.mjs）
 *
 * 用法：
 *   node scripts/verify-profile.mjs [anchor] [--profile desktop]
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const CACHE_ANCHOR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "dsh-continue-cache",
  "asar",
  "dsh",
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "package.json",
);

const argv = process.argv.slice(2);
const profileIndex = argv.indexOf("--profile");
let profileName = "desktop";
if (profileIndex >= 0) {
  profileName = argv[profileIndex + 1];
  argv.splice(profileIndex, 2);
}

const anchor = argv[0] || process.env.DSH_VERIFY_ANCHOR || CACHE_ANCHOR;
if (!fs.existsSync(anchor)) {
  console.error(`installAnchor 不存在: ${anchor}`);
  console.error("先跑一次：node scripts/extract-asar.mjs");
  process.exit(2);
}

const require = createRequire(anchor);
const bootEntry = require.resolve("@deepseek-ai/dsh-app-boot");
const boot = await import(pathToFileURL(bootEntry).href);

const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(home, "profiles", profileName);

const profile = boot.loadProfileDirectory("dsh", profileDir, anchor);

let failed = false;
const ok = (message) => console.log(`  ok   ${message}`);
const bad = (message) => {
  failed = true;
  console.log(`  FAIL ${message}`);
};

console.log(`profile: ${profileDir}`);
console.log(`installAnchor: ${anchor}\n`);

// 1. 每一层 bundle 都读进来了吗
for (const layer of profile.layers) {
  console.log(`  layer ${layer.packageName}`);
}
if (profile.skippedBundles.length > 0) {
  for (const skipped of profile.skippedBundles) {
    bad(`bundle ${skipped.packageName} 被跳过：${skipped.reason}`);
  }
} else {
  ok("没有 bundle 被跳过");
}

const ours = profile.layers.find((layer) => layer.packageName === "dsh-continue");
if (ours) ok(`dsh-continue 已作为 bundle 加载：${ours.patchPaths.join(", ")}`);
else bad("dsh-continue 没有出现在已加载的 bundle 层里");

// 2. 组合最终 entry 列表
const entries = boot.composeEntries([
  ...profile.layers.map((layer) => layer.patches),
  profile.patches,
]);
const row = entries.find((entry) => entry.id === "dsh-continue");
if (!row) {
  bad("组合后的 entry 列表里没有 id: dsh-continue");
} else {
  ok(`entry 存在：name=${JSON.stringify(row.name)} disabled=${String(row.disabled)}`);
  const expected = { text: "继续", delayMs: 500, maxRounds: 0, enabled: true };
  for (const [key, value] of Object.entries(expected)) {
    const actual = row.config?.[key];
    if (actual === value) ok(`config.${key} = ${JSON.stringify(actual)}`);
    else bad(`config.${key} 期望 ${JSON.stringify(value)}，实际 ${JSON.stringify(actual)}`);
  }
  if (Array.isArray(row.inject) && row.inject.includes("commands")) ok(`inject = ${row.inject.join(", ")}`);
  else bad(`inject 里没有 commands：${JSON.stringify(row.inject)}`);
}

// 3. 从 profile 的 node_modules 真的 import 一次
const installedManifest = path.join(profileDir, "node_modules", "dsh-continue", "package.json");
if (!fs.existsSync(installedManifest)) {
  bad(`没有装进 profile：${installedManifest}`);
} else {
  ok("已装进 profile/node_modules");
  const manifests = JSON.parse(fs.readFileSync(installedManifest, "utf8"));
  if (manifests.dsh?.bundle?.patch) ok(`manifest dsh.bundle.patch = ${manifests.dsh.bundle.patch}`);
  else bad("manifest 缺 dsh.bundle.patch，profile 不会把它当 bundle");

  const mod = await import(pathToFileURL(path.join(path.dirname(installedManifest), "lib", "index.js")).href);
  if (mod.name === "dsh-continue") ok(`module name = ${mod.name}`);
  else bad(`module name 期望 dsh-continue，实际 ${JSON.stringify(mod.name)}`);
  if (typeof mod.apply === "function") ok("export apply()");
  else bad("没有 export apply()");
  if (Array.isArray(mod.inject) && mod.inject.includes("commands") && mod.inject.includes("agents")) {
    ok(`export inject = ${mod.inject.join(", ")}`);
  } else {
    bad(`module inject 不对：${JSON.stringify(mod.inject)}`);
  }
}

// 4. loader 的运行时解析里认不认这个名字
const resolution = await boot.createRuntimeResolution({ installAnchor: anchor, profile, home });
if (resolution.localPackageNames.includes("dsh-continue")) {
  ok(`runtime resolution 认这个包名（localPackageNames 含 dsh-continue）`);
} else {
  bad(`runtime resolution 的 localPackageNames 里没有 dsh-continue：${JSON.stringify(resolution.localPackageNames)}`);
}

console.log(failed ? "\nVERIFY FAILED" : "\nVERIFY OK");
process.exitCode = failed ? 1 : 0;
