window.__ModuleLoader__.load({
  id: 'dsh-plugin-opencode-go',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    let react = require('react');

    // ------------------------------------------------------------------
    // 用量数据源：轮询 Host 的 /api/opencode-go/usage（同源，无 CORS）
    // ------------------------------------------------------------------
    var POLL_MS = 30000;

    var listeners = new Set();
    var snapshot = { status: 'pending' };
    var started = false;

    function emit() {
      for (var fn of listeners) fn();
    }

    async function poll() {
      try {
        var res = await fetch('/api/opencode-go/usage', {
          headers: { accept: 'application/json' },
        });
        var data = await res.json();
        snapshot = data;
      } catch (error) {
        snapshot = {
          ok: false,
          error: { type: 'NetworkError', message: String(error) },
        };
      }
      emit();
    }

    function ensureStarted() {
      if (started) return;
      started = true;
      void poll();
      window.setInterval(() => void poll(), POLL_MS);
    }

    function subscribe(fn) {
      listeners.add(fn);
      ensureStarted();
      return () => {
        listeners.delete(fn);
      };
    }
    function getSnapshot() {
      return snapshot;
    }

    // ------------------------------------------------------------------
    // 展示辅助
    // ------------------------------------------------------------------
    var WINDOW_LABELS = {
      rolling: '滚动窗口',
      weekly: '本周',
      monthly: '本月',
    };

    function formatClock(iso) {
      var date = new Date(iso);
      if (isNaN(date.getTime())) return '-';
      var hh = String(date.getHours()).padStart(2, '0');
      var mm = String(date.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    }

    function formatCountdown(iso) {
      var ms = new Date(iso).getTime() - Date.now();
      if (isNaN(ms) || ms <= 0) return '即将重置';
      var minutes = Math.floor(ms / 60000);
      if (minutes < 60) return minutes + ' 分钟后';
      var hours = Math.floor(minutes / 60);
      if (hours < 48) return hours + ' 小时后';
      var days = Math.floor(hours / 24);
      return days + ' 天后';
    }

    function formatFetchedAt(ms) {
      if (!ms) return '-';
      var date = new Date(ms);
      var hh = String(date.getHours()).padStart(2, '0');
      var mm = String(date.getMinutes()).padStart(2, '0');
      var ss = String(date.getSeconds()).padStart(2, '0');
      return hh + ':' + mm + ':' + ss;
    }

    function toneOf(percent) {
      if (percent >= 90) return 'danger';
      if (percent >= 70) return 'warn';
      return 'ok';
    }

    var cssTagId = 'dsh-plugin-opencode-go/styles.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTagId) + ']') === null) {
    var css = [
      ".dsh-ocgo{box-sizing:border-box;font-family:inherit}.dsh-ocgo *,.dsh-ocgo *::before,.dsh-ocgo *::after{box-sizing:border-box}",
      ".dsh-ocgo-card{width:100%;max-width:680px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}",
      ".dsh-ocgo-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px}",
      ".dsh-ocgo-title{margin:0;font-size:16px;font-weight:600}",
      ".dsh-ocgo-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap}",
      ".dsh-ocgo-window{display:flex;flex-direction:column;gap:6px}",
      ".dsh-ocgo-window-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}",
      ".dsh-ocgo-window-name{font-size:13px;font-weight:500}",
      ".dsh-ocgo-window-values{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums}",
      ".dsh-ocgo-window-reset{color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".dsh-ocgo-bar{height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}",
      ".dsh-ocgo-bar-fill{height:100%;border-radius:999px;transition:width .4s var(--ds-ease-in-out, ease)}",
      ".dsh-ocgo-bar-fill.ok{background:var(--dsw-alias-state-success-primary)}",
      ".dsh-ocgo-bar-fill.warn{background:var(--dsw-alias-state-warn-primary)}",
      ".dsh-ocgo-bar-fill.danger{background:var(--dsw-alias-state-error-primary)}",
      ".dsh-ocgo-error{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
      ".dsh-ocgo-error b{color:var(--dsw-alias-state-error-primary)}",
      ".dsh-ocgo-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}",
      ".dsh-ocgo-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      ".dsh-ocgo-refresh{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);background:transparent;border-radius:8px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer}",
      ".dsh-ocgo-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-ocgo-badge{display:inline-flex;align-items:center;gap:6px;min-width:0;cursor:default}",
      ".dsh-ocgo-badge-dot{width:8px;height:8px;border-radius:50%;flex:none}",
      ".dsh-ocgo-badge-dot.ok{background:var(--dsw-alias-state-success-primary)}",
      ".dsh-ocgo-badge-dot.warn{background:var(--dsw-alias-state-warn-primary)}",
      ".dsh-ocgo-badge-dot.danger{background:var(--dsw-alias-state-error-primary)}",
      ".dsh-ocgo-badge-label{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-ocgo-badge-label.wide{display:block}",
      ".dsh-ocgo-badge-label.rail{display:none}",
      ".dsh-ocgo-key{display:flex;flex-direction:column;gap:8px}",
      ".dsh-ocgo-key-label{font-size:13px;font-weight:500}",
      ".dsh-ocgo-key-row{display:flex;align-items:center;gap:8px}",
      ".dsh-ocgo-key-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:6px 10px;font:inherit;font-size:12px}",
      ".dsh-ocgo-key-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}",
      ".dsh-ocgo-key-status{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-ocgo-key-status.ok{color:var(--dsw-alias-state-success-primary)}",
      ".dsh-ocgo-sidebar{display:flex;flex-direction:column;gap:8px;width:100%;padding:8px 0}",
      ".dsh-ocgo-mini{display:grid;grid-template-columns:28px 1fr 34px;align-items:center;gap:8px}",
      ".dsh-ocgo-mini-label{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".dsh-ocgo-mini-bar{height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}",
      ".dsh-ocgo-mini-pct{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}",
    ].join('');
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-opencode-go';
      tag.dataset.pluginCss = cssTagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // 组件：密钥来源提示（原生读取 DSH 凭据，不单独记录）
    // ------------------------------------------------------------------
    function KeySource(props) {
      var usage = props.usage;
      var ref = (usage && usage.credentialRef) || 'OPENCODE_GO_API_KEY';
      var source = usage && usage.keySource;
      var text;
      if (source === 'file') text = '密钥已从 DSH 凭据读取（' + ref + ' · .credentials.yaml）';
      else if (source === 'env') text = '密钥已从环境变量读取（' + ref + '）';
      else if (source) text = '密钥已从 ' + ref + ' 读取';
      else text = '未找到密钥 ' + ref + '，请在 DSH 模型设置(Models)中配置，或设置环境变量 ' + ref;
      return react.createElement('div', { className: 'dsh-ocgo-hint' }, text);
    }
    // 组件：设置页完整用量视图
    // ------------------------------------------------------------------
    function UsageWindow(props) {
      var windowKey = props.windowKey;
      var data = props.data;
      var name = WINDOW_LABELS[windowKey] || windowKey;
      var percent = data && typeof data.percent === 'number' ? data.percent : 0;
      var remaining = Math.max(0, 100 - percent);
      var limited = data && data.status === 'rate-limited';
      var tone = limited ? 'danger' : toneOf(percent);
      return react.createElement(
        'div',
        { className: 'dsh-ocgo-window' },
        react.createElement(
          'div',
          { className: 'dsh-ocgo-window-head' },
          react.createElement('span', { className: 'dsh-ocgo-window-name' }, name),
          react.createElement(
            'span',
            { className: 'dsh-ocgo-window-values' },
            '已用 ' + percent + '% · 剩余 ' + remaining + '%' + (limited ? ' · 已达上限' : ''),
          ),
        ),
        react.createElement(
          'div',
          { className: 'dsh-ocgo-bar' },
          react.createElement('div', {
            className: 'dsh-ocgo-bar-fill ' + tone,
            style: { width: Math.min(100, percent) + '%' },
          }),
        ),
        react.createElement(
          'span',
          { className: 'dsh-ocgo-window-reset' },
          data && data.resetsAt ? '重置时间：' + formatClock(data.resetsAt) + '（' + formatCountdown(data.resetsAt) + '）' : '重置时间：-',
        ),
      );
    }

    function UsageSection(props) {
      var useUsage = props.useUsage;
      var usage = useUsage(function (s) {
        return s;
      });
      var ok = usage && usage.ok;
      var error = usage && usage.error;
      var usageData = ok ? usage.usage : null;

      var rows = [];
      if (usageData) {
        rows.push(react.createElement(UsageWindow, { key: 'rolling', windowKey: 'rolling', data: usageData.rolling }));
        rows.push(react.createElement(UsageWindow, { key: 'weekly', windowKey: 'weekly', data: usageData.weekly }));
        rows.push(react.createElement(UsageWindow, { key: 'monthly', windowKey: 'monthly', data: usageData.monthly }));
      }

      var body;
      if (!ok) {
        var errorMessage = error && error.message ? error.message : '未知错误';
        var errorType = error && error.type ? error.type : '';
        body = react.createElement(
          'div',
          { className: 'dsh-ocgo-error' },
          react.createElement('b', null, '无法获取用量：'),
          ' ' + errorType + (errorType ? ' · ' : '') + errorMessage,
        );
      } else if (!usageData) {
        body = react.createElement('div', { className: 'dsh-ocgo-error' }, '等待数据…');
      } else {
        body = rows;
      }

      return react.createElement(
        'div',
        { className: 'dsh-ocgo-card' },
        react.createElement(
          'div',
          { className: 'dsh-ocgo-header' },
          react.createElement('h3', { className: 'dsh-ocgo-title' }, 'OpenCode Go 用量'),
          react.createElement(
            'span',
            { className: 'dsh-ocgo-meta' },
            ok ? '更新于 ' + formatFetchedAt(usage.fetchedAt) : '未连接',
          ),
        ),
        react.createElement(KeySource, { usage: usage }),
        body,
        react.createElement(
          'div',
          { className: 'dsh-ocgo-footer' },
          react.createElement(
            'span',
            { className: 'dsh-ocgo-meta' },
            '数据来源：opencode.ai/zen/go/v1/usage · 每 ' + Math.round(POLL_MS / 1000) + ' 秒自动刷新',
          ),
          react.createElement(
            'button',
            {
              type: 'button',
              className: 'dsh-ocgo-refresh',
              onClick: () => void poll(),
            },
            '立即刷新',
          ),
        ),
      );
    }

    // ------------------------------------------------------------------
    // 组件：侧边栏底部紧凑指示器（sidebar.footer.action）
    // ------------------------------------------------------------------
    function MiniBar(props) {
      var label = props.label;
      var data = props.data;
      var percent = data && typeof data.percent === 'number' ? data.percent : null;
      var limited = data && data.status === 'rate-limited';
      var tone = limited ? 'danger' : toneOf(percent === null ? 0 : percent);
      return react.createElement(
        'div',
        { className: 'dsh-ocgo-mini' },
        react.createElement('span', { className: 'dsh-ocgo-mini-label' }, label),
        react.createElement(
          'div',
          { className: 'dsh-ocgo-bar dsh-ocgo-mini-bar' },
          react.createElement('div', {
            className: 'dsh-ocgo-bar-fill ' + tone,
            style: { width: Math.min(100, percent === null ? 0 : percent) + '%' },
          }),
        ),
        react.createElement('span', { className: 'dsh-ocgo-mini-pct' }, percent === null ? '-' : percent + '%'),
      );
    }

    function UsageBadge(props) {
      var wide = props.wide;
      var useUsage = props.useUsage;
      var usage = useUsage(function (s) {
        return s;
      });
      var ok = usage && usage.ok;
      var error = usage && usage.error;
      var usageData = ok && usage.usage ? usage.usage : null;

      if (!ok) {
        return react.createElement(
          'span',
          { className: 'dsh-ocgo-badge', title: (error && error.message) || '无法获取用量' },
          react.createElement('span', { className: 'dsh-ocgo-badge-dot danger' }),
          react.createElement('span', { className: 'dsh-ocgo-badge-label ' + (wide ? 'wide' : 'rail') }, wide ? 'Go 未连接' : 'Go'),
        );
      }

      if (!wide) {
        var monthly = usageData.monthly;
        var pct = monthly && typeof monthly.percent === 'number' ? monthly.percent : null;
        var rateLimited = monthly && monthly.status === 'rate-limited';
        return react.createElement(
          'span',
          { className: 'dsh-ocgo-badge', title: 'OpenCode Go 用量：本月已用 ' + (pct === null ? '-' : pct + '%') },
          react.createElement('span', { className: 'dsh-ocgo-badge-dot ' + (rateLimited ? 'danger' : pct === null ? 'ok' : toneOf(pct)) }),
          react.createElement('span', { className: 'dsh-ocgo-badge-label rail' }, 'Go'),
        );
      }

      return react.createElement(
        'div',
        { className: 'dsh-ocgo-sidebar' },
        react.createElement(MiniBar, { label: '滚动', data: usageData.rolling }),
        react.createElement(MiniBar, { label: '本周', data: usageData.weekly }),
        react.createElement(MiniBar, { label: '本月', data: usageData.monthly }),
      );
    }

    // ------------------------------------------------------------------
    // 插件主体
    // ------------------------------------------------------------------
    var inject = ['slots'];

    function apply(ctx) {
      var face = () => ({
        hooks: { usage: { subscribe, getSnapshot } },
      });

      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'opencode-go-usage',
            order: 10,
            inject: face,
          },
          UsageBadge,
        ),
      );

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'opencode-go',
            order: 40,
            label: () => 'OpenCode Go 用量',
            inject: face,
          },
          UsageSection,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});