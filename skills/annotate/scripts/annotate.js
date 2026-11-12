/*!
 * annotate.js — Cursor Annotate 风格的页面标注 · 原型（spike，一次性演示代码）
 *
 * 注入方式：console 粘贴 / CDP evaluate_script / <script src>
 * 注入完成值：{ ok, restored, url, uiPresent, selected } —— CDP 一次调用即完成注入与状态确认
 * 交互：hover 高亮 → 点击选中（多选，再点同元素取消）→ 右下面板填注释 → 完成
 * 导出：window.__annotations__ = { url, capturedAt, items[] }
 * API ：__annotate.show() 重开 / __annotate.done() 导出并结束 / __annotate.clear() 清空并结束
 */
(() => {
  const Z = 2147483647;
  const UI_ID = '__annotate_ui';
  if (window.__annotate__) {
    window.__annotate__.show();
    return { ok: true, restored: true, url: location.href, uiPresent: !!document.getElementById(UI_ID), selected: window.__annotate__.items().length };
  }

  const state = { on: false, items: [], hoverEl: null };
  const listeners = [];

  /* ---------- helpers ---------- */
  const inUI = (el) => !!(el && el.closest && el.closest('#' + UI_ID));
  const isOwn = (el) => inUI(el) || !!(el && el.classList && Array.from(el.classList).some(c => c.indexOf(UI_ID) === 0));
  const squeeze = (s, n) => (s || '').trim().replace(/\s+/g, ' ').slice(0, n);

  const describe = (el) => {
    const t = el.tagName.toLowerCase();
    const c = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return t + c;
  };

  function buildSelector(el) {
    const count = (s) => document.querySelectorAll(s).length;
    if (el.id && count('#' + CSS.escape(el.id)) === 1) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.id && count('#' + CSS.escape(cur.id)) === 1) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      let seg = cur.tagName.toLowerCase();
      const p = cur.parentElement;
      if (p) {
        const kids = Array.from(p.children);
        if (kids.filter(k => k.tagName === cur.tagName).length > 1) {
          seg += ':nth-child(' + (kids.indexOf(cur) + 1) + ')';
        }
      }
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ') || 'body';
  }

  const STYLE_KEYS = ['borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'boxShadow', 'padding', 'border'];
  const snapStyles = (el) => { const cs = getComputedStyle(el), o = {}; STYLE_KEYS.forEach(k => o[k] = cs[k]); return o; };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /* ---------- overlay DOM（一次性创建，activate/deactivate 复用） ---------- */
  let style, ui, rowsBox, countEl, hoverBox, hoverTip;

  function el(tag, cls, cssText) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (cssText) n.style.cssText = cssText;
    return n;
  }

  function buildOnce() {
    if (style) return;
    style = el('style', '');
    style.textContent = [
      '#' + UI_ID + ' *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"PingFang SC",sans-serif}',
      '#' + UI_ID + '{position:fixed;right:16px;bottom:16px;z-index:' + Z + ';width:320px;max-height:46vh;display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden}',
      '#' + UI_ID + ' .hd{padding:10px 14px;background:#4f46e5;color:#fff;font-size:13px;font-weight:600}',
      '#' + UI_ID + ' .hint{padding:6px 14px;font-size:11px;color:#9ca3af;border-bottom:1px solid #f3f4f6}',
      '#' + UI_ID + ' .rows{overflow:auto;flex:1}',
      '#' + UI_ID + ' .row{display:flex;gap:8px;align-items:flex-start;padding:8px 14px;border-bottom:1px solid #f9fafb}',
      '#' + UI_ID + ' .idx{flex:none;width:18px;height:18px;border-radius:50%;background:#4f46e5;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;margin-top:2px}',
      '#' + UI_ID + ' .tag{font-size:11px;color:#6b7280;word-break:break-all;margin-top:3px;width:88px;flex:none}',
      '#' + UI_ID + ' input{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px;outline:none}',
      '#' + UI_ID + ' input:focus{border-color:#4f46e5}',
      '#' + UI_ID + ' .ft{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #f3f4f6}',
      '#' + UI_ID + ' button{flex:1;border:none;border-radius:7px;padding:7px 0;font-size:12px;cursor:pointer}',
      '#' + UI_ID + ' .clear{background:#f3f4f6;color:#374151}',
      '#' + UI_ID + ' .done{background:#4f46e5;color:#fff;font-weight:600}',
      '.' + UI_ID + '_box{position:fixed;z-index:' + Z + ';pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,.08);border-radius:2px}',
      '.' + UI_ID + '_sel{position:fixed;z-index:' + Z + ';pointer-events:none;border:2px solid #4f46e5;background:rgba(79,70,229,.06);border-radius:2px}',
      '.' + UI_ID + '_tip{position:fixed;z-index:' + Z + ';pointer-events:none;background:#111827;color:#fff;font-size:11px;padding:3px 8px;border-radius:5px;white-space:nowrap}',
      '.' + UI_ID + '_badge{position:fixed;z-index:' + Z + ';pointer-events:none;width:20px;height:20px;border-radius:50%;background:#4f46e5;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)}'
    ].join('\n');

    hoverBox = el('div', UI_ID + '_box');
    hoverBox.style.display = 'none';
    hoverTip = el('div', UI_ID + '_tip');
    hoverTip.style.display = 'none';

    ui = el('div');
    ui.id = UI_ID;
    ui.innerHTML =
      '<div class="hd">标注模式 · 已选 <span class="ct">0</span> 处</div>' +
      '<div class="hint">点击页面元素选中（再点取消），在下方填写修改意见，点「完成」导出</div>' +
      '<div class="rows"></div>' +
      '<div class="ft"><button class="clear">清除全部</button><button class="done">完成</button></div>';
    rowsBox = ui.querySelector('.rows');
    countEl = ui.querySelector('.ct');
    ui.querySelector('.done').addEventListener('click', () => window.__annotate__.done());
    ui.querySelector('.clear').addEventListener('click', () => window.__annotate__.clear());
  }

  /* ---------- items ---------- */
  function placeItem(item) {
    const r = item._el.getBoundingClientRect();
    item._box.style.left = (r.x - 2) + 'px';
    item._box.style.top = (r.y - 2) + 'px';
    item._box.style.width = (r.width + 4) + 'px';
    item._box.style.height = (r.height + 4) + 'px';
    item._badge.style.left = Math.max(2, r.x - 10) + 'px';
    item._badge.style.top = Math.max(2, r.y - 10) + 'px';
  }
  function placeAll() { state.items.forEach(placeItem); }

  function addItem(target) {
    const item = {
      n: state.items.length + 1,
      _el: target,
      note: '',
      tag: describe(target),
      selector: buildSelector(target),
      text: squeeze(target.textContent, 60),
      rect: rectOf(target),
      outerHTML: squeeze(target.outerHTML, 200),
      styles: snapStyles(target),
    };
    state.items.push(item);
    item._box = el('div', UI_ID + '_sel');
    item._badge = el('div', UI_ID + '_badge');
    item._badge.textContent = item.n;
    document.documentElement.append(item._box, item._badge);
    placeItem(item);

    const row = el('div', 'row');
    const idx = el('span', 'idx');
    idx.textContent = item.n;
    const tag = el('span', 'tag');
    tag.textContent = item.tag;
    const inp = el('input');
    inp.placeholder = '要改什么？（注释 #' + item.n + '）';
    inp.addEventListener('input', () => { item.note = inp.value; });
    row.append(idx, tag, inp);
    item._row = row;
    item._input = inp;
    rowsBox.append(row);
    countEl.textContent = state.items.length;
  }

  function removeItem(item) {
    item._box.remove();
    item._badge.remove();
    item._row.remove();
    state.items = state.items.filter(i => i !== item);
    state.items.forEach((i, k) => {
      i.n = k + 1;
      i._badge.textContent = i.n;
      i._input.placeholder = '要改什么？（注释 #' + i.n + '）';
      i._row.querySelector('.idx').textContent = i.n;
    });
    countEl.textContent = state.items.length;
  }

  /* ---------- events ---------- */
  function onMove(e) {
    if (!state.on) return;
    const t = e.target;
    if (isOwn(t) || t === document.body || t === document.documentElement) { hideHover(); return; }
    state.hoverEl = t;
    const r = t.getBoundingClientRect();
    hoverBox.style.display = 'block';
    hoverBox.style.left = (r.x - 2) + 'px';
    hoverBox.style.top = (r.y - 2) + 'px';
    hoverBox.style.width = (r.width + 4) + 'px';
    hoverBox.style.height = (r.height + 4) + 'px';
    hoverTip.style.display = 'block';
    hoverTip.textContent = describe(t);
    hoverTip.style.left = Math.max(2, r.x) + 'px';
    hoverTip.style.top = Math.max(2, r.y - 22) + 'px';
  }
  function hideHover() {
    state.hoverEl = null;
    if (hoverBox) { hoverBox.style.display = 'none'; hoverTip.style.display = 'none'; }
  }
  function onClick(e) {
    if (!state.on) return;
    if (isOwn(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const t = e.target;
    if (!t || t === document.body || t === document.documentElement) return;
    const had = state.items.find(i => i._el === t);
    if (had) removeItem(had);
    else addItem(t);
  }
  const blocker = (e) => {
    if (state.on && !isOwn(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  function onKey(e) { if (state.on && e.key === 'Escape') hideHover(); }

  /* ---------- lifecycle ---------- */
  function on(t, ev, fn, cap) {
    t.addEventListener(ev, fn, cap);
    listeners.push([t, ev, fn, cap]);
  }
  function activate() {
    buildOnce();
    state.on = true;
    document.documentElement.append(style, hoverBox, hoverTip, ui);
    on(window, 'scroll', placeAll, true);
    on(window, 'resize', placeAll);
    on(document, 'mousemove', onMove, true);
    on(document, 'click', onClick, true);
    on(document, 'mousedown', blocker, true);
    on(document, 'mouseup', blocker, true);
    on(document, 'dblclick', blocker, true);
    on(document, 'contextmenu', blocker, true);
    on(document, 'keydown', onKey, true);
  }
  function deactivate() {
    state.on = false;
    listeners.forEach(([t, ev, fn, cap]) => t.removeEventListener(ev, fn, cap));
    listeners.length = 0;
    hideHover();
    [style, hoverBox, hoverTip, ui].forEach(n => n && n.remove());
    state.items.forEach(i => {
      if (i._box) i._box.remove();
      if (i._badge) i._badge.remove();
    });
  }
  function snap(i) {
    const { _el, _box, _badge, _row, _input, ...rest } = i;
    return rest;
  }

  window.__annotate__ = {
    show() { deactivate(); state.items = []; activate(); },
    done() {
      const payload = {
        url: location.href,
        capturedAt: new Date().toISOString(),
        items: state.items.map(snap),
      };
      window.__annotations__ = payload;
      console.log('[annotate] 已导出 ' + payload.items.length + ' 条标注 → window.__annotations__');
      if (console.table) console.table(payload.items.map(({ n, tag, selector, note }) => ({ n, tag, selector, note })));
      deactivate();
      state.items = [];
      return payload;
    },
    clear() { deactivate(); state.items = []; },
    items: () => state.items.map(snap),
  };
  activate();
  return { ok: true, restored: false, url: location.href, uiPresent: !!document.getElementById(UI_ID), selected: state.items.length };
})();
