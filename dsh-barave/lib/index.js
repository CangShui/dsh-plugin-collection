// dsh-web-search-brave plugin entry: registers a Brave Search API-backed
// WebSearchProvider into ctx.web AND a settings section (web-search-brave) so
// the Web GUI exposes a "Search API" config card (apiKey credential ref +
// baseURL + maxResults), replacing the now-disabled web-search-deepseek card.
//
// Out-of-tree resolution note: a bare `import '@deepseek-ai/dsh-settings'` /
// `'@deepseek-ai/schemastery'` FAILS here, because the node_modules walk from
// this plugin's location (Desktop\test\...) never reaches the harness install.
// (This is why dsh-plugin-lan-companion and the modsearch plugin import only
// node builtins.) To still register a settings section, we resolve the harness
// install path from the running dsh binary (process.argv[1] = .../dsh/lib/bin.js)
// and dynamic-import dsh-settings + schemastery by absolute file URL, with a
// fallback to the standard global-install path.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRAVE_DEFAULT_BASE_URL, BRAVE_PROVIDER_ID, BraveSearchProvider } from './provider.js';

export { BRAVE_DEFAULT_BASE_URL, BRAVE_PROVIDER_ID, BraveSearchProvider } from './provider.js';

/** Locate the harness install's `@deepseek-ai/*` peer packages. */
function resolveDeepseekPeers() {
  const candidates = [];
  // process.argv[1] is .../@deepseek-ai/dsh/lib/bin.js when booted by `dsh`.
  if (process.argv[1]) {
    candidates.push(join(dirname(process.argv[1]), '..', 'node_modules', '@deepseek-ai'));
  }
  // Fallback: standard global npm install location.
  candidates.push('C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai');
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'dsh-settings', 'lib', 'index.js'))) return dir;
  }
  throw new Error('web-search-brave: cannot locate @deepseek-ai/dsh-settings in the harness install');
}

const DEEPSEEK_PEERS = resolveDeepseekPeers();
const z = (await import(pathToFileURL(join(DEEPSEEK_PEERS, 'schemastery', 'lib', 'index.mjs')).href)).default;
const { installSettingsSection, settingsNamespace } = await import(
  pathToFileURL(join(DEEPSEEK_PEERS, 'dsh-settings', 'lib', 'index.js')).href
);

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-brave';

/** The web seam this provider registers into. */
export const inject = ['web'];

/** Settings namespace the web section edits. The host half registers
 *  `web-search-brave`; the client half (lib/client.js) registers a "Brave 搜索"
 *  card into the settings.plugin.item slot keyed by this same namespace. */
export const WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE = settingsNamespace('web-search-brave');

/** Default credential reference resolved per search through ctx.credentials. */
const DEFAULT_API_KEY_ENV = 'BRAVE_API_KEY';

/**
 * Config schema for the web-search-brave settings section. The client half
 * (lib/client.js) renders a "Brave 搜索" card. The API key is NOT a field
 * here: like the shipped DeepSeek search card, the key lives in the harness
 * credentials domain at the `apiKeyEnv` reference (default BRAVE_API_KEY),
 * and the card writes/reads it through the credentials API. `baseURL` and
 * `maxUses` are normal section fields.
 */
export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(BRAVE_DEFAULT_BASE_URL),
  maxUses: z.number().step(1).min(1).default(8),
});

/** Register the Brave search provider with `ctx.web`, settings-section backed. */
export function apply(ctx, config = {}) {
  let current = () => config;
  installSettingsSection(ctx, WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source;
    },
    // The registration carries no resolved value: the provider projects the
    // section per search, so a committed change needs no re-registration.
    onChange: () => {},
  });
  ctx.web.registerSearchProvider(new BraveSearchProvider(() => resolveOptions(ctx, current())));
}

/** Project the current settings-section/composition value into provider options. */
function resolveOptions(ctx, config) {
  const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  return {
    baseURL: config.baseURL ?? BRAVE_DEFAULT_BASE_URL,
    ...(config.maxUses !== undefined ? { maxUses: config.maxUses } : {}),
    resolveApiKey: async () => {
      // 1. harness credentials service (async per search; a rotated key reaches the next call)
      try {
        const credentials = ctx.get('credentials');
        if (credentials && typeof credentials.resolve === 'function') {
          const resolved = await credentials.resolve(apiKeyEnv);
          if (resolved && typeof resolved.value === 'string' && resolved.value.length > 0) {
            return resolved.value;
          }
        }
      } catch {
        // fall through to env
      }
      // 2. process environment
      if (typeof process.env.BRAVE_API_KEY === 'string' && process.env.BRAVE_API_KEY.length > 0) {
        return process.env.BRAVE_API_KEY;
      }
      return undefined;
    },
  };
}
