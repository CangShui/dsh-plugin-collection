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

    /** Stop glyph: a filled rounded square (matches the stop-control convention). */
    function IconStop(props) {
      var size = props.size || 13;
      return jsxRuntime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: props.className,
        children: jsxRuntime.jsx('rect', {
          x: '4',
          y: '4',
          width: '8',
          height: '8',
          rx: '1.6',
          fill: 'currentColor',
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
        '/* Stop Button (high-contrast danger affordance, only shown while paging) */',
        '.dsh-ph-stop-btn{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 45%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 10%, var(--dsw-alias-bg-layer-1));border-radius:8px;height:30px;padding:0 10px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--dsw-alias-state-error-primary, #e5484d);width:100%;transition:background .15s, border-color .15s}',
        '.dsh-ph-stop-btn:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 18%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-error-primary, #e5484d)}',
        '.dsh-ph-stop-btn:active{background:color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 26%, var(--dsw-alias-bg-layer-1))}',
        '.dsh-ph-stop-btn .dsh-ph-btn-icon{color:var(--dsw-alias-state-error-primary, #e5484d)}',
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

    /** Flatten ContentBlock[] or string to preview text. */
    function textOfContent(content) {
      if (!content) return '';
      if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim();
      if (typeof content === 'object' && !Array.isArray(content)) {
        if (typeof content.text === 'string') return content.text.replace(/\s+/g, ' ').trim();
      }
      var parts = [];
      var blocks = Array.isArray(content) ? content : [content];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (!b) continue;
        if (typeof b === 'string') {
          parts.push(b);
        } else if (typeof b === 'object') {
          if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
          else if (b.type === 'image') parts.push('[图片]');
          else if (typeof b.text === 'string') parts.push(b.text);
        }
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /** Collect user prompts from conversation and session snapshots (robust across DSH versions). */
    function collectPrompts(conversation, session) {
      var out = [];
      var hasMore = session ? session.hasMore === true : false;

      // Strategy 1: Modern DSH — conversation.views.get('chat')
      var chat = null;
      if (conversation && conversation.views && typeof conversation.views.get === 'function') {
        try {
          chat = conversation.views.get('chat');
        } catch (_e) {}
      } else if (conversation && conversation.chat) {
        chat = conversation.chat;
      } else if (session && session.chat) {
        chat = session.chat;
      }

      if (chat) {
        // 1a. Iterate chat.order and chat.nodes (exact nodes with DOM keys)
        if (chat.order && chat.nodes && typeof chat.nodes.get === 'function') {
          for (var i = 0; i < chat.order.length; i++) {
            var key = chat.order[i];
            var node = chat.nodes.get(key);
            if (!node) continue;
            var kind = node.kind;
            if (kind === 'user' || kind === 'steering' || kind === 'command') {
              var data = node.data || {};
              var text = '';
              if (kind === 'command') {
                text = data.line || data.raw || (data.command ? '/' + data.command : '[指令]');
              } else {
                text = textOfContent(data.content || node.content);
              }
              var seqVal = data.seq != null ? data.seq : (node.anchorSeq != null ? node.anchorSeq : (node.seq != null ? node.seq : i));
              out.push({
                key: node.key || key,
                seq: seqVal,
                time: data.time || node.time || 0,
                kind: kind,
                text: text,
              });
            }
          }
        }

        // 1b. Fallback: chat.legacy.nodes if order/nodes gave nothing
        if (out.length === 0 && chat.legacy && Array.isArray(chat.legacy.nodes)) {
          for (var j = 0; j < chat.legacy.nodes.length; j++) {
            var ln = chat.legacy.nodes[j];
            if (!ln) continue;
            if (ln.kind === 'user' || ln.kind === 'steering' || ln.kind === 'command') {
              var lnText = ln.kind === 'command'
                ? (ln.line || ln.raw || (ln.command ? '/' + ln.command : '[指令]'))
                : textOfContent(ln.content);
              out.push({
                key: ln.key || null,
                seq: ln.seq != null ? ln.seq : j,
                time: ln.time || 0,
                kind: ln.kind,
                text: lnText,
              });
            }
          }
        }

        // 1c. Fallback: chat.navigation.items()
        if (out.length === 0 && chat.navigation && typeof chat.navigation.items === 'function') {
          try {
            var navItems = chat.navigation.items();
            if (Array.isArray(navItems)) {
              for (var n = 0; n < navItems.length; n++) {
                var ni = navItems[n];
                if (ni && ni.prompt) {
                  out.push({
                    key: ni.anchorKey || null,
                    seq: ni.turn != null ? ni.turn : n,
                    time: 0,
                    kind: 'user',
                    text: String(ni.prompt).trim(),
                  });
                }
              }
            }
          } catch (_e) {}
        }
      }

      // Strategy 2: Fallback to conversation.nodes
      if (out.length === 0 && conversation && Array.isArray(conversation.nodes)) {
        for (var k = 0; k < conversation.nodes.length; k++) {
          var cn = conversation.nodes[k];
          if (!cn) continue;
          if (cn.kind === 'user' || cn.kind === 'steering') {
            out.push({
              key: cn.key || null,
              seq: cn.seq != null ? cn.seq : k,
              time: cn.time || 0,
              kind: cn.kind,
              text: textOfContent(cn.content),
            });
          }
        }
      }

      // Strategy 3: Fallback to session.nodes (legacy DSH architecture)
      if (out.length === 0 && session && Array.isArray(session.nodes)) {
        for (var m = 0; m < session.nodes.length; m++) {
          var sn = session.nodes[m];
          if (!sn) continue;
          if (sn.kind === 'user' || sn.kind === 'steering') {
            out.push({
              key: sn.key || null,
              seq: sn.seq != null ? sn.seq : m,
              time: sn.time || 0,
              kind: sn.kind,
              text: textOfContent(sn.content),
            });
          }
        }
      }

      // Deduplicate by key or seq
      var seen = {};
      var deduped = [];
      for (var d = 0; d < out.length; d++) {
        var item = out[d];
        var uKey = item.key ? 'k:' + item.key : 's:' + item.seq;
        if (seen[uKey]) continue;
        seen[uKey] = true;
        deduped.push(item);
      }

      deduped.sort(function (a, b) {
        return a.seq - b.seq;
      });

      return { prompts: deduped, hasMore: hasMore };
    }

    // ------------------------------------------------------------------
    // DOM jump & highlight
    // ------------------------------------------------------------------

    var SCROLLPORT_SELECTOR = '[data-conversation-scroll]';
    var FLASH_CLASS = 'dsh-ph-flash';

    /** Find rendered DOM element for a given nodeKey or sequence index. */
    function findTargetElement(nodeKey, userIndex, seq) {
      if (typeof document === 'undefined') return null;

      // 1. Try matching by exact key
      if (nodeKey) {
        try {
          var safeKey = String(nodeKey).replace(/["\\]/g, '\\$&');
          var byKey = document.querySelector('[data-chat-flow-key="' + safeKey + '"]') ||
                      document.querySelector('[data-chat-anchor-key="' + safeKey + '"]');
          if (byKey) return byKey;
        } catch (_e) {}

        try {
          var allFlow = document.querySelectorAll('[data-chat-flow-key]');
          for (var i = 0; i < allFlow.length; i++) {
            if (allFlow[i].getAttribute('data-chat-flow-key') === nodeKey) return allFlow[i];
          }
          var allAnchor = document.querySelectorAll('[data-chat-anchor-key]');
          for (var j = 0; j < allAnchor.length; j++) {
            if (allAnchor[j].getAttribute('data-chat-anchor-key') === nodeKey) return allAnchor[j];
          }
        } catch (_e) {}
      }

      // 2. Try matching user-kind elements by index
      try {
        var userItems = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
        if (userIndex !== undefined && userIndex >= 0 && userIndex < userItems.length) {
          return userItems[userIndex];
        }
      } catch (_e) {}

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
          loadThrough: typeof s.loadThrough === 'function' ? function (seq) { return s.loadThrough(seq); } : null,
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
      var useConversation = props.useConversation;
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

      // Refs for cooperative cancellation of the sequential paging loop
      var stopRef = react.useRef(false);
      var pagingCounterRef = react.useRef(0);
      var pagerRef = react.useRef(null);
      var noteTimerRef = react.useRef(null);

      /** Show a transient notice that self-clears, so the idle hint can return. */
      var flashNote = useCallback(function (text) {
        if (noteTimerRef.current !== null) {
          clearTimeout(noteTimerRef.current);
          noteTimerRef.current = null;
        }
        setNote(text);
        noteTimerRef.current = setTimeout(function () {
          noteTimerRef.current = null;
          setNote(null);
        }, 4000);
      }, []);

      var toggleCollapse = useCallback(function () {
        setCollapsed(function (prev) {
          var next = !prev;
          try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          } catch (_e) {}
          return next;
        });
      }, []);

      var session = typeof useSession === 'function' ? useSession(function (s) {
        return s;
      }) : null;
      var conversation = typeof useConversation === 'function' ? useConversation(function (c) {
        return c;
      }) : null;

      var data = collectPrompts(conversation, session);
      var prompts = data.prompts;
      var hasMore = data.hasMore;

      // Filtered prompts
      var filtered = prompts.filter(function (p) {
        if (!search) return true;
        return p.text.toLowerCase().indexOf(search.toLowerCase()) !== -1;
      });

      // Sequential Load All (cooperatively stoppable)
      var loadAll = useCallback(function () {
        var pager = getPager(sessions, sessionId);
        if (!pager) {
          setNote('当前会话不支持继续分页加载');
          return;
        }
        if (paging) return;

        var runId = ++pagingCounterRef.current;
        var isCurrent = function () { return runId === pagingCounterRef.current; };

        pagerRef.current = pager;
        stopRef.current = false;
        setPaging(true);
        setNote(null);
        var pages = 0;
        var maxPages = 400;

        function runNext() {
          // Stale run (superseded by a newer run, or stopped): never issue another page fetch.
          if (!isCurrent() || stopRef.current) {
            setPaging(false);
            pagerRef.current = null;
            return;
          }
          var snap = pager.snapshot();
          if (!snap || snap.openState !== 'open' || !snap.hasMore || pages >= maxPages) {
            setPaging(false);
            pagerRef.current = null;
            return;
          }
          pages++;
          setPageCount(pages);
          pager.loadOlder()
            .then(function () {
              return waitPaging(pager, 15000);
            })
            .then(function (res) {
              // A stop request wins over any in-flight continuation; the in-flight
              // page already issued cannot be revoked, but no further page starts.
              if (!isCurrent() || stopRef.current) {
                setPaging(false);
                pagerRef.current = null;
                return;
              }
              if (res === 'done' || res === 'timeout') {
                setPaging(false);
                pagerRef.current = null;
              } else {
                runNext();
              }
            })
            .catch(function () {
              setPaging(false);
              pagerRef.current = null;
              if (isCurrent()) setNote('加载过程中断');
            });
        }
        runNext();
      }, [sessions, sessionId, paging]);

      // Stop the sequential Load All: no further pages are requested; the
      // in-flight page settles on its own and the button returns to idle.
      var stopLoad = useCallback(function () {
        if (!paging) return;
        pagingCounterRef.current++; // invalidate any in-flight continuation
        stopRef.current = true;
        pagerRef.current = null;
        setPaging(false);
        flashNote('已停止加载（已加载部分保留）');
      }, [paging, flashNote]);

      // Reset the stop flag when the Session changes so a fresh session starts clean.
      useEffect(function () {
        pagingCounterRef.current++;
        stopRef.current = false;
        pagerRef.current = null;
        setPaging(false);
        setPageCount(0);
        setNote(null);
      }, [sessionId]);

      // Clear the transient notice timer on unmount.
      useEffect(function () {
        return function () {
          if (noteTimerRef.current !== null) {
            clearTimeout(noteTimerRef.current);
            noteTimerRef.current = null;
          }
        };
      }, []);

      // Jump to a specific prompt
      var handleJump = useCallback(function (p, userIdx) {
        var seq = p.seq;
        var nodeKey = p.key;
        setActiveSeq(seq);

        var el = findTargetElement(nodeKey, userIdx, seq);
        if (el) {
          scrollToAndHighlight(el);
          setNote(null);
        } else {
          var pager = getPager(sessions, sessionId);
          if (pager && typeof pager.loadThrough === 'function' && seq != null) {
            setNote('正在拉取该条历史…');
            pager.loadThrough(seq).then(function () {
              setTimeout(function () {
                var retryEl = findTargetElement(nodeKey, userIdx, seq);
                if (retryEl) {
                  scrollToAndHighlight(retryEl);
                  setNote(null);
                } else {
                  setNote('该条输入尚未载入到可视区域，请先「加载全部」');
                }
              }, 120);
            }).catch(function () {
              setNote('该条输入尚未载入到可视区域，请先「加载全部」');
            });
          } else {
            setNote('该条输入尚未载入到可视区域，请先「加载全部」');
          }
        }
      }, [sessions, sessionId]);

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
                paging
                  ? jsxRuntime.jsxs('button', {
                      type: 'button',
                      className: 'dsh-ph-stop-btn',
                      title: '停止加载（保留已加载部分）',
                      onClick: stopLoad,
                      children: [
                        jsxRuntime.jsx('span', {
                          className: 'dsh-ph-btn-icon',
                          children: jsxRuntime.jsx(IconStop, { size: 13 }),
                        }),
                        jsxRuntime.jsx('span', { children: '停止加载' }),
                      ],
                    })
                  : null,
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
                        onClick: function () { handleJump(p, idx); },
                        children: [
                          jsxRuntime.jsxs('div', {
                            className: 'dsh-ph-item-meta',
                            children: [
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-idx', children: '#' + (idx + 1) }),
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-dot' }),
                              jsxRuntime.jsx('span', { className: 'dsh-ph-item-time', children: formatTime(p.time) }),
                              p.kind === 'steering'
                                ? jsxRuntime.jsx('span', { className: 'dsh-ph-item-kind', children: '插话' })
                                : p.kind === 'command'
                                  ? jsxRuntime.jsx('span', { className: 'dsh-ph-item-kind', children: '指令' })
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
                      p.key || p.seq,
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
          function (props) {
            return jsxRuntime.jsx(PromptOutlineDock, Object.assign({}, props, {
              sessions: ctx.sessions,
            }));
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
