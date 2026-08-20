// dsh-plugin-about — Host half.
//
// Adds two exact routes to the DSH webserver:
//   GET  /api/about/status[?refresh=1]  -> current/latest version + upgrade state
//   POST /api/about/upgrade             -> run the one-click upgrade (loopback only)
//
// - "current" is read from the RUNNING dsh installation's package.json on every
//   request, so a finished upgrade flips the panel to "up to date" immediately.
// - "latest" is fetched from the npm registry (registry configurable via the
//   row config or ~/.npmrc) and cached for 5 minutes; ?refresh=1 forces a
//   re-check.
// - the upgrade spawns `npm install -g @deepseek-ai/dsh@latest` exactly like a
//   manual upgrade: output is captured into a small ring buffer the panel polls.
//   POST body { "dryRun": true } runs `npm --version` instead — a full-path
//   self test that never touches the installation.
//
// The running dsh process keeps serving the old version until it is restarted;
// upgrading under it is safe (proven by manual `npm i -g` while dsh runs: the
// only side effect is a leftover EPERM'd npm temp dir, which is harmless).

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Stable Cordis plugin name. */
const name = 'about'

/** Services required: the webserver route registry. */
const inject = ['webServer']

const PKG = '@deepseek-ai/dsh'
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const LATEST_TTL_MS = 5 * 60 * 1000
const LATEST_TIMEOUT_MS = 15 * 1000
const UPGRADE_TIMEOUT_MS = 10 * 60 * 1000
const LOG_LIMIT = 300
const VIEW_LOG_LIMIT = 80

// ---------------------------------------------------------------------------
// semver comparison (prerelease-aware, no dependencies)
// ---------------------------------------------------------------------------

/** Parse a semver string into {major, minor, patch, pre[]}; null when malformed. */
export function parseSemver(value) {
  if (typeof value !== 'string') return null
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim())
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] === undefined ? [] : match[4].split('.'),
  }
}

/**
 * Compare two semver strings. -1 / 0 / 1; null when either side is malformed.
 * Prerelease rules: release > prerelease; numeric identifiers compare
 * numerically and rank below alphanumeric ones (rc.10 > rc.9 handled right).
 */
export function compareVersions(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (x === null || y === null) return null
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1
  }
  const xp = x.pre.length > 0
  const yp = y.pre.length > 0
  if (!xp && !yp) return 0
  if (xp && !yp) return -1
  if (!xp && yp) return 1
  const count = Math.max(x.pre.length, y.pre.length)
  for (let i = 0; i < count; i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) {
      const diff = Number(p) - Number(q)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (pn) return -1
    else if (qn) return 1
    else if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// registry resolution + current-install discovery
// ---------------------------------------------------------------------------

/** Extract the registry URL from raw .npmrc content (first registry= line). */
export function parseNpmrcRegistry(content) {
  if (typeof content !== 'string') return undefined
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*registry\s*=\s*(\S+)\s*$/.exec(line)
    if (match !== null) return match[1]
  }
  return undefined
}

/** Resolve the registry base URL: row config > npm_config_registry > ~/.npmrc > default. */
export function resolveRegistry(entryConfig, env = process.env) {
  const fromConfig = entryConfig && typeof entryConfig.registry === 'string' && entryConfig.registry.trim() !== ''
    ? entryConfig.registry.trim()
    : undefined
  if (fromConfig !== undefined) return fromConfig
  const fromEnv = typeof env.npm_config_registry === 'string' && env.npm_config_registry.trim() !== ''
    ? env.npm_config_registry.trim()
    : undefined
  if (fromEnv !== undefined) return fromEnv
  try {
    const npmrc = join(homedir(), '.npmrc')
    if (existsSync(npmrc)) {
      const fromFile = parseNpmrcRegistry(readFileSync(npmrc, 'utf8'))
      if (fromFile !== undefined) return fromFile
    }
  } catch (_e) {
    // unreadable .npmrc -> default below
  }
  return DEFAULT_REGISTRY
}

/**
 * Locate the dsh installation behind one anchor file (the running bin.js):
 * {version, path} or {version: null}. Exported for offline self-testing.
 * @param anchorPath - a path inside the dsh install (default process.argv[1]).
 */
