/* 器灵契约面板 —— 页面逻辑(vanilla JS,无外部依赖;mermaid 已内联)
 *
 * 宿主通信:优先兼容桥 window.zcode(UI Plugin 页面别名 API,与官方 App 二选一,
 * 见官方 UI_PLUGIN.md「现有 window.zcode 页面」);非宿主环境(浏览器直开调试)
 * 回退 fetch 同目录 panel-data.json。
 */
(function () {
  'use strict';

  var zc = window.zcode || null;

  // ---------- 状态 ----------
  var state = {
    data: null,
    tab: 'contract',        // contract | flow | schemas
    selectedOp: new Set(),  // "method path"
    expandedDiagrams: new Set(),
    tagFilter: null,
    search: '',
    theme: 'light',
    loading: true,
    error: null,
  };

  // ---------- 小工具 ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(x); });
      else el.appendChild(c);
    }
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 宿主桥 ----------
  function applyTheme() {
    var t = 'light';
    try { t = (zc && zc.theme) === 'dark' ? 'dark' : 'light'; } catch (e) { /* 非宿主环境 */ }
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    if (window.mermaid) {
      try {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: t === 'dark' ? 'dark' : 'default' });
      } catch (e) { /* 渲染时再降级 */ }
    }
  }

  function connectBridge() {
    if (!zc) return Promise.resolve();
    try {
      if (typeof zc.ready === 'function') return Promise.resolve(zc.ready()).catch(function () {});
      if (typeof zc.subscribe === 'function') { zc.subscribe(function () { applyTheme(); rerender(); }); return Promise.resolve(); }
    } catch (e) { /* 容忍 */ }
    return Promise.resolve();
  }

  function loadData() {
    if (zc) {
      return connectBridge().then(function () {
        // 首选资源读取(8MiB 上限,每次现算最新);失败再走工具兜底(64KiB)
        try {
          return zc.readResource('ql://panel/data.json').then(function (res) {
            var c = res && res.contents && res.contents[0];
            var text = c && (c.text != null ? c.text : c.blob ? decodeURIComponent(escape(atob(c.blob))) : null);
            if (text) return JSON.parse(text);
            throw new Error('资源内容为空');
          });
        } catch (e) {
          return zc.callTool('ql_panel_data', {}).then(function (r) {
            if (r && r.structuredContent) return r.structuredContent;
            var t = r && r.content && r.content[0] && r.content[0].text;
            return t ? JSON.parse(t) : null;
          });
        }
      });
    }
    // 浏览器直开调试:同目录 panel-data.json(build-panel 可选产出)
    if (typeof fetch === 'function') {
      return fetch('panel-data.json', { cache: 'no-store' }).then(function (resp) {
        if (!resp.ok) throw new Error('panel-data.json 不存在');
        return resp.json();
      });
    }
    return Promise.reject(new Error('无宿主桥且无本地数据'));
  }

  // ---------- $ref 与 schema ----------
  function resolveRef(ref) {
    if (!ref || ref.charAt(0) !== '#' || !state.data || !state.data.contract) return null;
    var node = state.data.contract;
    var parts = ref.replace(/^#\/?/, '').split('/');
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
      node = node && node[k];
      if (node === undefined || node === null) return null;
    }
    return node;
  }

  function refName(ref) {
    var m = /\/([^/]+)$/.exec(ref || '');
    return m ? decodeURIComponent(m[1]) : ref;
  }

  function schemaType(s) {
    if (!s || typeof s !== 'object') return '';
    if (s.$ref) return refName(s.$ref);
    var t = s.type || (s.properties ? 'object' : s.items ? 'array' : '');
    if (Array.isArray(t)) t = t.join('|');
    var extra = [];
    if (s.format) extra.push(s.format);
    if (s.enum) extra.push('enum');
    return t + (extra.length ? '(' + extra.join(',') + ')' : '');
  }

  var SCHEMA_DEPTH_CAP = 6;

  function schemaTree(s, name, depth, required) {
    var row = h('div', { class: 'st-row' });
    if (name !== null) row.appendChild(h('span', { class: 'st-key', text: name + (required ? ' *' : '') + ':' }));
    if (s === null || s === undefined) {
      row.appendChild(h('span', { class: 'st-note', text: '任意' }));
      return row;
    }
    if (s.$ref) {
      var refEl = h('span', { class: 'st-ref', text: refName(s.$ref), title: s.$ref });
      var target = s.$ref;
      refEl.addEventListener('click', function () { jumpToSchema(target); });
      row.appendChild(refEl);
      return row;
    }
    row.appendChild(h('span', { class: 'st-type', text: schemaType(s) }));
    if (s.description) row.appendChild(h('span', { class: 'st-note', text: String(s.description).slice(0, 80) }));

    var wrap = h('div', {});
    var container = h('ul', { class: 'schema-tree' });
    var kids = [];

    if (s.enum && Array.isArray(s.enum)) {
      kids.push(h('div', { class: 'st-row' }, h('span', { class: 'st-note', text: '枚举: ' + s.enum.map(function (x) { return JSON.stringify(x); }).join(' | ') })));
    }
    var subSchemas = [];
    ['allOf', 'anyOf', 'oneOf'].forEach(function (kw) {
      if (Array.isArray(s[kw])) s[kw].forEach(function (sub, i) { subSchemas.push([kw + '[' + i + ']', sub]); });
    });
    if (s.type === 'object' || s.properties) {
      var props = s.properties || {};
      var reqSet = new Set(Array.isArray(s.required) ? s.required : []);
      Object.keys(props).forEach(function (pn) { subSchemas.push([pn, props[pn], reqSet.has(pn)]); });
      if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        subSchemas.push(['<additionalProperties>', s.additionalProperties]);
      }
    }
    if (s.type === 'array' && s.items) {
      subSchemas.push(['[items]', s.items]);
    }

    if (depth >= SCHEMA_DEPTH_CAP && (subSchemas.length || kids.length)) {
      row.appendChild(h('span', { class: 'st-note', text: '(层级过深,已省略)' }));
      wrap.appendChild(row);
      return wrap;
    }
    subSchemas.forEach(function (entry) {
      kids.push(h('li', {}, schemaTree(entry[1], entry[0], depth + 1, entry[2])));
    });
    if (!kids.length) { wrap.appendChild(row); return wrap; }
    kids.forEach(function (k) { container.appendChild(k); });
    wrap.appendChild(row);
    wrap.appendChild(container);
    return wrap;
  }

  function schemaBlock(schema, title) {
    var card = h('div', { class: 'ref-anchor' });
    if (title) card.appendChild(h('h4', { text: title }));
    if (!schema) { card.appendChild(h('span', { class: 'st-note', text: '(未声明)' })); return card; }
    if (schema.$ref) {
      var resolved = resolveRef(schema.$ref);
      var el = h('span', { class: 'st-ref', text: refName(schema.$ref), title: schema.$ref });
      var t = schema.$ref;
      el.addEventListener('click', function () { jumpToSchema(t); });
      card.appendChild(h('div', { class: 'st-row' }, el));
      if (resolved) card.appendChild(schemaTree(resolved, null, 1));
      return card;
    }
    card.appendChild(schemaTree(schema, null, 0));
    return card;
  }

  function jumpToSchema(ref) {
    state.tab = 'schemas';
    rerender();
    requestAnimationFrame(function () {
      var el = document.getElementById('schema-' + refName(ref));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---------- 契约视图 ----------
  function paramRow(p) {
    var s = p.schema || {};
    var type = s.$ref ? refName(s.$ref) : schemaType(s);
    var tr = h('tr', { class: p.required ? 'req' : '' });
    tr.appendChild(h('td', { text: p.name || '?' }));
    tr.appendChild(h('td', { text: p.in || '' }));
    tr.appendChild(h('td', { text: p.required ? '是' : '' }));
    tr.appendChild(h('td', {}));
    tr.lastChild.appendChild(p.$ref
      ? (function () { var e = h('span', { class: 'st-ref', text: type }); e.addEventListener('click', function () { jumpToSchema(p.$ref); }); return e; })()
      : h('span', { class: 'st-type', text: type }));
    tr.appendChild(h('td', { text: p.description || '' }));
    return tr;
  }

  function operationDetail(op) {
    var box = h('div', { class: 'ep-detail' });
    if (op.description) box.appendChild(h('p', { class: 'muted', text: op.description }));

    var params = (op.parameters || []).map(function (p) {
      return p && p.$ref ? (resolveRef(p.$ref) || p) : p;
    });
    if (params.length) {
      box.appendChild(h('h4', { text: '参数(' + params.length + ')' }));
      var tbl = h('table', {},
        h('thead', {}, h('tr', {}, h('th', { text: '名称' }), h('th', { text: '位置' }), h('th', { text: '必填' }), h('th', { text: '类型' }), h('th', { text: '说明' }))));
      var tb = h('tbody', {});
      params.forEach(function (p) { tb.appendChild(paramRow(p)); });
      tbl.appendChild(tb);
      box.appendChild(tbl);
    }

    if (op.requestBody) {
      var rb = op.requestBody.$ref ? resolveRef(op.requestBody.$ref) || {} : op.requestBody;
      var content = rb.content || {};
      box.appendChild(h('h4', { text: '请求体' + (rb.required ? '(必填)' : '') }));
      var firstMime = Object.keys(content)[0];
      if (firstMime) {
        box.appendChild(h('div', { class: 'st-note', text: firstMime }));
        box.appendChild(schemaBlock(content[firstMime].schema, null));
      } else {
        box.appendChild(h('span', { class: 'st-note', text: '(未声明内容)' }));
      }
    }

    var responses = op.responses || {};
    var codes = Object.keys(responses);
    if (codes.length) {
      box.appendChild(h('h4', { text: '响应' }));
      var rtbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: '状态' }), h('th', { text: '说明' }), h('th', { text: '结构' }))));
      var rtb = h('tbody', {});
      codes.forEach(function (code) {
        var r = responses[code] || {};
        if (r.$ref) r = resolveRef(r.$ref) || {};
        var tr = h('tr', {});
        tr.appendChild(h('td', { class: 'mono', text: code }));
        tr.appendChild(h('td', { text: r.description || '' }));
        var tdS = h('td', {});
        var rc = r.content || {};
        Object.keys(rc).forEach(function (mime) {
          tdS.appendChild(schemaBlock(rc[mime].schema, mime));
        });
        if (!Object.keys(rc).length) tdS.appendChild(h('span', { class: 'st-note', text: '—' }));
        tr.appendChild(tdS);
        rtb.appendChild(tr);
      });
      rtbl.appendChild(rtb);
      box.appendChild(rtbl);
    }
    return box;
  }

  function contractView() {
    var c = state.data.contract;
    var box = h('div', {});

    // 头卡
    var head = h('div', { class: 'card' });
    var titleLine = h('div', {}, [h('h2', { text: (c.title || '契约') + (c.version ? '  v' + c.version : '') })]);
    head.appendChild(titleLine);
    var metas = [];
    if (c.openapi) metas.push('OpenAPI ' + c.openapi);
    (c.servers || []).forEach(function (s) { metas.push(s.url + (s.description ? '(' + s.description + ')' : '')); });
    if (metas.length) head.appendChild(h('div', { class: 'sub muted', text: metas.join(' · ') }));
    if (c.description) {
      var det = h('details', {}, h('summary', { class: 'muted', text: '契约说明' }));
      det.appendChild(h('pre', { text: c.description }));
      head.appendChild(det);
    }
    box.appendChild(head);

    // 过滤条
    var bar = h('div', { class: 'toolbar' });
    var search = h('input', { type: 'search', placeholder: '搜索路径 / 摘要 / operationId…' });
    search.value = state.search;
    search.addEventListener('input', function () { state.search = search.value.trim().toLowerCase(); rerender(); });
    bar.appendChild(search);
    var chips = h('div', { class: 'toolbar' });
    var tags = collectTags();
    if (tags.length > 1) {
      var all = h('button', { class: 'chip' + (state.tagFilter === null ? ' active' : ''), text: '全部(' + c.operations.length + ')' });
      all.addEventListener('click', function () { state.tagFilter = null; rerender(); });
      chips.appendChild(all);
      tags.forEach(function (t) {
        var n = c.operations.filter(function (o) { return (o.tags[0] || '') === t.name; }).length;
        var ch = h('button', { class: 'chip' + (state.tagFilter === t.name ? ' active' : ''), text: (t.name || '未分组') + '(' + n + ')', title: t.description || '' });
        ch.addEventListener('click', function () { state.tagFilter = state.tagFilter === t.name ? null : t.name; rerender(); });
        chips.appendChild(ch);
      });
    }
    box.appendChild(bar);
    if (chips.childNodes.length) box.appendChild(chips);

    // 分组列表
    var groups = {};
    c.operations.forEach(function (op) {
      var g = (state.tagFilter && op.tags.indexOf(state.tagFilter) >= 0) || (!state.tagFilter) ? (op.tags[0] || '未分组') : null;
      if (!g) return;
      (groups[g] = groups[g] || []).push(op);
    });
    var keys = Object.keys(groups);
    if (!keys.length) {
      box.appendChild(h('div', { class: 'card placeholder', text: '没有匹配的端点' }));
      return box;
    }
    keys.forEach(function (g) {
      var ops = groups[g];
      box.appendChild(h('div', { class: 'ep-group-title', text: g + '(' + ops.length + ')' }));
      ops.forEach(function (op) {
        var key = op.method + ' ' + op.path;
        var match = !state.search
          || op.path.toLowerCase().indexOf(state.search) >= 0
          || String(op.summary || '').toLowerCase().indexOf(state.search) >= 0
          || String(op.operationId || '').toLowerCase().indexOf(state.search) >= 0;
        if (state.search && !match) return;
        var open = state.selectedOp.has(key);
        var row = h('div', { class: 'ep-row' });
        var headEl = h('div', { class: 'ep-head' },
          h('span', { class: 'method m-' + op.method.toLowerCase(), text: op.method }),
          h('span', { class: 'ep-path', text: op.path }),
          h('span', { class: 'ep-summary', text: op.summary || '' }),
          op.deprecated ? h('span', { class: 'deprecated-tag', text: 'deprecated' }) : null);
        headEl.addEventListener('click', function () {
          if (state.selectedOp.has(key)) state.selectedOp.delete(key); else state.selectedOp.add(key);
          rerender();
        });
        row.appendChild(headEl);
        if (open) row.appendChild(operationDetail(op));
        box.appendChild(row);
      });
    });
    return box;
  }

  function collectTags() {
    var c = state.data.contract;
    var seen = {};
    var list = [];
    (c.tags || []).forEach(function (t) { if (t && t.name && !seen[t.name]) { seen[t.name] = 1; list.push(t); } });
    c.operations.forEach(function (o) {
      var g = o.tags[0];
      if (g && !seen[g]) { seen[g] = 1; list.push({ name: g, description: '' }); }
    });
    return list;
  }

  // ---------- 流程图视图 ----------
  function renderDiagram(container, d, idx) {
    var id = 'mmd-' + idx + '-' + Date.now();
    if (!window.mermaid || typeof window.mermaid.render !== 'function') {
      container.appendChild(h('pre', { text: d.code }));
      return;
    }
    try {
      var p = window.mermaid.render(id, d.code);
      Promise.resolve(p).then(function (r) {
        container.innerHTML = '';
        var svg = r.svg;
        if (/^\s*</.test(svg)) container.innerHTML = svg; else container.textContent = svg;
      }).catch(function (e) {
        container.innerHTML = '';
        container.appendChild(h('div', { class: 'st-note', text: '渲染失败(' + String(e && e.message || e).slice(0, 120) + '),显示源码:' }));
        container.appendChild(h('pre', { text: d.code }));
      });
    } catch (e) {
      container.appendChild(h('pre', { text: d.code }));
    }
  }

  function flowView() {
    var f = state.data.flow;
    var box = h('div', {});
    if (f.title) box.appendChild(h('div', { class: 'muted', style: 'margin-bottom:8px', text: f.title }));
    if (!f.diagrams || !f.diagrams.length) {
      box.appendChild(h('div', { class: 'card placeholder', text: 'event-flow.md 中没有 mermaid 图块' }));
      return box;
    }
    f.diagrams.forEach(function (d, i) {
      var card = h('div', { class: 'diagram-card' });
      var headRow = h('div', { class: 'diagram-head' },
        h('h3', { text: d.title }),
        h('span', { class: 'dtype', text: d.type }));
      var srcBtn = h('button', { class: 'link-btn', text: state.expandedDiagrams.has(i) ? '收起源码' : '查看源码' });
      srcBtn.addEventListener('click', function () {
        if (state.expandedDiagrams.has(i)) state.expandedDiagrams.delete(i); else state.expandedDiagrams.add(i);
        rerender();
      });
      headRow.appendChild(srcBtn);
      card.appendChild(headRow);
      var body = h('div', { class: 'diagram-body' });
      body.appendChild(h('div', { class: 'placeholder', text: '渲染中…' }));
      card.appendChild(body);
      if (state.expandedDiagrams.has(i)) card.appendChild(h('pre', { text: d.code }));
      box.appendChild(card);
      setTimeout(function () { renderDiagram(body, d, i); }, 0);
    });
    return box;
  }

  // ---------- schema 视图 ----------
  function schemasView() {
    var comps = (state.data.contract && state.data.contract.components) || {};
    var schemas = comps.schemas || {};
    var names = Object.keys(schemas);
    var box = h('div', {});
    if (!names.length) {
      box.appendChild(h('div', { class: 'card placeholder', text: '契约未声明 components.schemas' }));
      return box;
    }
    var filtered = names.filter(function (n) {
      return !state.search || n.toLowerCase().indexOf(state.search) >= 0;
    });
    var bar = h('div', { class: 'toolbar' });
    var search = h('input', { type: 'search', placeholder: '搜索 schema 名称(' + names.length + ')…' });
    search.value = state.search;
    search.addEventListener('input', function () { state.search = search.value.trim().toLowerCase(); rerender(); });
    bar.appendChild(search);
    box.appendChild(bar);
    filtered.forEach(function (n) {
      var card = h('div', { class: 'card ref-anchor', id: 'schema-' + n });
      card.appendChild(h('h2', { class: 'mono', text: n }));
      card.appendChild(schemaTree(schemas[n], null, 0));
      box.appendChild(card);
    });
    if (!filtered.length) box.appendChild(h('div', { class: 'card placeholder', text: '没有匹配的 schema' }));
    return box;
  }

  // ---------- 整体渲染 ----------
  function statusBadge(st) {
    if (!st) return null;
    var label = { discussing: '讨论中', discussed: '已冻结', skeleton_complete: '骨架完成', verified: '验证通过', verification_failed: '验证失败', reviewed: '评审通过', gaps: '契约缺口', blocked: '受阻', shipped: '已交付' }[st] || st;
    return h('span', { class: 'badge st-' + esc(st), text: label });
  }

  function topbar() {
    var d = state.data;
    var bar = h('div', { class: 'topbar' });
    bar.appendChild(h('h1', { text: '器灵契约面板' }));
    if (d && d.state && d.state.found && d.state.status) bar.appendChild(statusBadge(d.state.status));
    var subs = [];
    if (d) {
      if (d.contract.found) subs.push(d.contract.operations.length + ' 端点');
      if (d.flow.found) subs.push(d.flow.diagrams.length + ' 流程图');
      if (d.workspace) subs.push(d.workspace.split(/[\\/]/).pop());
    }
    bar.appendChild(h('span', { class: 'sub', text: subs.join(' · ') }));
    var refresh = h('button', { class: 'btn', text: '刷新' });
    refresh.addEventListener('click', function () { boot(); });
    bar.appendChild(refresh);
    return bar;
  }

  function tabs() {
    var bar = h('div', { class: 'tabs' });
    [
      ['contract', '契约'],
      ['flow', '流程图'],
      ['schemas', 'Schemas'],
    ].forEach(function (t) {
      var b = h('button', { class: 'tab' + (state.tab === t[0] ? ' active' : ''), text: t[1] });
      b.addEventListener('click', function () {
        state.tab = t[0];
        try { if (zc && typeof zc.setWidgetState === 'function') zc.setWidgetState({ tab: t[0] }); } catch (e) { /* 状态非必需 */ }
        rerender();
      });
      bar.appendChild(b);
    });
    return bar;
  }

  function placeholderCard(icon, title, lines) {
    var p = h('div', { class: 'card placeholder' });
    p.appendChild(h('div', { class: 'big', text: icon }));
    p.appendChild(h('h2', { text: title }));
    lines.forEach(function (l) { p.appendChild(h('p', { text: l })); });
    return p;
  }

  function render() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    document.title = '器灵契约面板';

    if (state.loading) {
      app.appendChild(placeholderCard('⏳', '正在读取契约面板数据…', ['从当前工作区 .qiling/planning/ 读取 openapi.yaml 与 event-flow.md']));
      return;
    }
    if (state.error) {
      var ec = h('div', { class: 'card error-card' });
      ec.appendChild(h('h2', { text: '面板数据不可用' }));
      ec.appendChild(h('p', { text: String(state.error.message || state.error) }));
      ec.appendChild(h('p', { class: 'muted', text: '若在浏览器中直接打开,请把面板数据另存为同目录 panel-data.json;正常入口是 ZCode 桌面端(侧栏「器灵契约面板」或让模型调用 ql_design_panel 工具)。' }));
      app.appendChild(ec);
      return;
    }
    var d = state.data;
    if (!d.contract.found && !d.flow.found) {
      app.appendChild(topbar());
      app.appendChild(placeholderCard('🧭', '未找到器灵规划工件', [
        '当前工作区未发现 .qiling/planning/context/openapi.yaml 或 event-flow.md(兼容旧 .planning/ 布局)。',
        '先运行 /ql-design 产出契约与事件流程图,之后刷新本面板即可。',
      ]));
      return;
    }

    app.appendChild(topbar());
    app.appendChild(tabs());
    if (state.tab === 'contract') app.appendChild(contractView());
    else if (state.tab === 'flow') app.appendChild(flowView());
    else app.appendChild(schemasView());

    if (d.errors && d.errors.length) {
      var wc = h('div', { class: 'card error-card' });
      wc.appendChild(h('h2', { text: '解析警告' }));
      d.errors.forEach(function (e) { wc.appendChild(h('p', { text: e })); });
      app.appendChild(wc);
    }
  }

  function rerender() { render(); }

  // ---------- 启动 ----------
  function boot() {
    state.loading = true;
    state.error = null;
    render();
    loadData().then(function (data) {
      state.data = data || { contract: { found: false }, flow: { found: false }, state: { found: false } };
      try { if (zc && zc.widgetState && zc.widgetState.tab) state.tab = zc.widgetState.tab; } catch (e) { /* 忽略 */ }
      state.loading = false;
      applyTheme();
      render();
    }).catch(function (e) {
      state.loading = false;
      state.error = e;
      render();
    });
  }

  applyTheme();
  boot();
})();
