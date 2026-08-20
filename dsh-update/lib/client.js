// dsh-plugin-about — Client half.
//
// Registers a "关于" section in the DSH settings panel:
//   * 当前版本 / 最新发布版本 (from the plugin's own /api/about/status route)
//   * 已是最新 / 有新版本 badge, manual re-check button
//   * 一键升级 button -> POST /api/about/upgrade (server-side npm install -g),
//     with a live log tail while the upgrade runs.
//
// Version info is visible from every origin; the upgrade action is loopback
// only (the server enforces it, the UI just mirrors the flag).

window.__ModuleLoader__.load({
  id: 'dsh-plugin-about',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require('react');

    var STATUS_URL = '/api/about/status';
    var UPGRADE_URL = '/api/about/upgrade';

    // ------------------------------------------------------------------
    // styles
    // ------------------------------------------------------------------
    var cssTagId = 'dsh-plugin-about/styles.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTagId) + ']') === null) {
      var css = [
        '.dsh-about{box-sizing:border-box;font-family:inherit;display:flex;flex-direction:column;gap:16px;max-width:680px}',
        '.dsh-about *,.dsh-about *::before,.dsh-about *::after{box-sizing:border-box}',
        '.dsh-about .dsh-about-row{display:flex;flex-direction:column;gap:6px}',
        '.dsh-about .dsh-about-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}',
        '.dsh-about .dsh-about-cards{display:flex;gap:12px;flex-wrap:wrap}',
        '.dsh-about .dsh-about-card{flex:1;min-width:180px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:4px}',
        '.dsh-about .dsh-about-card .dsh-about-k{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
        '.dsh-about .dsh-about-card .dsh-about-v{font-size:20px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;word-break:break-all}',
        '.dsh-about .dsh-about-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:500;align-self:flex-start}',
        '.dsh-about .dsh-about-badge.ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary, #2bb573) 14%, transparent);color:var(--dsw-alias-state-success-primary, #2bb573)}',
        '.dsh-about .dsh-about-badge.new{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary, #e6a700) 16%, transparent);color:var(--dsw-alias-state-warn-primary, #e6a700)}',
        '.dsh-about .dsh-about-badge .dsh-about-dot{width:7px;height:7px;border-radius:50%;background:currentColor}',
        '.dsh-about .dsh-about-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
        '.dsh-about .dsh-about-btn{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);background:transparent;border-radius:8px;padding:6px 16px;font:inherit;font-size:12px;cursor:pointer}',
        '.dsh-about .dsh-about-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
        '.dsh-about .dsh-about-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.dsh-about .dsh-about-btn.primary{background:var(--dsw-alias-button-info-fill, #4176e6);border-color:transparent;color:#fff}',
        '.dsh-about .dsh-about-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover, #679efe)}',
        '.dsh-about .dsh-about-btn.primary:disabled{opacity:.5}',
        '.dsh-about .dsh-about-status{font-size:12px;color:var(--dsw-alias-label-secondary)}',
        '.dsh-about .dsh-about-status.ok{color:var(--dsw-alias-state-success-primary, #2bb573)}',
        '.dsh-about .dsh-about-status.err{color:var(--dsw-alias-state-error-primary, #e5484d)}',
        '.dsh-about .dsh-about-log{margin:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);padding:8px 10px;font:11px/1.6 ui-monospace,Consolas,monospace;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all}',
        '.dsh-about .dsh-about-kv{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
        '.dsh-about .dsh-about-kv b{color:var(--dsw-alias-label-primary);font-weight:500}',
      ].join('');
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-about';
      tag.dataset.pluginCss = cssTagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function el(type, props) {
      var children = Array.prototype.slice.call(arguments, 2);
      return react.createElement.apply(react, [type, props].concat(children));
    }

    function formatTime(ts) {
      if (typeof ts !== 'number' || !isFinite(ts)) return '-';
      try {
        return new Date(ts).toLocaleTimeString();
      } catch (_e) {
        return '-';
      }
    }

    function versionText(v) {
      return typeof v === 'string' && v !== '' ? v : '…';
    }

    // ------------------------------------------------------------------
    // panel
    // ------------------------------------------------------------------
    function AboutPanel(_props) {
      var useState = react.useState;
      var useEffect = react.useEffect;
      var useRef = react.useRef;

      var [state, setState] = useState(null);
      var [loadError, setLoadError] = useState('');
      var [checking, setChecking] = useState(false);
      var [starting, setStarting] = useState(false);
      var logRef = useRef(null);

      var load = function (refresh) {
        var url = refresh === true ? STATUS_URL + '?refresh=1' : STATUS_URL;
        if (refresh === true) setChecking(true);
        return fetch(url, { headers: { accept: 'application/json' } })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (d) {
            setState(d);
            setLoadError('');
          })
          .catch(function (e) {
            setLoadError('无法读取版本信息：' + (e && e.message ? e.message : String(e)));
          })
          .finally(function () {
            if (refresh === true) setChecking(false);
          });
      };

      useEffect(function () {
        load(false);
        var timer = setInterval(function () { load(false); }, 2500);
        return function () {
          clearInterval(timer);
        };
      }, []);

      // keep the log tail scrolled to the newest line
      useEffect(function () {
        var node = logRef.current;
        if (node !== null && node !== undefined) node.scrollTop = node.scrollHeight;
      }, [state && state.upgrade ? state.upgrade.log.length : 0]);

      var upgrade = state ? state.upgrade : null;
      var current = state ? state.current : null;
      var latest = state ? state.latest : null;
      var upToDate = state ? state.upToDate : null;
      var hasNewer = state ? state.hasNewer : null;
      var loopback = state ? state.loopback !== false : true;
      var upgrading = upgrade !== null && upgrade.active === true;

      var startUpgrade = function () {
        setStarting(true);
        fetch(UPGRADE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
          .then(function (r) {
            return r.json().then(function (d) { return { status: r.status, body: d }; });
          })
          .then(function (result) {
            setStarting(false);
            if (result.status >= 400) {
              setLoadError((result.body && result.body.error) ? result.body.error : '升级启动失败（HTTP ' + result.status + '）');
              return;
            }
            load(false);
          })
          .catch(function (e) {
            setStarting(false);
            setLoadError('升级启动失败：' + (e && e.message ? e.message : String(e)));
          });
      };

      var upgradeStatusNode = null;
      if (upgrading) {
        upgradeStatusNode = el('div', { className: 'dsh-about-status' },
          '正在升级…（npm install -g，可能需要 1-2 分钟，此期间请勿关闭页面）');
      } else if (upgrade !== null && upgrade.ok === true) {
        upgradeStatusNode = el('div', { className: 'dsh-about-status ok' },
          upgrade.dryRun === true
            ? '自检完成：npm 命令执行成功（dryRun）。'
            : '升级完成 ✓ 已安装 ' + (latest || '') + '，重启 dsh 后生效（关闭当前 dsh web，再运行 dsh web）。');
      } else if (upgrade !== null && upgrade.ok === false) {
        upgradeStatusNode = el('div', { className: 'dsh-about-status err' },
          '升级失败（' + (upgrade.exitCode === null ? '无法启动' : '退出码 ' + upgrade.exitCode) + '），详见下方日志。');
      }

      var logNode = null;
      if (upgrade !== null && upgrade.log && upgrade.log.length > 0) {
        logNode = el('pre', { className: 'dsh-about-log', ref: logRef }, upgrade.log.join('\n'));
      }

      var badgeNode = null;
      if (upToDate === true) {
        badgeNode = el('span', { className: 'dsh-about-badge ok' }, el('span', { className: 'dsh-about-dot' }), '已是最新版本');
      } else if (hasNewer === true) {
        badgeNode = el('span', { className: 'dsh-about-badge new' }, el('span', { className: 'dsh-about-dot' }), '有新版本可用');
      }

      return el('div', { className: 'dsh-about' },
        el('div', { className: 'dsh-about-cards' },
          el('div', { className: 'dsh-about-card' },
            el('span', { className: 'dsh-about-k' }, '当前版本'),
            el('span', { className: 'dsh-about-v' }, versionText(current)),
            upToDate === true || hasNewer === true ? badgeNode : null,
          ),
          el('div', { className: 'dsh-about-card' },
            el('span', { className: 'dsh-about-k' }, '最新发布版本'),
            el('span', { className: 'dsh-about-v' }, state && state.latestError ? '获取失败' : versionText(latest)),
            el('span', { className: 'dsh-about-muted' },
              state && state.latestError
                ? state.latestError
                : state && state.latestCheckedAt ? '检查于 ' + formatTime(state.latestCheckedAt) : ''),
          ),
        ),
        state && state.latestError
          ? el('div', { className: 'dsh-about-status err' }, '获取最新版本失败：' + state.latestError)
          : null,
        el('div', { className: 'dsh-about-actions' },
          el('button', {
            type: 'button',
            className: 'dsh-about-btn',
            onClick: function () { load(true); },
            disabled: checking,
          }, checking ? '检查中…' : '重新检查'),
          el('button', {
            type: 'button',
            className: 'dsh-about-btn primary',
            onClick: startUpgrade,
            disabled: upgrading || starting || latest === null || latest === undefined,
          }, starting ? '启动中…' : upgrading ? '升级中…' : latest ? '一键升级到 ' + latest : '升级'),
          upToDate === true && !upgrading
            ? el('span', { className: 'dsh-about-muted' }, '当前已是最新版本，也可点此重新安装。')
            : null,
          !loopback
            ? el('span', { className: 'dsh-about-muted' }, '升级仅限从本机（127.0.0.1）打开的页面操作。')
            : null,
        ),
        loadError ? el('div', { className: 'dsh-about-status err' }, loadError) : null,
        upgradeStatusNode,
        logNode,
        el('div', { className: 'dsh-about-kv' },
          state && state.installPath ? el('div', null, '安装位置：', el('b', null, state.installPath)) : null,
          state && state.node ? el('div', null, 'Node 版本：', el('b', null, state.node)) : null,
          state && state.registry ? el('div', null, 'Registry：', el('b', null, state.registry)) : null,
          el('div', null, '升级命令：', el('b', null, 'npm install -g @deepseek-ai/dsh@latest')),
        ),
        el('div', { className: 'dsh-about-muted' },
          '升级在后台执行 npm install -g，完成后需重启 dsh 才会生效；升级过程中当前会话不受影响。',
          'npm 结束时出现的「EPERM … .dsh-xxxx」清理警告可以忽略（运行中的旧进程锁定文件所致），重启 dsh 后可手动删除残留目录。'),
      );
    }

    // ------------------------------------------------------------------
    // plugin apply: register the settings section
    // ------------------------------------------------------------------
    function apply(ctx) {
      if (!ctx.slots) return;
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'about', order: 60, label: function () { return '关于'; } },
          AboutPanel,
        );
      });
    }

    exports.apply = apply;
    exports.inject = ['slots'];
    return module.exports;
  },
});
