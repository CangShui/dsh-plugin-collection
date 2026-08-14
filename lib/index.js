// @deepseek-ai/dsh-plugin-opencode-go — Host half.
// Reads the OpenCode Go API key NATIVELY from DSH's credential seam
// ($DSH_HOME/.credentials.yaml, the environment, or .env — the same source the
// model provider resolves), so the plugin never stores its own copy. Polls the
// official OpenCode Go usage API and serves the snapshot on a local route.

/** Stable Cordis plugin name. */
const name = 'opencode-go-usage'

/** Services required: the webserver route registry. */
const inject = ['webServer']

/** Default API base URL. */
const DEFAULT_BASE_URL = 'https://opencode.ai'

/** Default polling interval in milliseconds. */
const DEFAULT_REFRESH_MS = 60000

/** Default credential reference resolved from DSH's credential seam. */
const DEFAULT_CREDENTIAL_REF = 'OPENCODE_GO_API_KEY'

/** Outbound User-Agent (some edge/WAF setups throttle bare undici requests). */
const USER_AGENT = 'dsh-plugin-opencode-go/1.0 (+https://opencode.ai)'

/**
 * Resolve the API key natively through DSH's credential seam, mirroring the
 * model provider: the credential service layers process env > .credentials.yaml
 * > .env. Falls back to the raw environment when the service is unavailable.
 * @param ctx - plugin context.
 * @param ref - credential reference (e.g. OPENCODE_GO_API_KEY).
 * @returns {{ key: string|null, source: string|null }}
 */
async function resolveKey(ctx, ref) {
  let credentials
  try {
    credentials = ctx.get('credentials')
  } catch {
    credentials = undefined
  }
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit && hit.value) return { key: hit.value, source: hit.source || 'file' }
    } catch (error) {
      ctx.logger?.warn('[opencode-go-usage] credential resolve failed:', error)
    }
  }
  const env = typeof process !== 'undefined' ? process.env[ref] : undefined
  if (env) return { key: env, source: 'env' }
  return { key: null, source: null }
}

/**
 * Fetch the usage endpoint once, retrying network-level failures (stale
 * keep-alive sockets / transient resets) up to 3 times. A definitive HTTP
 * response resolves immediately; only fetch() throws are retried.
 * @param config - resolved plugin config.
 * @param key - resolved API key.
 * @returns {Promise<Response>}
 */
async function fetchUsage(config, key) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      return await fetch(config.baseUrl.replace(/\/$/, '') + '/zen/go/v1/usage', {
        method: 'GET',
        headers: {
          authorization: 'Bearer ' + key,
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        signal: controller.signal,
      })
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
  }
  const cause =
    lastError && lastError.cause
      ? lastError.cause.code || lastError.cause.message
      : lastError && lastError.code
  throw new Error(
    (lastError instanceof Error ? lastError.message : String(lastError)) +
      (cause ? ' (' + cause + ')' : ''),
  )
}

/**
 * Resolve the key and refresh the shared snapshot once.
 * @param ctx - plugin context.
 * @param config - resolved plugin config.
 * @param state - mutable shared snapshot object.
 */
async function refresh(ctx, config, state) {
  const { key, source } = await resolveKey(ctx, config.credentialRef)
  if (!key) {
    state.value = {
      ok: false,
      error: {
        type: 'NoApiKey',
        message:
          '未找到密钥 ' + config.credentialRef + '：请在 DSH 的模型设置(Models)里配置 OpenCode Go 的 API Key，或设置环境变量 ' + config.credentialRef + '。',
      },
      keySource: null,
      credentialRef: config.credentialRef,
    }
    return
  }
  try {
    const response = await fetchUsage(config, key)
    let body = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (!response.ok || !body || typeof body !== 'object' || !body.usage) {
      state.value = {
        ok: false,
        status: response.status,
        error: (body && body.error) || { type: 'HttpError', message: 'HTTP ' + response.status },
        keySource: source,
        credentialRef: config.credentialRef,
      }
      return
    }
    state.value = {
      ok: true,
      usage: body.usage,
      fetchedAt: Date.now(),
      keySource: source,
      credentialRef: config.credentialRef,
    }
  } catch (error) {
    state.value = {
      ok: false,
      error: { type: 'NetworkError', message: error instanceof Error ? error.message : String(error) },
      keySource: source,
      credentialRef: config.credentialRef,
    }
  }
}

/**
 * Host plugin body: resolve the key natively, start the polling loop, and
 * expose the snapshot over a webserver route.
 * @param ctx - plugin context carrying the webServer service.
 * @param rawConfig - plugin entry config (partial allowed; defaults applied here).
 */
function apply(ctx, rawConfig) {
  const config = {
    baseUrl:
      rawConfig && typeof rawConfig.baseUrl === 'string' && rawConfig.baseUrl
        ? rawConfig.baseUrl
        : DEFAULT_BASE_URL,
    refreshMs:
      rawConfig && typeof rawConfig.refreshMs === 'number' && rawConfig.refreshMs > 0
        ? rawConfig.refreshMs
        : DEFAULT_REFRESH_MS,
    credentialRef:
      rawConfig && typeof rawConfig.credentialRef === 'string' && rawConfig.credentialRef
        ? rawConfig.credentialRef
        : DEFAULT_CREDENTIAL_REF,
  }

  const state = {
    value: {
      ok: false,
      error: { type: 'Pending', message: '等待配置…' },
      keySource: null,
      credentialRef: config.credentialRef,
    },
  }

  let timer = null
  const stopLoop = () => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
  const startLoop = () => {
    if (timer !== null) return
    timer = setInterval(() => {
      void refresh(ctx, config, state)
    }, Math.max(5000, config.refreshMs))
  }

  ctx.effect(() => () => stopLoop(), 'opencode-go-usage: polling loop')

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/opencode-go/usage',
        handler: (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405)
            res.end()
            return
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(state.value))
        },
      }),
    'opencode-go-usage: webserver route',
  )

  void refresh(ctx, config, state)
  startLoop()

  // The credentials service may still be loading its document when this plugin
  // first applies; re-check a few times so a transient "未找到密钥" does not
  // linger for a full poll interval.
  let bootChecks = 0
  const bootTimer = setInterval(() => {
    bootChecks++
    if (bootChecks > 6 || state.value.keySource) {
      clearInterval(bootTimer)
      return
    }
    void refresh(ctx, config, state)
  }, 2000)
  ctx.effect(() => () => clearInterval(bootTimer), 'opencode-go-usage: boot retry')
}

export { apply, inject, name }
