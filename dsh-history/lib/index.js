/**
 * dsh-plugin-prompt-history — Host half.
 *
 * The plugin is browser-only: every behavior lives in `./client`. This empty
 * host `apply` exists so the package is a valid Cordis plugin and appears in
 * the Loader roster, which is what lets the module node half discover
 * `exports["./client"]` through the `dsh.client` declaration in package.json
 * and ship it into `window.__DSH_BOOT__`.
 *
 * Nothing here touches the model, the log, or the filesystem.
 */

/** Stable Cordis plugin name. */
export const name = 'dsh-plugin-prompt-history'

/**
 * Host plugin body — deliberately empty (pure UI plugin).
 * @param _ctx - owning root context (unused).
 * @param _config - plugin entry config (unused).
 */
export function apply() {}
