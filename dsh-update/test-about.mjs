// dsh-plugin-about offline self-test: node test-about.mjs
// No dsh process needed — routes are exercised against a mock webServer ctx.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, inject, name, compareVersions, parseSemver, parseNpmrcRegistry, resolveRegistry, normalizeIp, isLoopbackIp, readInstall } from './lib/index.js'

let passed = 0
const ok = (label) => { passed++; console.log('  ✓ ' + label) }

// --- plugin shape ----------------------------------------------------------
assert.equal(name, 'about')
assert.deepEqual(inject, ['webServer'])
assert.equal(typeof apply, 'function')
ok('plugin exports shape (name/inject/apply)')

// --- semver ------------------------------------------------------------------
assert.equal(compareVersions('0.1.0-rc.7', '0.1.0-rc.8'), -1)
assert.equal(compareVersions('0.1.0-rc.8', '0.1.0-rc.7'), 1)
assert.equal(compareVersions('0.1.0-rc.10', '0.1.0-rc.9'), 1, 'rc.10 > rc.9 (numeric)')
assert.equal(compareVersions('0.1.0', '0.1.0-rc.1'), 1, 'release > prerelease')
assert.equal(compareVersions('0.1.0-rc.1', '0.1.0'), -1)
assert.equal(compareVersions('0.1.0', '0.1.0'), 0)
assert.equal(compareVersions('0.2.0', '0.10.0'), -1, 'numeric not lexical')
assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1)
assert.equal(compareVersions('garbage', '1.0.0'), null)
assert.equal(parseSemver('v1.2.3').minor, 2)
ok('compareVersions / parseSemver')

// --- registry resolution -----------------------------------------------------
assert.equal(parseNpmrcRegistry('foo=1\nregistry=https://example.com/\n'), 'https://example.com/')
assert.equal(parseNpmrcRegistry('nothing here'), undefined)
assert.equal(resolveRegistry({ registry: 'https://cfg.example/' }, {}), 'https://cfg.example/')
assert.equal(resolveRegistry({}, { npm_config_registry: 'https://env.example/' }), 'https://env.example/')
assert.equal(resolveRegistry({}, {}), 'https://registry.npmjs.org/')
ok('parseNpmrcRegistry / resolveRegistry precedence')

// --- ip helpers ---------------------------------------------------------------
assert.equal(normalizeIp('::ffff:192.0.2.5'), '192.0.2.5')
assert.equal(normalizeIp('::1'), '127.0.0.1')
assert.equal(isLoopbackIp('::1'), true)
assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true)
assert.equal(isLoopbackIp('192.0.2.250'), false)
ok('normalizeIp / isLoopbackIp')

// --- mock mount --------------------------------------------------------------
const routes = new Map()
const disposers = []
const mockCtx = {
  effect(fn, label) { disposers.push(fn()); },
  webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
}
apply(mockCtx, {})
assert.ok(routes.has('/api/about/status'), 'status route registered')
assert.ok(routes.has('/api/about/upgrade'), 'upgrade route registered')
assert.equal(disposers.length, 2, 'both registrations dispose')
ok('apply() registers both routes with disposers')

function mockRes() {
  return {
    statusCode: 0, body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers },
    end(data) { this.body = data ?? '' },
  }
}
const call = async (path, req) => {
  const res = mockRes()
  await routes.get(path).handler(req, res)
  return { status: res.statusCode, body: res.body === '' ? null : JSON.parse(res.body) }
}

// --- readInstall against the real dsh installation ------------------------------
// resolve the global npm root so this test runs on any machine with dsh installed
import { spawnSync } from 'node:child_process'
const npmRoot = (process.platform === 'win32'
  ? spawnSync('npm root -g', { shell: true, encoding: 'utf8' })
  : spawnSync('npm', ['root', '-g'], { encoding: 'utf8' })).stdout?.trim() ?? ''
const dshBin = npmRoot !== '' ? npmRoot.replaceAll('\\', '/') + '/@deepseek-ai/dsh/lib/bin.js' : ''
if (dshBin === '') {
  console.log('  (npm root -g unavailable — skipping the real-install assertions)')
} else {
  const install = readInstall(dshBin)
  assert.match(install.version, /^\d+\.\d+/, 'found the real install version')
  assert.ok(install.path.includes('node_modules'), 'install path looks right')
  ok('readInstall resolves the real dsh install: ' + install.version + ' @ ' + install.path)
}
assert.equal(readInstall('C:/definitely/not/here.js').version, null, 'bad anchor -> null version')
ok('readInstall tolerates a bad anchor')