export function readInstall(anchorPath = process.argv[1]) {
  // 1) resolve '@deepseek-ai/dsh/package.json' against the running bin (bin.js).
  try {
    if (typeof anchorPath === 'string' && anchorPath !== '') {
      const require_ = createRequire(anchorPath)
      const pkgPath = require_.resolve(PKG + '/package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (typeof pkg.version === 'string' && pkg.version !== '') {
        return { version: pkg.version, path: dirname(pkgPath) }
      }
    }
  } catch (_e) {
    // fall through
  }
  // 2) derive from the anchor: <install>/lib/bin.js -> <install>/package.json
  try {
    const root = dirname(dirname(anchorPath))
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    if (pkg.name === PKG && typeof pkg.version === 'string' && pkg.version !== '') {
      return { version: pkg.version, path: root }
    }
  } catch (_e) {
    // fall through
  }
  return { version: null, path: null }
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

/** Strip IPv4-mapped form and normalize ::1 so loopback detection is uniform. */
export function normalizeIp(addr) {
  if (typeof addr !== 'string') return ''
  if (addr.startsWith('::ffff:')) return addr.slice(7)
  if (addr === '::1') return '127.0.0.1'
  return addr
}

export function isLoopbackIp(addr) {
  const ip = normalizeIp(addr)
  return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1'
}

/** Read a small JSON request body (null when absent/oversized/malformed). */
function readJsonBody(req, limit = 16384) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > limit) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (_e) {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function tail(lines, count) {
  return lines.length > count ? lines.slice(lines.length - count) : [...lines]
}

// ---------------------------------------------------------------------------
// plugin body
// ---------------------------------------------------------------------------

/**
 * Host plugin body.
 * @param ctx - plugin context carrying the webServer service.
 * @param rawConfig - plugin entry config ({ registry?: string } both optional).
 */
function apply(ctx, rawConfig) {
  const entry = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const registry = resolveRegistry(entry)

  // ---- latest-version cache ------------------------------------------------
  let latestState = null // { version } | { error } | null
  let latestInFlight = null

  const fetchLatest = async () => {
    if (typeof fetch !== 'function') throw new Error('此 Node 运行时没有全局 fetch（需要 Node 18+）')
    const url = registry.replace(/\/+$/, '') + '/' + PKG + '/latest'
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(LATEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error('registry 返回 HTTP ' + res.status)
    const doc = await res.json()
    if (doc === null || typeof doc !== 'object' || typeof doc.version !== 'string' || doc.version === '') {
      throw new Error('registry 响应里没有 version 字段')
    }
    return doc.version
  }

  const refreshLatest = (force) => {
    const now = Date.now()
    if (!force && latestState !== null && latestState.error === undefined && now - latestState.checkedAt < LATEST_TTL_MS) {
      return Promise.resolve(latestState)
    }
    if (latestInFlight !== null) return latestInFlight
    latestInFlight = (async () => {
      try {
        const version = await fetchLatest()
        latestState = { version, checkedAt: Date.now() }
      } catch (error) {
        latestState = { error: String(error && error.message ? error.message : error), checkedAt: Date.now() }
      } finally {
        latestInFlight = null
      }
      return latestState
    })()
    return latestInFlight
  }

  // ---- upgrade state machine ----------------------------------------------
  let upgradeState = null // { active, startedAt, finishedAt, exitCode, ok, cmd, dryRun, log[] }

  const startUpgrade = (dryRun) => {
    if (upgradeState !== null && upgradeState.active) return { conflict: true }
    const args = dryRun === true ? ['--version'] : ['install', '-g', PKG + '@latest', '--no-fund', '--no-audit']
    const state = {
      active: true,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      ok: null,
      cmd: 'npm ' + args.join(' '),
      dryRun: dryRun === true,
      log: [],
    }
    let child
    try {
      // Windows needs the shell to resolve npm.cmd; a single command string
      // avoids the "args + shell" deprecation. Arguments are fixed literals.
      child = process.platform === 'win32'
        ? spawn('npm ' + args.join(' '), { shell: true, cwd: homedir(), env: process.env })
        : spawn('npm', args, { cwd: homedir(), env: process.env })
    } catch (error) {
      state.active = false
      state.finishedAt = Date.now()
      state.ok = false
      state.log.push('[about] 无法启动 npm：' + String(error && error.message ? error.message : error))
      upgradeState = state
      return { conflict: false, state }
    }
    upgradeState = state
    const push = (buf) => {
      const text = buf.toString('utf8')
      for (const line of text.split(/\r\n|\r|\n/)) {
        if (line === '') continue
        state.log.push(line)
        if (state.log.length > LOG_LIMIT) state.log.shift()
      }
    }
    child.stdout.on('data', push)
    child.stderr.on('data', push)
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch (_e) {
        // already gone
      }
      state.log.push('[about] 升级超时（10 分钟），npm 进程已被终止')
    }, UPGRADE_TIMEOUT_MS)
    child.on('error', (error) => {
      state.active = false
      state.finishedAt = Date.now()
      state.ok = false
      state.log.push('[about] npm 进程错误：' + String(error && error.message ? error.message : error))
      clearTimeout(timer)
    })
    child.on('close', (code) => {
      state.active = false
      state.finishedAt = Date.now()
      state.exitCode = code
      state.ok = code === 0
      clearTimeout(timer)
      // release the piped stdio handles so nothing dangles at process exit
      try { child.stdout?.destroy() } catch (_e) { /* already closed */ }
      try { child.stderr?.destroy() } catch (_e) { /* already closed */ }
      if (state.ok && !state.dryRun) latestState = null // next status re-checks
    })
    return { conflict: false, state }
  }

  const upgradeView = () => {
    if (upgradeState === null) return null
    return {
      active: upgradeState.active,
      ok: upgradeState.ok,
      exitCode: upgradeState.exitCode,
      startedAt: upgradeState.startedAt,
      finishedAt: upgradeState.finishedAt,
      cmd: upgradeState.cmd,
      dryRun: upgradeState.dryRun,
      log: tail(upgradeState.log, VIEW_LOG_LIMIT),
    }
  }

  const statusView = (req) => {
    const install = readInstall()
    const latest = latestState && latestState.version !== undefined ? latestState.version : null
    const cmp = install.version !== null && latest !== null ? compareVersions(install.version, latest) : null
    const viewerIp = req ? normalizeIp(req.socket?.remoteAddress) : null
    return {
      viewerIp,
      loopback: viewerIp === null ? true : isLoopbackIp(viewerIp),
      package: PKG,
      current: install.version,
      installPath: install.path,
      node: process.versions.node,
      latest,
      latestCheckedAt: latestState !== null ? latestState.checkedAt : null,
      latestError: latestState !== null && latestState.error !== undefined ? latestState.error : null,
      upToDate: cmp === null ? null : cmp >= 0,
      hasNewer: cmp === null ? null : cmp < 0,
      registry,
      upgrade: upgradeView(),
    }
  }

  // ---- routes ---------------------------------------------------------------
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/about/status',
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405)
            res.end()
            return
          }
          let force = false
          try {
            const query = (req.url ?? '').split('?')[1] ?? ''
            force = new URLSearchParams(query).get('refresh') === '1'
          } catch (_e) {
            force = false
          }
          await refreshLatest(force)
          sendJson(res, 200, statusView(req))
        },
      }),
    'about: status route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/about/upgrade',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }
          const viewerIp = normalizeIp(req.socket?.remoteAddress)
          if (!isLoopbackIp(viewerIp)) {
            sendJson(res, 403, { ok: false, error: '仅限本机（127.0.0.1）触发升级' })
            return
          }
          const body = await readJsonBody(req)
          const dryRun = body !== null && body.dryRun === true
          const started = startUpgrade(dryRun)
          if (started.conflict) {
            sendJson(res, 409, { ok: false, error: '升级正在进行中', upgrade: upgradeView() })
            return
          }
          sendJson(res, 200, { ok: true, upgrade: upgradeView() })
        },
      }),
    'about: upgrade route',
  )
}

export { apply, inject, name }
