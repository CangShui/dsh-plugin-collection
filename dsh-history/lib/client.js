// dsh-plugin-prompt-history — Client half.
//
// Word-style floating outline / table of contents docked on the right side
// of the conversation scrollport.
//
// Refined with native DSH design language:
//   - Uses DSH native color tokens for perfect dark/light mode contrast.
//   - Zero emojis: uses clean monochrome line SVG icons throughout.
//   - Clear, readable typography matching DSH design specs.
//   - Responsive sequential "Load all older context" button with high contrast.

window.__ModuleLoader__.load({
  id: 'dsh-plugin-prompt-history',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require('react');
    var jsxRuntime = require('react/jsx-runtime');

    // ------------------------------------------------------------------
    // DSH-native line icons (clean SVG, no emojis)
    // ------------------------------------------------------------------
    function IconOutline(props) {
      var size = props.size || 14;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('path', {
          d: 'M2.5 4h11M2.5 8h11M2.5 12h7',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
        }),
      });
    }

    function IconClose(props) {
      var size = props.size || 14;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('path', {
          d: 'M12 4L4 12M4 4l8 8',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
        }),
      });
    }

    function IconDownload(props) {
      var size = props.size || 14;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('path', {
          d: 'M8 2.5v7m0 0l-2.5-2.5M8 9.5l2.5-2.5M3 13.5h10',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      });
    }

    function IconLoading(props) {
      var size = props.size || 14;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: 'dsh-ph-spin ' + (props.className || ''),
        children: jsxRuntime.jsx('circle', {
          cx: '8',
          cy: '8',
          r: '5.5',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeDasharray: '20 12',
          strokeLinecap: 'round',
        }),
      });
    }

    function IconCheck(props) {
      var size = props.size || 14;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('path', {
          d: 'M3.5 8.5l3 3 6.5-6.5',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      });
    }

    function IconSearch(props) {
      var size = props.size || 12;
      return jsxRuntime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: [
          jsxRuntime.jsx('circle', {
            cx: '7',
            cy: '7',
            r: '4.5',
            stroke: 'currentColor',
            strokeWidth: '1.3',
          }),
          jsxRuntime.jsx('path', {
            d: 'M10.5 10.5L14 14',
            stroke: 'currentColor',
            strokeWidth: '1.3',
            strokeLinecap: 'round',
          }),
        ],
      });
    }

    function IconChevronLeft(props) {
      var size = props.size || 12;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('path', {
          d: 'M10 4l-4 4 4 4',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      });
    }

    // ------------------------------------------------------------------
    // styles (strictly DSH-unified color tokens & aesthetics)
    // ------------------------------------------------------------------
    var cssTagId = 'dsh-plugin-prompt-history/styles.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTagId) + ']') === null) {
      var css = [
        '/* Docked Word-style Outline Window */',
        '.dsh-ph-dock{position:fixed;right:16px;top:64px;bottom:100px;width:280px;max-width:calc(100vw - 32px);z-index:25;pointer-events:none;display:flex;flex-direction:column;font-family:var(--dsw-font-family)}',
        '.dsh-ph-dock *,.dsh-ph-dock *::before,.dsh-ph-dock *::after{box-sizing:border-box}',
        '.dsh-ph-card{pointer-events:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.18),0 1px 3px rgba(0,0,0,0.08);display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}',
        '',
        '/* Header */',
        '.dsh-ph-card-head{display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);gap:8px;flex:none}',
        '.dsh-ph-card-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);min-width:0;flex:1}',
        '.dsh-ph-card-icon{color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center}',
        '.dsh-ph-card-badge{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary);padding:1px 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);font-variant-numeric:tabular-nums}',
        '.dsh-ph-card-tools{display:flex;align-items:center;gap:2px;flex:none}',
        '.dsh-ph-icon-btn{border:none;background:transparent;cursor:pointer;color:var(--dsw-alias-label-tertiary);width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:0;transition:all .12s}',
        '.dsh-ph-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
        '',
        '/* Toolbar: Load All Button & Search */',
        '.dsh-ph-toolbar{padding:8px 10px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);flex:none}',
        '.dsh-ph-load-all-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;height:30px;padding:0 10px;font:inherit;font-size:12px;font-weight:400;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--dsw-alias-label-primary);width:100%;transition:background .15s, border-color .15s}',
        '.dsh-ph-load-all-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
        '.dsh-ph-load-all-btn[data-tone="active"]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font-weight:500}',
        '.dsh-ph-load-all-btn[data-tone="active"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
        '.dsh-ph-load-all-btn:disabled{opacity:0.65;cursor:default;color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l1);background:transparent}',
        '.dsh-ph-btn-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-state-business-primary, currentColor)}',
        '.dsh-ph-load-all-btn:disabled .dsh-ph-btn-icon{color:var(--dsw-alias-label-tertiary)}',
        '',
        '/* Search */',
        '.dsh-ph-search-wrap{position:relative;display:flex;align-items:center;width:100%}',
        '.dsh-ph-search-icon{position:absolute;left:8px;color:var(--dsw-alias-label-tertiary);pointer-events:none;display:inline-flex}',
        '.dsh-ph-search{width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:6px;height:26px;padding:0 8px 0 26px;font:inherit;font-size:11px;color:var(--dsw-alias-label-primary);outline:none;transition:border-color .12s}',
        '.dsh-ph-search:focus{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}',
        '.dsh-ph-search::placeholder{color:var(--dsw-alias-label-tertiary)}',
        '',
        '/* Notice Strip */',
        '.dsh-ph-notice{font-size:11px;line-height:16px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}',
        '.dsh-ph-notice[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, var(--dsw-alias-bg-base))}',
        '',
        '/* Outline List */',
        '.dsh-ph-outline-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 0;margin:0;list-style:none}',
        '.dsh-ph-item{display:flex;flex-direction:column;padding:7px 12px;cursor:pointer;position:relative;transition:background .1s;border-left:2px solid transparent;gap:3px}',
        '.dsh-ph-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.dsh-ph-item[data-active="true"]{background:var(--dsw-alias-interactive-bg-active);border-left-color:var(--dsw-alias-label-primary)}',
        '.dsh-ph-item-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:14px;font-variant-numeric:tabular-nums}',
        '.dsh-ph-item-idx{font-weight:500;color:var(--dsw-alias-label-secondary);font-size:11px}',
        '.dsh-ph-item-dot{display:inline-block;width:3px;height:3px;border-radius:50%;background:var(--dsw-alias-border-l3)}',
        '.dsh-ph-item-kind{font-size:10px;padding:0 4px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
        '.dsh-ph-item-text{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}',
        '.dsh-ph-item-text[data-empty="true"]{color:var(--dsw-alias-label-tertiary);font-style:italic}',
        '',
        '/* Minimized Edge Tab */',
        '.dsh-ph-tab{position:fixed;right:0;top:100px;z-index:25;pointer-events:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-right:none;border-radius:8px 0 0 8px;padding:10px 7px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:-2px 4px 16px rgba(0,0,0,0.12);color:var(--dsw-alias-label-secondary);transition:all .15s;font-family:var(--dsw-font-family)}',
        '.dsh-ph-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);transform:translateX(-2px)}',
        '.dsh-ph-tab-text{writing-mode:vertical-rl;letter-spacing:3px;font-weight:500;font-size:12px}',
        '.dsh-ph-tab-badge{font-size:10px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-radius:999px;padding:1px 5px;font-variant-numeric:tabular-nums;line-height:12px}',
        '',
        '/* Empty State */',
        '.dsh-ph-empty-box{padding:28px 12px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
        '',
        '/* Target Row Flash Animation */',
        '@keyframes dsh-ph-pulse{0%{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}50%{box-shadow:0 0 0 5px rgba(120,120,120,0.25)}100%{box-shadow:none}}',
        '.dsh-ph-flash{animation:dsh-ph-pulse 1.4s ease-out;border-radius:8px}',
        '@keyframes dsh-ph-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
        '.dsh-ph-spin{animation:dsh-ph-spin 1s linear infinite;display:inline-block}',
      ].join('\n');
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-prompt-history';
      tag.dataset.pluginCss = cssTagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------------
    // pure helpers
    // ------------------------------------------------------------------

    function pad2(v) {
      return String(v).padStart(2, '0');
    }

    /** Format timestamp into HH:mm:ss, or MM-DD HH:mm if not today. */
    function formatTime(ts) {
      if (typeof ts !== 'number' || !isFinite(ts)) return '';
      var d = new Date(ts);
      var now = new Date();
      var isToday = d.toDateString() === now.toDateString();
      var timePart = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      if (isToday) return timePart;
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    /** Flatten ContentBlock[] to preview text. */
    function textOfContent(content) {
      var parts = [];
      var blocks = content || [];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b && typeof b === 'object') {
          if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
          else if (b.type === 'image') parts.push('[图片]');
        }
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /** Collect user prompts from conversation snapshot. */
    function collectPrompts(snapshot) {
      var out = [];
      if (!snapshot) return { prompts: out, hasMore: false };
      var nodes = snapshot.nodes || [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!n) continue;
        if (n.kind !== 'user' && n.kind !== 'steering') continue;
        var text = textOfContent(n.content);
        out.push({
          seq: n.seq,
          time: n.time,
          kind: n.kind,
          text: text,
        });
      }
      out.sort(function (a, b) {
        return a.seq - b.seq;
      });
      return { prompts: out, hasMore: snapshot.hasMore === true };
    }

    // ------------------------------------------------------------------
    // DOM jump & highlight
    // ------------------------------------------------------------------

    var SCROLLPORT_SELECTOR = '[data-conversation-scroll]';
    var FLASH_CLASS = 'dsh-ph-flash';

    /** Find rendered DOM element for a given nodeKey or sequence index. */
    function findTargetElement(nodeKey, userIndex) {
      if (typeof document === 'undefined') return null;

      // 1. Try matching by exact key
      if (nodeKey) {
        var byKey = document.querySelector('[data-chat-flow-key="' + nodeKey + '"]') ||
                    document.querySelector('[data-chat-anchor-key="' + nodeKey + '"]');
        if (byKey) return byKey;
      }

      // 2. Try matching user-kind elements by index
      var userItems = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
      if (userIndex !== undefined && userIndex >= 0 && userIndex < userItems.length) {
        return userItems[userIndex];
      }

      return null;
    }

    function scrollToAndHighlight(el) {
      if (!el) return false;
      var port = el.closest(SCROLLPORT_SELECTOR) || document.querySelector(SCROLLPORT_SELECTOR);
      if (port) {
        var top = el.getBoundingClientRect().top - port.getBoundingClientRect().top;
        var target = port.scrollTop + top - (port.clientHeight - el.offsetHeight) / 2;
        port.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      el.classList.remove(FLASH_CLASS);
      void el.offsetWidth; // trigger reflow
      el.classList.add(FLASH_CLASS);
      setTimeout(function () {
        el.classList.remove(FLASH_CLASS);
      }, 1500);
      return true;
    }

    // ------------------------------------------------------------------
    // Paging engine
    // ------------------------------------------------------------------

    function getPager(sessions, sessionId) {
      if (!sessions || typeof sessions.binding !== 'function') return null;
      try {
        var b = sessions.binding(sessionId);
        if (!b || !b.session) return null;
        var s = b.session;
        var snap = s.getSnapshot();
        if (!snap || snap.sessionId !== sessionId || snap.subagent) return null;
        return {
          snapshot: function () { return s.getSnapshot(); },
          loadOlder: function () { return s.loadOlder(); },
        };
      } catch (_e) {
        return null;
      }
    }

    function waitPaging(pager, timeoutMs) {
      var start = Date.now();
      return new Promise(function (resolve) {
        function check() {
          var snap = pager.snapshot();
          if (!snap || snap.openState !== 'open' || !snap.hasMore) return resolve('done');
          if (!snap.loadingOlder) return resolve('continue');
          if (Date.now() - start > timeoutMs) return resolve('timeout');
          setTimeout(check, 40);
        }
        setTimeout(check, 30);
      });
    }

    // ------------------------------------------------------------------
    // Word-style Outline Component
    // ------------------------------------------------------------------

    var STORAGE_KEY = 'dsh.prompt-history.dock-collapsed.v1';

    function PromptOutlineDock(props) {
      var useState = react.useState;
      var useEffect = react.useEffect;
      var useCallback = react.useCallback;

      var sessionId = props.sessionId;
      var useSession = props.useSession;
      var sessions = props.sessions;

      // Persistence for minimized/expanded state
      var [collapsed, setCollapsed] = useState(function () {
        try {
          return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_e) {
          return false;
        }
      });
      var [search, setSearch] = useState('');
      var [activeSeq, setActiveSeq] = useState(null);
      var [paging, setPaging] = useState(false);
      var [pageCount, setPageCount] = useState(0);
      var [note, setNote] = useState(null);

      var toggleCollapse = useCallback(function () {
        setCollapsed(function (prev) {
          var next = !prev;
          try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          } catch (_e) {}
          return next;
        });
      }, []);

      var snapshot = useSession(function (s) {
        return s;
      });
      var data = collectPrompts(snapshot);
      var prompts = data.prompts;
      var hasMore = data.hasMore;

      // Filtered prompts
      var filtered = prompts.filter(function (p) {
        if (!search) return true;
        return p.text.toLowerCase().indexOf(search.toLowerCase()) !== -1;
      });

      // Sequential Load All
      var loadAll = useCallback(function () {
        var pager = getPager(sessions, sessionId);
        if (!pager) {
          setNote('当前会话不支持继续分页加载');
          return;
        }
        if (paging) return;
        setPaging(true);
        setNote(null);
        var pages = 0;
        var maxPages = 400;

        function runNext() {
          var snap = pager.snapshot();
          if (!snap || snap.openState !== 'open' || !snap.hasMore || pages >= maxPages) {
            setPaging(false);
            return;
          }
          pages++;
          setPageCount(pages);
          pager.loadOlder()
            .then(function () {
              return waitPaging(pager, 15000);
            })
            .then(function (res) {
              if (res === 'done' || res === 'timeout') {
                setPaging(false);
              } else {
                runNext();
              }
            })
            .catch(function () {
              setPaging(false);
              setNote('加载过程中断');
            });
        }
        runNext();
      }, [sessions, sessionId, paging]);

      // Jump to a specific prompt
      var handleJump = useCallback(function (seq, userIdx) {
        setActiveSeq(seq);
        var nodeKey = null;
        if (snapshot && snapshot.chat && snapshot.chat.order && snapshot.chat.nodes) {
          var order = snapshot.chat.order;
          var store = snapshot.chat.nodes;
          for (var i = 0; i < order.length; i++) {
            var n = store.get(order[i]);
            if (n && n.data && n.data.seq === seq) {
              nodeKey = n.key;
              break;
            }
          }
        }
        var el = findTargetElement(nodeKey, userIdx);
        if (el) {
          scrollToAndHighlight(el);
        } else {
          setNote('该条输入尚未载入到可视区域，请先「加载全部」');
        }
      }, [snapshot]);

      // If collapsed, render the clean edge tab
      if (collapsed) {
        return jsxRuntime.jsxs('div', {
          className: 'dsh-ph-tab',
          title: '展开对话目录 (共 ' + prompts.length + ' 条)',
          onClick: toggleCollapse,
          children: [
            jsxRuntime.jsx(IconChevronLeft, { size: 13 }),
            jsxRuntime.jsx('span', { className: 'dsh-ph-tab-text', children: '目录' }),
            prompts.length > 0
              ? jsxRuntime.jsx('span', { className: 'dsh-ph-tab-badge', children: prompts.length })
              : null,
          ],
        });
      }

      // Expanded Word-style Outline Window
      return jsxRuntime.jsx('div', {
        className: 'dsh-ph-dock',
        children: jsxRuntime.jsxs('div', {
          className: 'dsh-ph-card',
          children: [
            // Head
            jsxRuntime.jsxs('div', {
              className: 'dsh-ph-card-head',
              children: [
                jsxRuntime.jsxs('div', {
                  className: 'dsh-ph-card-title',
                  children: [
                    jsxRuntime.jsx('span', {
                      className: 'dsh-ph-card-icon',
                      children: jsxRuntime.jsx(IconOutline, { size: 14 }),
                    }),
                    jsxRuntime.jsx('span', { children: '对话目录' }),
                    jsxRuntime.jsx('span', { className: 'dsh-ph-card-badge', children: prompts.length }),
                  ],
                }),
                jsxRuntime.jsxs('div', {
                  className: 'dsh-ph-card-tools',
                  children: [
                    jsxRuntime.jsx('button', {
                      type: 'button',
                      className: 'dsh-ph-icon-btn',
                      title: '收起目录',
                      onClick: toggleCollapse,
                      children: jsxRuntime.jsx(IconClose, { size: 14 }),
                    }),
                  ],
                }),
              ],
            }),

            // Toolbar: Load All & Search
            jsxRuntime.jsxs('div', {
              className: 'dsh-ph-toolbar',
              children: [
                jsxRuntime.jsxs('button', {
                  type: 'button',
                  className: 'dsh-ph-load-all-btn',
                  'data-tone': hasMore ? 'active' : 'idle',
                  disabled: paging || !hasMore,
                  onClick: loadAll,
                  children: [
                    jsxRuntime.jsx('span', {
                      className: 'dsh-ph-btn-icon',
                      children: paging
                        ? jsxRuntime.jsx(IconLoading, { size: 13 })
                        : hasMore
                          ? jsxRuntime.jsx(IconDownload, { size: 13 })
                          : jsxRuntime.jsx(IconCheck, { size: 13 }),
                    }),
                    jsxRuntime.jsx('span', {
                      children: paging
                        ? '正在加载第 ' + pageCount + ' 页…'
                        : hasMore
                          ? '加载全部旧上下文'
                          : '已加载全部上下文',
                    }),
                  ],
                }),
                prompts.length > 4
                  ? jsxRuntime.jsxs('div', {
                      className: 'dsh-ph-search-wrap',
                      children: [
                        jsxRuntime.jsx('span', {
                          className: 'dsh-ph-search-icon',
                          children: jsxRuntime.jsx(IconSearch, { size: 12 }),
                        }),
                        jsxRuntime.jsx('input', {
                          type: 'text',
                          className: 'dsh-ph-search',
                          placeholder: '搜索输入内容…',
                          value: search,
                          onChange: function (e) { setSearch(e.target.value); },
                        }),
                      ],
                    })
                  : null,
              ],
            }),

            // Notice
            note
              ? jsxRuntime.jsx('div', { className: 'dsh-ph-notice', 'data-tone': 'warn', children: note })
              : hasMore && !paging
                ? jsxRuntime.jsx('div', { className: 'dsh-ph-notice', children: '长上下文中有更早的历史未加载' })
                : null,

            // Outline List
            filtered.length === 0
              ? jsxRuntime.jsx('div', {
                  className: 'dsh-ph-empty-box',
                  children: prompts.length === 0 ? '暂无输入记录' : '无匹配结果',
                })
              : jsxRuntime.jsx('ul', {
                  className: 'dsh-ph-outline-list',
                  children: filtered.map(function (p, idx) {
                    var isAct = activeSeq === p.seq;
                    var empty = !p.text;
                    return jsxRuntime.jsxs(
                      'li',
                      {
                        className: 'dsh-ph-item',
                        'data-active': isAct ? 'true' : 'false',
                        title: p.text || '（无文本）',
                        onClick: function () { handleJump(p.seq, idx); },
                        children: [
                          jsxRuntime.jsxs('div', {
                            className: 'dsh-ph-item-meta',
                            children: [
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-idx', children: '#' + (idx + 1) }),
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-dot' }),
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-time', children: formatTime(p.time) }),
                              p.kind === 'steering'
                                ? jsxRuntime.jsx('span', { className: 'dsh-ph-item-kind', children: '插话' })
                                : null,
                            ],
                          }),
                          jsxRuntime.jsx('div', {
                            className: 'dsh-ph-item-text',
                            'data-empty': empty ? 'true' : 'false',
                            children: empty ? '（无文本）' : p.text,
                          }),
                        ],
                      },
                      p.seq,
                    );
                  }),
                }),
          ],
        }),
      });
    }

    // ------------------------------------------------------------------
    // Plugin apply
    // ------------------------------------------------------------------
    var inject = ['slots', 'sessions'];

    function apply(ctx) {
      ctx.slots.inject('conversation.session.header.utilities', function () {
        return ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: 'prompt-history', order: 10 },
          function (ownerProps) {
            return jsxRuntime.jsx(PromptOutlineDock, {
              sessionId: ownerProps.sessionId,
              useSession: ownerProps.useSession,
              sessions: ctx.sessions,
            });
          },
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.formatTime = formatTime;
    exports.textOfContent = textOfContent;
    exports.collectPrompts = collectPrompts;
    return module.exports;
  },
});