// --- GET status (hits the real registry once) ----------------------------------
const getReq = (ip, method = 'GET', url = '/api/about/status') => ({
  method, url, headers: {}, socket: { remoteAddress: ip },
})
const first = await call('/api/about/status', getReq('127.0.0.1'))
assert.equal(first.status, 200)
// current is null when the test cwd sits outside the dsh tree, or resolves
// through the ~/.dsh/profiles module fallback when this suite runs from
// inside a profile (the same anchor the real dsh process resolves through)
assert.ok(first.body.current === null || /^\d+\.\d+/.test(first.body.current), 'current is null or a version string')
assert.equal(first.body.loopback, true)
assert.equal(first.body.viewerIp, '127.0.0.1')
if (first.body.latestError === null) {
  assert.match(first.body.latest, /^\d+\.\d+/)
  // upToDate is null without a resolvable current, boolean with one
  assert.ok(first.body.upToDate === null || typeof first.body.upToDate === 'boolean')
} else {
  console.log('  (latest fetch failed in this environment: ' + first.body.latestError + ')')
}
ok('GET /api/about/status returns current+latest (current=' + first.body.current + ', latest=' + first.body.latest + ')')

// non-loopback status also allowed (info only)
const lan = await call('/api/about/status', getReq('::ffff:192.0.2.10'))
assert.equal(lan.status, 200)
assert.equal(lan.body.loopback, false)
ok('GET status allowed from non-loopback (loopback=false flagged)')

// --- POST guard ------------------------------------------------------------------
const postReq = (ip, body) => ({
  method: 'POST', url: '/api/about/upgrade', headers: {},
  socket: { remoteAddress: ip },
  on() {}, destroy() {},
})
// readJsonBody attaches listeners via req.on — give it a real event emitter shape
import { EventEmitter } from 'node:events'
const postReqEE = (ip, body) => {
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = '/api/about/upgrade'
  req.headers = {}
  req.socket = { remoteAddress: ip }
  process.nextTick(() => {
    req.emit('data', Buffer.from(JSON.stringify(body ?? {})))
    req.emit('end')
  })
  return req
}
const denied = await call('/api/about/upgrade', postReqEE('::ffff:192.0.2.10', {}))
assert.equal(denied.status, 403)
ok('POST upgrade from non-loopback -> 403')

// --- dry-run upgrade exercises the whole spawn/log/state machine ----------------
const started = await call('/api/about/upgrade', postReqEE('127.0.0.1', { dryRun: true }))
assert.equal(started.status, 200)
assert.equal(started.body.ok, true)
assert.equal(started.body.upgrade.active, true)
ok('POST upgrade {dryRun} starts npm --version')

// conflict while running is 409
const conflict = await call('/api/about/upgrade', postReqEE('127.0.0.1', { dryRun: true }))
assert.equal(conflict.status, 409)
ok('second POST while running -> 409')

// wait for close
const deadline = Date.now() + 30000
let done = null
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 300))
  done = await call('/api/about/status', getReq('127.0.0.1'))
  if (done.body.upgrade && done.body.upgrade.active === false) break
}
assert.ok(done.body.upgrade && done.body.upgrade.active === false, 'dryRun upgrade finished')
assert.equal(done.body.upgrade.ok, true, 'npm --version exit 0')
assert.ok(done.body.upgrade.log.length > 0, 'log captured')
assert.match(done.body.upgrade.log.join('\n'), /\d+\.\d+/, 'log contains an npm version number')
ok('dryRun upgrade completes: exit 0, log captured (' + done.body.upgrade.log.join(' ').trim().slice(0, 40) + '…)')

// 405s
assert.equal((await call('/api/about/status', getReq('127.0.0.1', 'POST'))).status, 405)
assert.equal((await call('/api/about/upgrade', getReq('127.0.0.1', 'GET'))).status, 405)
ok('method guards return 405')

// --- client bundle syntax ---------------------------------------------------------
const clientSrc = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
new Function(clientSrc) // parse-only: proves the classic script is syntactically valid
assert.match(clientSrc, /window\.__ModuleLoader__\.load\(\{\s*id: 'dsh-plugin-about'/)
ok('client bundle parses and registers under the right id')

console.log('\nAll ' + passed + " + spawn assertions passed.")
