// dsh-web-search-brave — Client half.
//
// Registers a self-contained "Brave 搜索" settings card into the
// `settings.plugin.item` slot, keyed by the `web-search-brave` namespace the
// host half (lib/index.js) registers. The card exposes three controls:
//   - API key: written to the harness CREDENTIALS domain at the `apiKeyEnv`
//     reference (default BRAVE_API_KEY), like the shipped DeepSeek search card.
//     The card shows "已设置/未设置" (configured) and never holds the literal.
//   - Endpoint (baseURL) and Max uses (maxUses): normal settings-section fields.
// Zero DSH-primitive imports: React + inline CSS only, so it loads reliably as
// an out-of-tree client module via window.__ModuleLoader__.
window.__ModuleLoader__.load({
  id: 'dsh-web-search-brave',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');
    const { useSyncExternalStore, useState, useEffect } = React;

    /** Settings namespace this card claims (matches the host installSettingsSection). */
    const NS = 'web-search-brave';
    /** Default credential reference when the section names none. */
    const DEFAULT_API_KEY_REF = 'BRAVE_API_KEY';

    /** Inline CSS (namespaced so it never collides). Injected once. */
    const CSS = `
.brv-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;margin:0}
.brv-card:hover{border-color:var(--dsw-alias-label-dimmed,#98a2b3)}
.brv-cardOpen{background:var(--dsw-alias-bg-layer-2,#f9fafb);border-color:var(--dsw-alias-label-dimmed,#98a2b3)}
.brv-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
.brv-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2563eb);outline-offset:-2px}
.brv-headText{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.brv-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,#101828)}
.brv-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#667085)}
.brv-pending{flex:none;border-radius:999px;padding:1px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#667085);background:var(--dsw-alias-bg-layer-2,#f2f4f7)}
.brv-body{border-top:1px solid var(--dsw-alias-border-l2,#eaecf0);margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:12px}
.brv-field{display:flex;flex-direction:column;gap:4px}
.brv-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#101828)}
.brv-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#667085)}
.brv-row{display:flex;align-items:center;gap:8px}
.brv-input{flex:1;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);border-radius:6px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary,#101828);background:var(--dsw-alias-bg-layer-3,#fff)}
.brv-input:disabled{opacity:.6}
.brv-reset{appearance:none;border:0;background:none;color:var(--dsw-alias-brand-primary,#2563eb);font-size:12px;cursor:pointer;padding:4px}
.brv-reset:disabled{opacity:.4;cursor:default}
.brv-badge{flex:none;font-size:12px;padding:2px 8px;border-radius:999px}
.brv-badgeSet{color:#067647;background:#d1fadf}
.brv-badgeUnset{color:#b54708;background:#ffecab}
.brv-footer{display:flex;justify-content:flex-end;gap:8px;padding:8px 0 4px}
.brv-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);background:var(--dsw-alias-bg-layer-3,#fff);color:var(--dsw-alias-label-primary,#101828);font:inherit;font-size:13px;padding:6px 14px;border-radius:8px;cursor:pointer}
.brv-btn:disabled{opacity:.5;cursor:default}
.brv-btnPrimary{background:var(--dsw-alias-brand-primary,#2563eb);border-color:var(--dsw-alias-brand-primary,#2563eb);color:#fff}
.brv-failed{font-size:12px;color:#d92d20;margin-right:auto}
`;
    function ensureCss() {
      if (typeof document === 'undefined') return;
      const el = document.querySelector('style[data-plugin=brave-card-css]');
      if (el) return;
      const e = document.createElement('style');
      e.setAttribute('data-plugin', 'brave-card-css');
      e.textContent = CSS;
      document.head.append(e);
    }

    /**
     * Scope + credentials-backed form model. The API key is NOT a settings
     * field: it lives in the credentials domain at `apiKeyEnv` (default
     * BRAVE_API_KEY). The card writes it via api.credentials.set and reads
     * whether one is configured via api.credentials.describe. baseURL/maxUses
     * are ordinary settings fields written through the bound scope.
     */
    class BraveCardController {
      constructor(scope, api) {
        this.scope = scope;
        this.api = api;
        this.credential = { ref: '', configured: false, writable: true };
        this.state = this.project();
        this.listeners = new Set();
        scope.subscribe(() => {
          this.readCredential();
          this.emit();
        });
        this.readCredential();
      }
      subscribe = (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      };
      getState = () => this.state;
      project() {
        const value = this.scope.getSnapshot().value;
        return {
          apiKeyEnv: value?.apiKeyEnv,
          baseURL: value?.baseURL,
          maxUses: value?.maxUses,
          apiKeyConfigured: this.credential.configured,
          apiKeyWritable: this.credential.writable,
        };
      }
      refOf() {
        const declared = this.scope.getSnapshot().value?.apiKeyEnv;
        return declared && declared.length > 0 ? declared : DEFAULT_API_KEY_REF;
      }
      emit() {
        this.state = this.project();
        for (const l of [...this.listeners]) {
          try { l(); } catch (e) { console.error('[web-search-brave] card listener threw:', e); }
        }
      }
      /** Re-read whether the Host holds a credential at the current ref. */
      async readCredential() {
        const ref = this.refOf();
        if (ref !== this.credential.ref) {
          this.credential = { ref, configured: false, writable: true };
          this.emit();
        }
        let response;
        try {
          response = await this.api.credentials.describe({ refs: [ref] });
        } catch (_e) {
          return;
        }
        const view = response?.result?.value?.credentials?.[ref];
        const next = { ref, configured: view?.configured ?? false, writable: view?.writable ?? true };
        if (next.configured !== this.credential.configured || next.writable !== this.credential.writable) {
          this.credential = next;
          this.emit();
        }
      }
      /** Write the staged key to the credentials domain, then re-read status. */
      async writeKey(value) {
        try {
          await this.api.credentials.set({ ref: this.refOf(), value });
        } catch (_e) {
          /* swallow; the re-read reports the truth */
        }
        await this.readCredential();
        return this.credential.configured;
      }
      /** Save all staged edits: key to credentials, baseURL/maxUses to the section. */
      async save(edits) {
        let ok = true;
        // API key: only write when the user typed a non-empty value; empty = leave as-is.
        if (edits.apiKey.trim() !== '') {
          ok = await this.writeKey(edits.apiKey) && ok;
        }
        for (const [field, text] of [['baseURL', edits.baseURL.trim()], ['maxUses', edits.maxUses.trim()]]) {
          try {
            if (text === '') await this.scope.unset(field);
            else await this.scope.set(field, field === 'maxUses' ? Number(text) : text);
          } catch (e) {
            console.error('[web-search-brave] save field failed:', field, e);
            ok = false;
          }
        }
        return ok;
      }
    }

    function seedOf(value) {
      return value === void 0 ? '' : String(value);
    }

    /** One labeled text/number field with a reset-to-default affordance. */
    function Field(props) {
      const { id, label, hint, text, overridden, invalid, numeric, placeholder, overriddenLabel, resetLabel, invalidLabel, onEdit, onReset } = props;
      return React.createElement('div', { className: 'brv-field' },
        React.createElement('label', { className: 'brv-label', htmlFor: id }, label),
        hint ? React.createElement('span', { className: 'brv-hint' }, hint) : null,
        React.createElement('div', { className: 'brv-row' },
          React.createElement('input', {
            id, className: 'brv-input', type: numeric ? 'number' : 'text',
            value: text, placeholder, inputMode: numeric ? 'numeric' : void 0,
            onChange: (e) => onEdit(e.target.value),
          }),
          React.createElement('button', {
            type: 'button', className: 'brv-reset', disabled: !overridden, onClick: onReset,
          }, resetLabel),
        ),
        invalid ? React.createElement('span', { className: 'brv-hint', style: { color: '#d92d20' } }, invalidLabel) : null,
      );
    }

    /** Collapsible card: header (title + description + pending badge) + body (children + footer). */
    function PluginCard(props) {
      const [open, setOpen] = useState(false);
      const { t, titleKey, descriptionKey, state, onSave, onDiscard, children } = props;
      if (!state.available) return null;
      const title = t(titleKey);
      const blocked = !state.dirty || state.invalid || state.saving;
      return React.createElement('li', { className: 'brv-card' + (open ? ' brv-cardOpen' : '') },
        React.createElement('button', {
          type: 'button', className: 'brv-header', 'aria-expanded': open,
          'aria-label': t(open ? 'collapse' : 'expand') + ': ' + title,
          onClick: () => setOpen(!open),
        },
          React.createElement('span', { className: 'brv-headText' },
            React.createElement('span', { className: 'brv-name' }, title),
            React.createElement('span', { className: 'brv-desc' }, t(descriptionKey)),
          ),
          state.dirty ? React.createElement('span', { className: 'brv-pending' }, t('unsaved')) : null,
          React.createElement('span', null, open ? '▲' : '▼'),
        ),
        open ? React.createElement('div', { className: 'brv-body' },
          !state.writable ? React.createElement('p', { className: 'brv-hint', role: 'status' }, t('readOnly')) : null,
          children,
          React.createElement('div', { className: 'brv-footer' },
            state.failed ? React.createElement('p', { className: 'brv-failed', role: 'status' }, t('saveFailed')) : null,
            React.createElement('button', { type: 'button', className: 'brv-btn', disabled: !state.dirty || state.saving, onClick: onDiscard }, t('discard')),
            React.createElement('button', { type: 'button', className: 'brv-btn brv-btnPrimary', disabled: blocked, onClick: onSave }, t(state.saving ? 'saving' : 'save')),
          ),
        ) : null,
      );
    }

    /** The Brave card: API-key (credentials domain) + endpoint + max-uses. */
    function BraveCard(props) {
      const { braveCard, t } = props;
      const state = useSyncExternalStore(braveCard.subscribe, braveCard.getState);
      const [keyDraft, setKeyDraft] = useState('');
      const [baseURLDraft, setBaseURLDraft] = useState(seedOf(state.baseURL));
      const [maxUsesDraft, setMaxUsesDraft] = useState(seedOf(state.maxUses));
      const [saving, setSaving] = useState(false);
      const [failed, setFailed] = useState(false);

      // Reset section-field drafts when the committed section value changes.
      useEffect(() => {
        setBaseURLDraft(seedOf(state.baseURL));
        setMaxUsesDraft(seedOf(state.maxUses));
      }, [state.baseURL, state.maxUses]);

      const seedBaseURL = seedOf(state.baseURL);
      const seedMaxUses = seedOf(state.maxUses);
      const trimmedMax = maxUsesDraft.trim();
      const maxUsesInvalid = trimmedMax !== '' && !(Number.isInteger(Number(trimmedMax)) && Number(trimmedMax) >= 1);

      // Dirty if the user typed a new key, edited a section field, or a prior save failed.
      const keyDirty = keyDraft.trim() !== '';
      const shell = {
        available: true,
        writable: true,
        dirty: keyDirty || baseURLDraft !== seedBaseURL || maxUsesDraft !== seedMaxUses || failed,
        invalid: maxUsesInvalid,
        saving,
        failed,
      };

      return React.createElement(PluginCard, {
        t: (key) => t(key),
        titleKey: 'braveSearchTitle',
        descriptionKey: 'braveSearchDescription',
        state: shell,
        onSave: () => {
          setSaving(true);
          void braveCard.save({ apiKey: keyDraft, baseURL: baseURLDraft, maxUses: maxUsesDraft }).then((ok) => {
            setSaving(false);
            setFailed(!ok);
            if (ok) {
              setKeyDraft('');
              setBaseURLDraft(baseURLDraft.trim());
              setMaxUsesDraft(maxUsesDraft.trim());
            }
          });
        },
        onDiscard: () => {
          setKeyDraft('');
          setBaseURLDraft(seedBaseURL);
          setMaxUsesDraft(seedMaxUses);
          setFailed(false);
        },
      },
        // API key control: credential-backed. Shows configured status; typing a new key stages a write.
        React.createElement('div', { className: 'brv-field' },
          React.createElement('label', { className: 'brv-label', htmlFor: 'brave-section-api-key' }, t('braveApiKey')),
          React.createElement('span', { className: 'brv-hint' }, t('braveApiKeyHint')),
          React.createElement('div', { className: 'brv-row' },
            React.createElement('input', {
              id: 'brave-section-api-key', className: 'brv-input', type: 'password',
              value: keyDraft, placeholder: state.apiKeyConfigured ? '••••••••' : t('braveApiKeyPlaceholder'),
              onChange: (e) => { setKeyDraft(e.target.value); setFailed(false); },
            }),
            React.createElement('span', {
              className: 'brv-badge ' + (state.apiKeyConfigured ? 'brv-badgeSet' : 'brv-badgeUnset'),
            }, state.apiKeyConfigured ? t('braveApiKeySet') : t('braveApiKeyUnset')),
          ),
        ),
        React.createElement(Field, {
          id: 'brave-section-endpoint', label: t('braveBaseUrl'), hint: t('braveBaseUrlHint'),
          overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'),
          text: baseURLDraft, overridden: state.baseURL !== void 0, invalid: false,
          placeholder: 'https://api.search.brave.com/res/v1',
          onEdit: (text) => { setBaseURLDraft(text); setFailed(false); },
          onReset: () => { setBaseURLDraft(''); setFailed(false); },
        }),
        React.createElement(Field, {
          id: 'brave-section-max-uses', label: t('braveMaxUses'), hint: t('braveMaxUsesHint'),
          overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'),
          numeric: true, text: maxUsesDraft, overridden: state.maxUses !== void 0, invalid: maxUsesInvalid,
          placeholder: '8',
          onEdit: (text) => { setMaxUsesDraft(text); setFailed(false); },
          onReset: () => { setMaxUsesDraft(''); setFailed(false); },
        }),
      );
    }

    /** Locale strings (zh/en). The slot renderer binds `t` from this namespace. */
    const zh = {
      braveSearchTitle: 'Brave 搜索',
      braveSearchDescription: 'Brave Search API 搜索提供方。',
      braveApiKey: 'API Key',
      braveApiKeyHint: '写入 BRAVE_API_KEY 凭据;留空则保持现有 key 不变。',
      braveApiKeyPlaceholder: '粘贴新的 Brave API key',
      braveApiKeySet: '已设置',
      braveApiKeyUnset: '未设置',
      braveBaseUrl: '接口地址',
      braveBaseUrlHint: '留空使用默认 https://api.search.brave.com/res/v1',
      braveMaxUses: '默认结果条数',
      braveMaxUsesHint: '留空使用默认值 8。',
      overridden: '已覆盖',
      reset: '恢复默认',
      invalidNumber: '请填数字;留空表示使用默认值。',
      save: '保存',
      discard: '放弃修改',
      saving: '保存中…',
      saveFailed: '保存失败',
      unsaved: '未保存',
      readOnly: '只读',
      collapse: '收起',
      expand: '展开',
    };
    const en = {
      braveSearchTitle: 'Brave Search',
      braveSearchDescription: 'The Brave Search API provider.',
      braveApiKey: 'API Key',
      braveApiKeyHint: 'Writes the BRAVE_API_KEY credential; leave blank to keep the current key.',
      braveApiKeyPlaceholder: 'Paste a new Brave API key',
      braveApiKeySet: 'Set',
      braveApiKeyUnset: 'Not set',
      braveBaseUrl: 'Endpoint',
      braveBaseUrlHint: 'Leave blank for the default https://api.search.brave.com/res/v1',
      braveMaxUses: 'Default result count',
      braveMaxUsesHint: 'Leave blank for the default of 8.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      invalidNumber: 'Enter a number, or leave blank to use the default.',
      save: 'Save',
      discard: 'Discard',
      saving: 'Saving…',
      saveFailed: 'Save failed',
      unsaved: 'Unsaved',
      readOnly: 'Read only',
      collapse: 'Collapse',
      expand: 'Expand',
    };

    const name = 'web-search-brave';
    const inject = ['slots', 'locale', 'settingsScope', 'connection', 'remote'];
    function apply(ctx) {
      ensureCss();
      const { api } = ctx.get('connection');
      const controller = new BraveCardController(ctx.settingsScope.bind({ namespace: NS }), api);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-search-brave: section locale');
      // Live-update the configured badge when the credential changes elsewhere.
      ctx.effect(() => ctx.remote.$on('credentials/updated', (ref) => {
        if (ref === controller.refOf()) controller.readCredential();
      }), 'web-search-brave: credential invalidations');
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: NS,
        locale: NS,
        inject: () => ({ braveCard: controller }),
      }, BraveCard));
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  },
});
