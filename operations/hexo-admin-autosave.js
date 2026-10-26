/*
 * kitepop:draft-guard
 *
 * Why this file exists
 * --------------------
 * 2026-10-26: the admin UI accepted keystrokes while every save request was
 * failing with HTTP 500 (a corrupted front matter made hexo-admin throw). The
 * editor showed no error, the user kept writing for ten minutes, refreshed, and
 * the text that never reached the server was gone. Nothing in the browser had
 * persisted it either.
 *
 * This script is loaded by www/index.html and adds two independent safety nets
 * that do not depend on the app's own state:
 *
 *   1. Autosave to localStorage every 2 s, keyed by the post currently open in
 *      the URL hash, keeping the last three snapshots. A refresh, a crash or a
 *      dead network can no longer take the text with it.
 *   2. A loud banner the moment any /admin/api/posts request fails, plus a
 *      beforeunload confirmation, so "it silently did not save" is impossible
 *      to miss.
 *
 * Recovery after a reload: the banner offers the locally stored version, which
 * is inserted into the editor when clicked. Nothing is ever applied silently.
 */
(function () {
  'use strict';

  var PREFIX = 'kitepop:draft:';
  var KEEP = 3;
  var POLL_MS = 2000;

  var state = {
    failing: false,
    lastError: '',
    dirty: false,
    lastSentText: null,
    banner: null
  };

  function key() {
    return PREFIX + (location.hash || '#/');
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(key());
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeStore(list) {
    try {
      localStorage.setItem(key(), JSON.stringify(list.slice(0, KEEP)));
    } catch (e) {
      /* quota or private mode: the banner is still the fallback */
    }
  }

  function cm() {
    var el = document.querySelector('.CodeMirror');
    return el && el.CodeMirror ? el.CodeMirror : null;
  }

  function editorText() {
    var c = cm();
    return c ? c.getValue() : null;
  }

  function setEditorText(text) {
    var c = cm();
    if (!c) return false;
    c.setValue(text);
    if (c.focus) c.focus();
    return true;
  }

  /* ---------- banner ---------- */

  function ensureBanner() {
    if (state.banner && document.body.contains(state.banner)) return state.banner;
    var el = document.createElement('div');
    el.id = 'kitepop-draft-guard';
    el.setAttribute('style', [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'font:14px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif',
      'padding:10px 16px', 'color:#fff', 'background:#b42318',
      'box-shadow:0 2px 12px rgba(0,0,0,.45)', 'display:none',
      'align-items:center', 'gap:12px', 'flex-wrap:wrap'
    ].join(';'));
    document.body.appendChild(el);
    state.banner = el;
    return el;
  }

  function button(label, bg, onClick) {
    var b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', [
      'font:inherit', 'padding:4px 12px', 'border:1px solid rgba(255,255,255,.6)',
      'background:' + bg, 'color:#fff', 'border-radius:6px', 'cursor:pointer'
    ].join(';'));
    b.addEventListener('click', onClick);
    return b;
  }

  function hideBanner() {
    if (state.banner) state.banner.style.display = 'none';
  }

  function showBanner(options) {
    var el = ensureBanner();
    el.textContent = '';
    el.style.background = options.bg || '#b42318';
    el.style.display = 'flex';

    var msg = document.createElement('span');
    msg.textContent = options.message;
    el.appendChild(msg);

    (options.actions || []).forEach(function (a) {
      el.appendChild(button(a.label, a.bg || 'rgba(255,255,255,.16)', a.onClick));
    });

    if (options.dismissable !== false) {
      el.appendChild(button('关闭', 'transparent', hideBanner));
    }
  }

  /* ---------- autosave ---------- */

  // The text the editor showed when this page loaded. Nothing is written to the
  // store until the buffer differs from it, otherwise the first tick after a
  // refresh would overwrite a longer surviving snapshot with the truncated
  // version the server handed back -- which is exactly the data loss this file
  // exists to prevent.
  var baseline = null;

  function snapshot() {
    var text = editorText();
    if (text === null) return;
    if (baseline === null) baseline = text;
    if (text === baseline) return; /* nothing typed yet: keep the old snapshots */

    var list = readStore();
    if (list.length && list[0].text === text) return;
    list.unshift({ text: text, at: Date.now(), hash: location.hash });
    writeStore(list);
  }

  // Longest stored snapshot that still differs from what the editor holds: the
  // most complete version that exists only on this machine.
  function bestLocal(current) {
    var list = readStore();
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item.text !== 'string' || !item.text) continue;
      if (item.text === current) continue;
      if (!best || item.text.length > best.text.length) best = item;
    }
    return best;
  }

  /* ---------- save-failure detection ---------- */

  function noteSaveResult(url, status) {
    if (String(url).indexOf('/admin/api/') < 0) return;
    if (String(url).indexOf('/posts') < 0 && String(url).indexOf('/deploy') < 0) return;

    if (status >= 400) {
      state.failing = true;
      state.lastError = 'HTTP ' + status;
      showBanner({
        message: '⚠️ 保存失败（' + state.lastError + '）：这段内容还在编辑器里，也已自动暂存到本机浏览器。先别关标签页、别刷新，把内容复制到记事本再重试。',
        actions: [{
          label: '下载成 .md 文件',
          bg: 'rgba(255,255,255,.28)',
          onClick: downloadDraft
        }]
      });
    } else {
      state.failing = false;
      state.lastError = '';
      state.lastSentText = editorText();
      state.dirty = false;
    }
  }

  function downloadText(text, name) {
    if (!text) return;
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function downloadDraft() {
    downloadText(
      editorText(),
      'kitepop-draft-' + new Date().toISOString().replace(/[:.]/g, '-') + '.md'
    );
  }

  if (window.fetch && !window.fetch.__kitepopGuard) {
    var rawFetch = window.fetch;
    var guarded = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return rawFetch.apply(this, arguments).then(function (res) {
        try { noteSaveResult(url, res.status); } catch (e) {}
        return res;
      });
    };
    guarded.__kitepopGuard = true;
    window.fetch = guarded;
  }

  if (window.XMLHttpRequest && !XMLHttpRequest.prototype.__kitepopGuard) {
    var rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__kitepopUrl = url;
      this.addEventListener('loadend', function () {
        try { noteSaveResult(this.__kitepopUrl, this.status || 0); } catch (e) {}
      });
      return rawOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__kitepopGuard = true;
  }

  /* ---------- offer the local snapshot after a reload ---------- */

  var offeredFor = null;

  function offerRestore() {
    if (state.failing) return; /* the error banner has priority */

    var current = editorText();
    if (current === null) return; /* editor not mounted yet */

    var local = bestLocal(current);
    if (!local) return;
    if (offeredFor === local.at) return;
    if (current && current.length > local.text.length) return; /* editor already ahead */

    offeredFor = local.at;
    var when = new Date(local.at).toLocaleString();
    showBanner({
      bg: '#1d4ed8',
      message: '本机自动暂存里有一份更完整的版本（' + local.text.length + ' 字，' + when +
        '），比编辑器里现在的内容多 ' + (local.text.length - current.length) + ' 字。',
      actions: [{
        label: '恢复到编辑器',
        bg: 'rgba(255,255,255,.28)',
        onClick: function () {
          if (setEditorText(local.text)) {
            baseline = local.text; /* do not re-store what is already stored */
            showBanner({ bg: '#15803d', message: '已恢复本地版本，请检查后重新保存/发布。' });
          }
        }
      }, {
        label: '下载 .md',
        onClick: function () { downloadText(local.text, 'kitepop-draft-recovered.md'); }
      }]
    });
  }

  /* ---------- guards ---------- */

  window.addEventListener('beforeunload', function (e) {
    if (state.failing) {
      e.preventDefault();
      e.returnValue = '上次保存没有成功，本地已自动暂存，但仍然建议先复制内容。';
      return e.returnValue;
    }
  });

  setInterval(function () {
    try {
      snapshot();
      offerRestore();
    } catch (e) {}
  }, POLL_MS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(offerRestore, 1500); });
  } else {
    setTimeout(offerRestore, 1500);
  }
})();
